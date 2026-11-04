// Each mounted tool shares one connection, including concurrent first reads.
// Capture the actual handle in lifecycle callbacks; a mutable cache may already
// point to a different handle (or null) when versionchange is delivered.
export function gardenDatabase({validate=()=>{}}={}) {
  let db=null, opening=null, unavailable=false;
  async function open({signal,onWaiting}={}) {
    signal?.throwIfAborted();
    if(unavailable)throw Error('Garden storage was closed. Reopen Verdant before continuing.');
    if(!db&&!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('verdant-garden-v2');
      let absent=false;
      request.onupgradeneeded=()=>{absent=true;request.transaction.abort();};
      request.onerror=()=>reject(absent?Error('No garden database at this address. Reopen Verdant to start a new garden.'):request.error||Error('Cannot open garden storage'));
      request.onsuccess=()=>{
        const connection=request.result;
        if(unavailable){connection.close();reject(Error('Garden storage was closed.'));return;}
        try{validate(connection);}
        catch(error){connection.close();reject(error);return;}
        db=connection;
        connection.onversionchange=()=>{
          unavailable=true;
          connection.close();
          if(db===connection)db=null;
        };
        resolve(connection);
      };
    }).then(connection=>{opening=null;return connection;},error=>{opening=null;throw error;});
    const pending=db?Promise.resolve(db):opening;
    if(!signal&&!onWaiting)return pending;
    // Cancellation stops the task's wait without losing track of a late open.
    let timer,abort;
    try{
      return await new Promise((resolve,reject)=>{
        abort=()=>reject(signal.reason);
        signal?.addEventListener('abort',abort,{once:true});
        if(onWaiting)timer=setTimeout(()=>onWaiting('Waiting for garden storage. Close other Verdant tabs or windows. If an earlier reset is pending, cancel this import and reload Verdant before resetting again.'),5000);
        pending.then(resolve,reject);
        if(signal?.aborted)abort();
      });
    }finally{
      clearTimeout(timer);
      signal?.removeEventListener('abort',abort);
    }
  }
  function close(){
    unavailable=true;
    if(db){db.close();db=null;}
    // A pending open is closed by onsuccess, even after the tool is unmounted.
  }
  return {open,close};
}
