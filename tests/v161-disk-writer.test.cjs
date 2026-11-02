const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
(async()=>{
  // Exercise the worker's actual OPFS write, offset, flush, close and abort logic.
  const saved=new Map(),messages=[];
  const root={async getFileHandle(name){return {async createSyncAccessHandle(){let buffer=new Uint8Array(0);return{
    write(bytes,{at}){const next=new Uint8Array(Math.max(buffer.length,at+bytes.length));next.set(buffer);next.set(bytes,at);buffer=next;return bytes.length;},
    truncate(len){buffer=buffer.slice(0,len);},flush(){saved.set(name,buffer.slice());},close(){saved.set(name,buffer.slice());}
  };}};},async removeEntry(name){saved.delete(name);}};
  const self={postMessage(msg){messages.push(msg);}};
  const context={self,navigator:{storage:{async getDirectory(){return root;}}},Uint8Array,Error};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/settings/opfs-writer.worker.js'),'utf8'),context);
  const send=async(id,cmd,more={})=>{await self.onmessage({data:{id,cmd,...more}});const msg=messages.at(-1);assert.equal(msg.id,id);assert.equal(msg.error,undefined,msg.error);};
  await send(1,'open',{filename:'garden-test.zip'});
  await send(2,'write',{bytes:new Uint8Array([1,2,3,4]).buffer});
  await send(3,'write',{bytes:new Uint8Array([5,6]).buffer});
  await send(4,'close');
  assert.deepEqual([...saved.get('garden-test.zip')],[1,2,3,4,5,6]);
  await send(5,'open',{filename:'abort.zip'});await send(6,'write',{bytes:new Uint8Array([8]).buffer});await send(7,'abort');
  assert.equal(saved.has('abort.zip'),false);
  // Exercise the main-thread fallback RPC: no assembly of large ZIP Blobs.
  const writeCalls=[];const oldWorker=global.Worker;
  global.Worker=class{constructor(url,args){this.url=url;this.args=args;}postMessage(msg){writeCalls.push(msg.cmd);queueMicrotask(()=>this.onmessage({data:{id:msg.id,result:true}}));}terminate(){this.terminated=true;}};
  try{
    const filename=path.join(__dirname,'../src/settings/disk-writer.js');
    const {diskWriter}=await import(pathToFileURL(filename).href);
    const writer=await diskWriter({},'fallback-test.zip');
    await writer.write(new Uint8Array([1,2,3]));await writer.close();
    assert.deepEqual(writeCalls,['open','write','close']);
  }finally{global.Worker=oldWorker;}
  console.log('PASS: disk-backed Safari worker, bounded write RPC, flush and abort');
})().catch(e=>{console.error(e);process.exitCode=1;});
