const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');

function environment(){
  const requests=new Map(),values=new Map([['verdant-install-offer-v1','declined'],['verdant-staged-zip','old.zip'],['unrelated','keep']]);
  const files=new Map([['verdant-stage-old.zip',{kind:'file'}],['other.zip',{kind:'file'}]]);
  const caches=new Set(['verdant-shell-old','other-cache']);
  const env={
    setTimeout:()=>1,clearTimeout(){},
    indexedDB:{deleteDatabase(name){const request={};requests.set(name,request);return request},async databases(){return []}},
    localStorage:{removeItem:key=>values.delete(key)},
    navigator:{storage:{getDirectory:async()=>({
      async *entries(){yield*files.entries()},async removeEntry(name){files.delete(name)}
    })}},
    caches:{keys:async()=>[...caches],delete:async name=>caches.delete(name)},
    location:{href:'https://garden.test/app/'}
  };
  return {env,requests,values,files,caches};
}

test('reset removes all Verdant storage and waits for both database deletions',async()=>{
  const {eraseVerdant}=await import('../src/settings/reset-data.js');
  const f=environment(),messages=[];let done=false;
  const resetting=eraseVerdant(f.env,text=>messages.push(text)).then(()=>{done=true});
  f.requests.get('verdant-garden-v2').onblocked();
  for(let n=0;n<12;n++)await Promise.resolve();
  assert.equal(done,false);
  assert(messages.some(text=>/Close all other Verdant/.test(text)));
  assert(!f.values.has('verdant-install-offer-v1'));
  assert(!f.files.has('verdant-stage-old.zip'));
  assert(!f.caches.has('verdant-shell-old'));
  assert(f.values.has('unrelated'));assert(f.files.has('other.zip'));assert(f.caches.has('other-cache'));
  f.requests.get('verdant-garden-v2').onsuccess();
  await Promise.resolve();assert.equal(done,false);
  f.requests.get('verdant-garden').onsuccess();await resetting;assert(done);
});

test('failed deletion still cleans other storage and cannot report success',async()=>{
  const {eraseVerdant}=await import('../src/settings/reset-data.js');
  const f=environment();
  const resetting=eraseVerdant(f.env,()=>{});
  const request=f.requests.get('verdant-garden-v2');
  request.error=Error('Deletion failed');request.onerror();
  f.requests.get('verdant-garden').onsuccess();
  await assert.rejects(resetting,/Deletion failed/);
  assert(!f.values.has('verdant-install-offer-v1'));
  assert(!f.files.has('verdant-stage-old.zip'));
});

test('reset verifies databases are absent and unregisters only this Verdant worker',async()=>{
  const {eraseVerdant}=await import('../src/settings/reset-data.js');
  const f=environment(),removed=[];
  f.env.navigator.serviceWorker={getRegistrations:async()=>[
    {scope:'https://garden.test/app/',active:{scriptURL:'https://garden.test/app/sw.js'},unregister:async()=>{removed.push('verdant');return true}},
    {scope:'https://garden.test/other/',active:{scriptURL:'https://garden.test/other/sw.js'},unregister:async()=>{removed.push('other');return true}}
  ]};
  f.env.indexedDB.databases=async()=>[{name:'verdant-garden-v2'}];
  const resetting=eraseVerdant(f.env,()=>{});
  for(const request of f.requests.values())request.onsuccess();
  await assert.rejects(resetting,/recreated garden storage/);
  assert.deepEqual(removed,['verdant']);
});


function resetController(erase){
  const vm=require('node:vm'),events=[];
  const task={report:text=>events.push(text),finish:options=>{task.completion=options}};
  const window={VerdantUI:{prepareReset:()=>events.push('tools closed')},location:{reload:()=>events.push('reload')}};
  let source=['public/taxonomy.js','public/garden-title.js','public/localized-names.js','app.js']
    .map(name=>fs.readFileSync(__dirname+'/../'+name,'utf8')).join('\n')
    .replace(/init\(\);\s*$/,'')
    .replace("import('./src/settings/reset-data.js')",'Promise.resolve({eraseVerdant:erase})')
    .replace("import('./src/settings/task-modal.js')",'Promise.resolve({createTaskModal:makeTask})');
  const ctx=vm.createContext({console,Blob,URL,Date,Math,window,erase,makeTask:()=>task,
    closed:()=>events.push('database closed'),unloaded:()=>events.push('workspace closed')});
  vm.runInContext(source,ctx);
  vm.runInContext('state.db={close:closed};unloadGardenWorkspace=unloaded;',ctx);
  return {task,events,window,run:()=>vm.runInContext('resetEntireApp()',ctx)};
}

test('inline reset closes all connections and reloads only after erasure completes',async()=>{
  let complete,started;
  const waiting=new Promise(resolve=>{started=resolve});
  const c=resetController(async()=>{
    assert.deepEqual(c.events.slice(0,2),['tools closed','workspace closed']);
    assert(c.events.includes('database closed'));
    started();
    await new Promise(resolve=>{complete=resolve});
  });
  const pending=c.run();await waiting;
  assert(!c.events.includes('reload'));
  await c.run(); // Duplicate reset must not start another deletion.
  complete();await pending;
  assert.equal(c.events.filter(event=>event==='reload').length,1);
  assert.equal(c.task.completion,undefined,'success needs no acknowledgement button');
});

test('inline reset keeps failures visible and offers reload instead of claiming success',async()=>{
  const c=resetController(async()=>{throw Error('Storage denied')});
  await c.run();
  assert(!c.events.includes('reload'));
  assert(c.events.some(event=>/Reset did not finish completely: Storage denied/.test(event)));
  assert.equal(c.task.completion.label,'Reload Verdant');
  c.task.completion.onDone();assert(c.events.includes('reload'));
});
