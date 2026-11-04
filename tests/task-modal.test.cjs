const assert=require('node:assert/strict');
(async()=>{
  const {createTaskModal}=await import('../src/settings/task-modal.js');
  let current,focusRestored=0;
  global.document={activeElement:{focus(){focusRestored++}},body:{append(){}},createElement(){
    const nodes=new Map(),events=new Map();
    current={setAttribute(){},addEventListener(k,fn){events.set(k,fn)},showModal(){},close(){this.closed=true},remove(){},
      escape(){events.get('cancel')({preventDefault(){}})},
      querySelector(k){if(!nodes.has(k))nodes.set(k,{focus(){},click(){if(!this.disabled)return this.onclick?.()}});return nodes.get(k)}};
    return current;
  }};
  const plain=createTaskModal({title:'Backup'});
  current.escape();assert(!current.closed,'Escape cannot dismiss active work');
  plain.finish();current.escape();await plain.dismissed;
  assert.equal(focusRestored,1);

  const cancelled=createTaskModal({title:'Import',cancellable:true});
  const waiting=cancelled.confirm('Replace garden?','Replace');
  current.escape();await assert.rejects(waiting,{name:'AbortError'});
  cancelled.finish({label:'Close'});await current.querySelector('[data-done]').click();await cancelled.dismissed;

  const locked=createTaskModal({title:'Repair',cancellable:true});
  locked.lock('Finishing repair…');current.escape();
  assert.equal(locked.signal.aborted,false,'final transaction cannot be cancelled');
  let attempts=0;
  locked.finish({label:'Open garden',onDone:()=>{if(++attempts===1)throw Error('refresh failed');}});
  current.escape();assert.equal(attempts,0,'Escape cannot implicitly open the garden');
  await current.querySelector('[data-done]').click();
  assert.match(current.querySelector('.task-status').textContent,/refresh failed/);
  assert.equal(current.querySelector('[data-done]').disabled,false);
  await current.querySelector('[data-done]').click();await locked.dismissed;
  assert.equal(attempts,2);assert.equal(focusRestored,3);
  delete global.document;
  console.log('PASS: modal cancellation, locked work, explicit completion, callback retry, focus restoration');
})().catch(err=>{console.error(err);process.exitCode=1});
