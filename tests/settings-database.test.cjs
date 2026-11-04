const assert=require('node:assert/strict');
const {test}=require('node:test');

test('concurrent tool reads share a connection and versionchange closes that exact handle',async()=>{
  const {gardenDatabase}=await import('../src/settings/database.js');
  const requests=[];
  global.indexedDB={open(){const request={};requests.push(request);return request}};
  try{
    const access=gardenDatabase(),first=access.open(),second=access.open();
    assert.equal(requests.length,1);
    let closed=0;
    const connection={close(){closed++}};
    requests[0].result=connection;requests[0].onsuccess();
    assert.equal(await first,connection);assert.equal(await second,connection);
    connection.onversionchange();connection.onversionchange();
    assert.equal(closed,2,'callback always closes its own handle, never a mutable cache');
    await assert.rejects(access.open(),/closed/);assert.equal(requests.length,1);
  }finally{delete global.indexedDB;}
});

test('unmount while connection is opening closes late handle instead of leaking it',async()=>{
  const {gardenDatabase}=await import('../src/settings/database.js');
  let request,closed=false;
  global.indexedDB={open(){return request={}}};
  try{
    const access=gardenDatabase(),pending=access.open();
    access.close();
    request.result={close(){closed=true}};
    request.onsuccess();
    await assert.rejects(pending,/closed/);assert(closed);
  }finally{delete global.indexedDB;}
});

test('import can cancel a pending storage open without losing track of the late connection',async()=>{
  const {gardenDatabase}=await import('../src/settings/database.js');
  let request,closed=false,calls=0;
  global.indexedDB={open(){calls++;return request={}}};
  try{
    const access=gardenDatabase(),controller=new AbortController();
    const waiting=access.open({signal:controller.signal});
    controller.abort();
    await assert.rejects(waiting,{name:'AbortError'});
    const stillPending=access.open();
    assert.equal(calls,1,'cancelled wait must not create untracked duplicate opens');
    access.close();request.result={close(){closed=true}};request.onsuccess();
    await assert.rejects(stillPending,/closed/);assert(closed);
  }finally{delete global.indexedDB}
});
