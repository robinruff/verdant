const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
function fakeDB({corruptStage=false,failCommit=false}={}){
  const data=Object.fromEntries(['plants','plantTypes','images','settings'].map(n=>[n,new Map()]));
  data.plants.set('old-plant',{id:'old-plant'});
  data.settings.set('old-setting',{id:'old-setting',value:'keep unless committed'});
  data.images.set('old-photo',{id:'old-photo',blob:new Blob(['ORIGINAL'])});
  const db={transaction(names){
    const snapshot=Object.fromEntries(Object.entries(data).map(([n,records])=>[n,new Map(records)]));
    let aborted=false;
    const tx={abort(){aborted=true;for(const n of Object.keys(data))data[n]=new Map(snapshot[n]);tx.onabort?.();}};const pending=[];
    let pendingRequests=0,ready=false;
    function maybeComplete(){if(!ready||pendingRequests||aborted)return;setTimeout(()=>{
      if(failCommit&&Array.isArray(names))tx.abort();else if(!aborted)tx.oncomplete?.();
    },0);}
    function req(fn){const r={};pendingRequests++;queueMicrotask(()=>{
      try{r.result=fn();r.onsuccess?.();}catch(e){r.error=e;r.onerror?.();tx.error=e;tx.onabort?.();}
      pendingRequests--;maybeComplete();
    });return r;}
    tx.objectStore=n=>({
      put(rec){return req(()=>{let value=rec;
        if(corruptStage&&String(rec.id).startsWith('\uffffverdant-import-'))value={...rec,blob:new Blob(['CORRUPTED'],{type:rec.mimeType})};
        data[n].set(rec.id,value);return rec.id;
      });},
      get(id){return req(()=>data[n].get(id));},
      getAllKeys(){return req(()=>[...data[n].keys()]);},
      delete(id){return req(()=>data[n].delete(id));},
      clear(){return req(()=>data[n].clear());}
    });
    queueMicrotask(()=>{ready=true;maybeComplete();});return tx;
  }};
  return {db,data};
}
(async()=>{
  const {replaceImportedGarden}=await import(pathToFileURL(path.join(root,'src/import-photos.js')).href);
  const payload=new Blob([Uint8Array.from([255,216,255,219,9,8,7,6,255,217])],{type:'image/jpeg'});
  const record={id:'old-photo',mimeType:'image/jpeg',name:'old.jpg',blob:payload};
  const next={plants:[{id:'new-plant'}],plantTypes:[],images:[record],settings:[{id:'photoOptimization',targetKB:300}]};
  const ok=fakeDB();
  await replaceImportedGarden(ok.db,next);
  assert.deepEqual([...ok.data.plants.keys()],['new-plant']);
  assert.deepEqual([...new Uint8Array(await ok.data.images.get('old-photo').blob.arrayBuffer())],[...new Uint8Array(await payload.arrayBuffer())]);
  assert(![...ok.data.images.keys()].some(k=>k.startsWith('\uffffverdant-import-')));
  const failed=fakeDB({corruptStage:true});
  await assert.rejects(()=>replaceImportedGarden(failed.db,next),/Stored photo verification failed/);
  assert.deepEqual([...failed.data.plants.keys()],['old-plant'],'garden preserved on stored image failure');
  assert.deepEqual([...new Uint8Array(await failed.data.images.get('old-photo').blob.arrayBuffer())],[...Buffer.from('ORIGINAL')]);
  assert(![...failed.data.images.keys()].some(k=>k.startsWith('\uffffverdant-import-')));
  for(const when of ['before','staged']){
    const cancelled=fakeDB(),controller=new AbortController();
    cancelled.data.images.set('\uffffverdant-import-other-0',{id:'\uffffverdant-import-other-0',blob:payload});
    if(when==='before')controller.abort();
    let committed=false;
    await assert.rejects(()=>replaceImportedGarden(cancelled.db,next,{signal:controller.signal,
      onProgress:()=>controller.abort(),onCommit:()=>{committed=true}}),{name:'AbortError'});
    assert.equal(committed,false);
    assert.deepEqual([...cancelled.data.plants.keys()],['old-plant']);
    assert.equal(await cancelled.data.images.get('old-photo').blob.text(),'ORIGINAL');
    assert.deepEqual([...cancelled.data.images.keys()],['old-photo','\uffffverdant-import-other-0']);
  }
  const rollback=fakeDB({failCommit:true});
  await assert.rejects(()=>replaceImportedGarden(rollback.db,next),/original garden preserved/);
  assert.deepEqual([...rollback.data.plants.keys()],['old-plant']);
  assert.equal(await rollback.data.images.get('old-photo').blob.text(),'ORIGINAL');
  assert.deepEqual([...rollback.data.images.keys()],['old-photo']);
  const settings=fakeDB();
  await replaceImportedGarden(settings.db,next,{apiKey:{id:'plantnetKey',value:'secret'},previousTitle:{id:'gardenTitle',value:'Local garden'}});
  assert.equal(settings.data.settings.get('plantnetKey').value,'secret');
  assert.equal(settings.data.settings.get('gardenTitle').value,'Local garden');
  const repair=fakeDB();
  repair.data.plants.set('iphone-plant',{id:'iphone-plant'});
  repair.data.images.set('iphone-photo',{id:'iphone-photo',mimeType:'image/jpeg',blob:new Blob(['PHONE'])});
  await replaceImportedGarden(repair.db,{images:[record]},{imagesOnly:true});
  assert(repair.data.plants.has('iphone-plant'));
  assert.deepEqual(await repair.data.images.get('iphone-photo').blob.text(),'PHONE');
  assert.deepEqual([...new Uint8Array(await repair.data.images.get('old-photo').blob.arrayBuffer())],[...new Uint8Array(await payload.arrayBuffer())]);
  console.log('PASS: detached and verified photos; failed staging preserves garden; repair leaves new iPhone photos');
})().catch(e=>{console.error(e);process.exitCode=1});
