// Safari fallback: OPFS synchronous access handles only work in dedicated workers.
let root=null,handle=null,access=null,at=0,filename=null;
self.onmessage=async e=>{const {id,cmd}=e.data;try{
  let result=true;
  if(cmd==='open') {filename=e.data.filename;root=await navigator.storage.getDirectory();handle=await root.getFileHandle(filename,{create:true});if(typeof handle.createSyncAccessHandle!=='function')throw Error('Synchronous disk access not supported');access=await handle.createSyncAccessHandle();access.truncate(0);at=0;}
  else if(cmd==='write'){if(!access)throw Error('Writer not started');const bytes=new Uint8Array(e.data.bytes);let written=0;while(written<bytes.length){const n=access.write(bytes.subarray(written),{at:at+written});if(n<=0)throw Error('Failed to write backup');written+=n;}at+=bytes.length;}
  else if(cmd==='close'){access.flush();access.close();access=null;}
  else if(cmd==='abort'){if(access){access.close();access=null;}if(root&&filename)await root.removeEntry(filename);}
  self.postMessage({id,result});
}catch(err){self.postMessage({id,error:err?.message||String(err)});}};
