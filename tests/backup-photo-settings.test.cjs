const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const optimizerSource=fs.readFileSync(path.join(root,'public/photo-optimizer.js'),'utf8');
const zipSource=fs.readFileSync(path.join(root,'public/zip-backup.js'),'utf8');
const photoCtx=vm.createContext({Blob,console,window:{}});
vm.runInContext(optimizerSource,photoCtx);
const Photos=photoCtx.window.VerdantPhotos;
const zctx=vm.createContext({Blob,Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,Date,globalThis:{}});
vm.runInContext(zipSource,zctx);
const Zip=zctx.globalThis.VerdantZip;
const defaults={id:'photoOptimization',targetKB:300,maxDimension:1600,format:'image/jpeg'};
const webp={id:'photoOptimization',targetKB:550,maxDimension:2400,format:'image/webp'};
function plain(v){return JSON.parse(JSON.stringify(v));}
function zipFrom(entries){const parts=[];return Zip.writeZip({async write(b){parts.push(b.slice())},async close(){}},entries).then(()=>new Blob(parts,{type:'application/zip'}));}
const imageBytes=Uint8Array.from([255,216,255,219,1,2,3,4,5,6,255,217]);
const blob=new Blob([imageBytes],{type:'image/jpeg'});
const photo={id:'photo1',name:'original.jpg',mimeType:'image/jpeg',createdAt:'2026-10-30T12:00:00Z',blob};
const photoMeta={id:'photo1',name:'original.jpg',mimeType:'image/jpeg',createdAt:'2026-10-30T12:00:00Z',path:'images/00001.bin'};
function gardenData(settings){return {plants:[],plantTypes:[],images:[photoMeta],settings};}
function backupObj(settings){return {format:'verdant-garden-backup',schemaVersion:2,exportedAt:'2026-10-30T12:00:00Z',data:gardenData(settings)};}
async function main(){
  assert.deepEqual(plain(Photos.backupSettings([])),[defaults], 'implicit defaults must be portable');
  assert.deepEqual(plain(Photos.backupSettings([webp])),[webp],'explicit WebP profile preserved');
  const settings=[{id:'gardenTitle',value:'Test garden'}];
  assert.deepEqual(settings,[{id:'gardenTitle',value:'Test garden'}], 'not mutated before call');
  assert.deepEqual(plain(Photos.backupSettings(settings)),[...settings,defaults]);
  assert.deepEqual(settings,[{id:'gardenTitle',value:'Test garden'}], 'source records not mutated');
  assert.throws(()=>Photos.backupSettings([webp,webp]),/Duplicate photo settings/);
  assert.throws(()=>Photos.backupSettings([{...webp,targetKB:0}]),/Target size/);
  assert.throws(()=>Photos.backupSettings(null),/settings array/);
  // Simulate an older photo-helper script remaining in a browser cache: it has
  // settings() and validate(), but not the newer backupSettings() method.
  const legacyPhotos=Object.freeze(Object.fromEntries(Object.entries(Photos).filter(([name])=>name!=='backupSettings')));
  assert.equal(legacyPhotos.backupSettings,undefined);
  // Full app's legacy JSON/ZIP restore validator follows exactly the same defaults.
  const source=['public/taxonomy.js','public/garden-title.js','public/localized-names.js','app.js']
    .map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n').replace(/init\(\);\s*$/,'');
  const appctx=vm.createContext({Blob,console,URL,Date,Math,crypto:globalThis.crypto,window:{},document:{querySelector(){return null;}}});
  vm.runInContext(optimizerSource,appctx);appctx.VerdantPhotos=legacyPhotos;
  vm.runInContext(source,appctx);
  appctx.incoming={...backupObj([]),data:{...gardenData([]),images:[{...photoMeta,blob}]}};
  assert.deepEqual(plain(vm.runInContext('prepareBackup(incoming).settings',appctx)),[defaults]);
  appctx.incoming={...backupObj([webp]),data:{...gardenData([webp]),images:[{...photoMeta,blob}]}};
  assert.deepEqual(plain(vm.runInContext('prepareBackup(incoming).settings',appctx)),[webp]);

  // Exercise the actual Settings backup UI with an in-memory disk + IndexedDB
  // stand-in. ZIP generation/parsing and the real restore handler run unmodified.
  const records={plants:new Map(),plantTypes:new Map(),images:new Map([['photo1',photo]]),settings:new Map()};
  let wrote=0;
  function req(result){const r={};queueMicrotask(()=>{r.result=result;r.onsuccess?.()});return r;}
  const db={objectStoreNames:{contains:n=>Boolean(records[n])},close(){},transaction(names,mode){
    const tx={};
    tx.objectStore=n=>({
      getAll:()=>req([...records[n].values()]),getAllKeys:()=>req([...records[n].keys()]),
      get:id=>req(records[n].get(id)),count:()=>req(records[n].size),
      clear:()=>{records[n].clear();wrote++},delete:id=>{records[n].delete(id);wrote++},put:rec=>{records[n].set(rec.id,rec);wrote++}
    });
    if(mode==='readwrite')setTimeout(()=>tx.oncomplete?.(),0);
    return tx;
  }};
  const disk=new Map();
  let failWrite=false,failRemove=false,downloadCount=0,exported;
  function handle(filename){return {
    createWritable:async()=>{if(failWrite)throw Error('Disk full');let parts=[];return {write:async b=>{parts.push(new Uint8Array(b).slice())},close:async()=>{disk.set(filename,new Blob(parts))},abort:async()=>{parts=[]}}},
    getFile:async()=>disk.get(filename)
  }};
  const directory={getFileHandle:async filename=>handle(filename),removeEntry:async filename=>{if(failRemove)throw Error('Cannot delete temporary ZIP');disk.delete(filename)}};
  const dom=new Map();
  const rootEl={querySelector:sel=>{
    if(sel==='#download')throw Error('Separate Download button must not exist');
    if(sel==='#message')throw Error('Removed status area must not be used');
    if(!dom.has(sel))dom.set(sel,{disabled:false,files:[],textContent:'',value:'',onclick:null,click(){return this.onclick?.()}});
    return dom.get(sel);
  }};
  const stored=new Map();let restored=0,currentDialog,lastStatus;
  const globals={
    window:{VerdantZip:Zip,VerdantPhotos:legacyPhotos,VerdantGardenTitle:{validateRecord(){}}},
    VerdantZip:Zip,VerdantPhotos:legacyPhotos,VerdantGardenTitle:{validateRecord(){}},
    indexedDB:{open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess?.()});return r;}},
    navigator:{storage:{getDirectory:async()=>directory}},
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,val)=>stored.set(key,val),removeItem:key=>stored.delete(key)},
    document:{baseURI:'https://verdant.example/',body:{append(){}},createElement(tag){
      if(tag==='a')return {click(){downloadCount++},remove(){}};
      const nodes=new Map();
      currentDialog={setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){},
        querySelector(key){if(!nodes.has(key))nodes.set(key,{disabled:key==='[data-done]',focus(){},click(){if(!this.disabled)return this.onclick?.()}});return nodes.get(key)}
      };
      return currentDialog;
    }},
    fetch:async url=>{
      const filename=String(url).split('/print/')[1];
      const filepath=path.join(root,'public/print',filename);
      return {ok:fs.existsSync(filepath),url:String(url),blob:async()=>new Blob([fs.readFileSync(filepath)])};
    },
    confirm:()=>true,
  };
  const original={};
  for(const [key,val] of Object.entries(globals)){original[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:val});}
  try{
    const {mountBackup}=await import(pathToFileURL(path.join(root,'src/settings/backup-tool.js')).href);
    const unmount=mountBackup(rootEl,{onRestore:async()=>{restored++}});
    async function runTask(action,{success=true,cancel=false,decline=false,opensGarden=false,discard=false,testCleanupFailure=false}={}){
      const writesBefore=wrote,before=restored;
      let confirmed=false;
      const clicked=dom.get('#'+action).onclick();
      const pending=['restore','repair'].includes(action)?dom.get('#restoreFile').onchange():clicked;
      const activeDialog=currentDialog;
      await dom.get('#'+action).onclick();
      assert.equal(currentDialog,activeDialog,'duplicate action is blocked');
      if(cancel)await currentDialog.querySelector('[data-cancel]').click();
      const done=currentDialog.querySelector('[data-done]');
      for(let i=0;i<1000;i++){
        if(!done.disabled)break;
        const confirm=currentDialog.querySelector('[data-confirm]');
        if(confirm.onclick&&!confirmed){
          assert.equal(wrote,writesBefore,'review appears before garden writes');
          assert.match(currentDialog.querySelector('[data-summary]').textContent,action==='repair'?/matching image files/:/replaces all current garden records/);
          confirmed=true;
          await currentDialog.querySelector(decline?'[data-cancel]':'[data-confirm]').click();
        }
        await new Promise(resolve=>setTimeout(resolve,1));
      }
      assert.equal(done.disabled,false,'result must be dismissible');
      assert.equal(done.textContent,success?(action==='create'?'Discard':opensGarden?'Open garden':'Done'):'Close');
      assert.equal(restored,before,'refresh callback waits for Open garden');
      assert.equal(window.VerdantManagementBusy,true);
      lastStatus=currentDialog.querySelector('.task-status').textContent;
      if(action==='create'&&success){
        assert.match(lastStatus,/Backup ready/);
        const filename=stored.get('verdant-staged-zip');
        exported=disk.get(filename);assert(exported?.size>0);
        const download=currentDialog.querySelector('[data-action]');
        assert.equal(download.hidden,false);assert.equal(download.textContent,'Download ZIP');
        if(!discard){
          const beforeDownloads=downloadCount;
          await download.click();await download.click();
          assert.equal(downloadCount,beforeDownloads+2,'download can be retried');
          assert.equal(done.textContent,'Done');
          assert.equal(disk.get(filename),exported,'ZIP stays readable until save is checked');
          assert.match(currentDialog.querySelector('.task-status').textContent,/Download requested/);
        }
        if(testCleanupFailure){
          failRemove=true;await done.click();failRemove=false;
          assert.equal(done.disabled,false,'cleanup failure can be retried');
          assert(disk.has(filename));assert.equal(stored.get('verdant-staged-zip'),filename);
        }
      }
      await done.click();await pending;
      if(action==='create'&&success){
        assert.equal(stored.has('verdant-staged-zip'),false);
        assert.equal(disk.size,0,'temporary backup discarded');
      }
      assert.equal(window.VerdantManagementBusy,false);
      currentDialog=null;
    }
    const restoreAndDismiss=(success=true,cancel=false,decline=false)=>runTask('restore',{success,cancel,decline,opensGarden:true});
    // Exports should always include the default even without a saved record.
    await runTask('create');
    assert.match(lastStatus,/Backup ready/);

    const parsed=await Zip.parseVerdantZip(exported);
    assert.deepEqual(plain(parsed.data.settings),[defaults], 'works with older cached photo optimizer helper');
    assert.deepEqual([...new Uint8Array(await parsed.data.images[0].blob.arrayBuffer())],[...imageBytes]);
    await runTask('create',{discard:true});
    await runTask('create',{testCleanupFailure:true});
    stored.set('verdant-staged-zip','verdant-stage-old.zip');
    disk.set('verdant-stage-old.zip',new Blob(['old temporary backup']));
    await runTask('create');
    failWrite=true;await runTask('create',{success:false});failWrite=false;
    assert.match(lastStatus,/Disk full/);
    assert.equal(disk.size,0,'failed backup leaves no partial ZIP');
    // Importing a legacy ZIP lacking a photo record must NOT retain this device's WebP profile.
    records.settings.set('photoOptimization',webp);
    const oldZip=await zipFrom([{path:'data.json',blob:new Blob([JSON.stringify(backupObj([]))])},{path:'images/00001.bin',blob}]);
    rootEl.querySelector('#restoreFile').files=[oldZip];
    await restoreAndDismiss();
    assert.deepEqual(plain(records.settings.get('photoOptimization')),defaults);
    assert.equal(restored,1);
    assert.deepEqual([...new Uint8Array(await records.images.get('photo1').blob.arrayBuffer())],[...imageBytes]);
    const beforeCancel=wrote;
    await restoreAndDismiss(false,true);
    assert.match(lastStatus,/Operation cancelled/);
    assert.equal(wrote,beforeCancel,'cancelling ZIP verification makes no database changes');
    await restoreAndDismiss(false,false,true);
    assert.equal(wrote,beforeCancel,'declining replacement preserves garden');
    // New ZIPs retain an explicit, non-default garden profile through the same path.
    const explicitZip=await zipFrom([{path:'data.json',blob:new Blob([JSON.stringify(backupObj([webp]))])},{path:'images/00001.bin',blob}]);
    rootEl.querySelector('#restoreFile').files=[explicitZip];
    await restoreAndDismiss();
    assert.deepEqual(plain(records.settings.get('photoOptimization')),webp);
    assert.equal(restored,2);
    // Repair only the images referenced by the current garden, preserving new photos and journals.
    const newBlob=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,4,4])],{type:'image/png'});
    const badPhoto=new Blob([Uint8Array.from([8,8,8])],{type:'image/jpeg'});
    records.images.set('photo1',{...photo,blob:badPhoto});
    records.images.set('newPhoto',{id:'newPhoto',name:'iphone.png',mimeType:'image/png',blob:newBlob});
    const journal={id:'j1',timestamp:'2026-11-01T11:00:00Z',imageIds:['photo1','newPhoto'],note:'New iPhone journal entry'};
    records.plants.set('p2',{id:'p2',statuses:[journal]});
    const gardenBefore=plain([...records.plants.values()]);
    rootEl.querySelector('#restoreFile').files=[explicitZip];
    await runTask('repair',{opensGarden:true});
    assert.equal(restored,3);
    assert.deepEqual(plain([...records.plants.values()]),gardenBefore,'repair must retain new journal entry');
    assert.deepEqual([...new Uint8Array(await records.images.get('photo1').blob.arrayBuffer())],[...imageBytes],'repaired original photo');
    assert.deepEqual([...new Uint8Array(await records.images.get('newPhoto').blob.arrayBuffer())],[...new Uint8Array(await newBlob.arrayBuffer())],'new phone photo retained');
    assert(![...records.images.keys()].some(id=>id.startsWith('\uffffverdant-import-')),'no temporary images left');
    // Invalid photo config rejected before a destructive transaction.
    const badZip=await zipFrom([{path:'data.json',blob:new Blob([JSON.stringify(backupObj([{...webp,maxDimension:50}]))])},{path:'images/00001.bin',blob}]);
    const before=wrote;
    rootEl.querySelector('#restoreFile').files=[badZip];
    await restoreAndDismiss(false);
    assert.match(lastStatus,/Maximum dimension/);
    assert.equal(wrote,before);
    await runTask('update',{success:false});
    assert.match(lastStatus,/Service workers are not supported/);
    navigator.serviceWorker={getRegistration:async()=>null};
    await runTask('update');
    assert.match(lastStatus,/No existing installed worker/);
    navigator.serviceWorker={getRegistration:async()=>({update:async()=>{}})};
    await runTask('update');
    assert.match(lastStatus,/Checked for an updated/);
    rootEl.querySelector('#restoreFile').files=[];
    dom.get('#restore').onclick();
    dom.get('#restoreFile').onchange();
    assert.equal(currentDialog,null,'cancelling file picker does not open a modal');
    assert.equal(window.VerdantManagementBusy,false);
    unmount();
    assert.equal(dom.get('#create').onclick,null);
    assert.equal(dom.get('#restoreFile').onchange,null);
    assert.equal(dom.get('#update').disabled,true);
    const cleanupAgain=mountBackup(rootEl);
    assert.equal(dom.get('#create').disabled,false);
    cleanupAgain();
    console.log('PASS: default/explicit photo settings, legacy helper compatibility, original photo bytes, invalid input rollback');
  }finally{for(const [key,val] of Object.entries(original)){if(!val)delete globalThis[key];else Object.defineProperty(globalThis,key,val);}}
}
main().catch(e=>{console.error(e);process.exitCode=1});
