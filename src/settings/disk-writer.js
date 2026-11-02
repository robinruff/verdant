// Prefer an OPFS async writer. Older Safari may expose only sync access handles
// in dedicated workers. Both paths write bounded ZIP chunks to private disk.
export async function diskWriter(handle, filename) {
  if(typeof handle.createWritable==='function') return handle.createWritable();
  if(typeof Worker!=='function') throw Error('This browser has no disk-backed ZIP writer. No memory-heavy fallback will be attempted.');
  const worker=new Worker(new URL('./opfs-writer.worker.js', import.meta.url),{type:'module'});
  let next=0, closed=false;
  const calls=new Map();
  worker.onmessage=e=>{const {id,error,result}=e.data;const call=calls.get(id);if(!call)return;calls.delete(id);error?call.reject(Error(error)):call.resolve(result);};
  worker.onerror=e=>{for(const call of calls.values())call.reject(Error('Disk writer worker failed'));calls.clear();};
  function request(cmd,data){return new Promise((resolve,reject)=>{const id=++next;calls.set(id,{resolve,reject});const msg={id,cmd,...data};if(data?.bytes instanceof ArrayBuffer)worker.postMessage(msg,[data.bytes]);else worker.postMessage(msg);});}
  try{await request('open',{filename});}catch(err){worker.terminate();throw Error('Disk-backed ZIP writer unavailable: '+err.message);}
  return {
    async write(value){if(closed)throw Error('ZIP writer already closed');const bytes=value instanceof Uint8Array?value:new Uint8Array(value);const buf=bytes.slice().buffer;await request('write',{bytes:buf});},
    async close(){if(closed)return;await request('close');closed=true;worker.terminate();},
    async abort(){if(closed)return;closed=true;try{await request('abort');}finally{worker.terminate();}}
  };
}
