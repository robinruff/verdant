// The caller closes garden/tool connections before erasing storage.
const DATABASES=['verdant-garden-v2','verdant-garden'];
const PREFERENCES=['verdant-install-offer-v1','verdant-staged-zip'];
export function deleteGardenDatabase(factory,name,onWaiting) {
  return new Promise((resolve,reject)=>{
    const request=factory.deleteDatabase(name);
    request.onsuccess=()=>resolve();
    request.onerror=()=>reject(request.error||Error('Could not erase '+name));
    // A blocked request is still pending; it must not be retried in this page.
    request.onblocked=()=>onWaiting('Close all other Verdant tabs, installed-app windows and rescue pages. This reset will continue automatically when their storage connections close.');
  });
}

export async function eraseVerdant(env,report) {
  const failures=[];
  // Run independent cleanup even if database deletion is blocked. Never report
  // completion until all operations have settled and deletion is verified.
  const run=async(label,work)=>{
    report(label+'…');
    try{await work();report(label+': done.');}
    catch(error){failures.push(label+': '+(error?.message||error));report(failures.at(-1));}
  };
  const tasks=DATABASES.map(name=>run('Erasing '+name,async()=>{
    const timer=env.setTimeout(()=>report('Database deletion is still pending. Close other Verdant windows. If it stays stuck, close this page and use your browser’s site-data controls to clear data for this exact address.'),15000);
    try{await deleteGardenDatabase(env.indexedDB,name,report);}
    finally{env.clearTimeout(timer);}
  }));
  tasks.push(run('Removing preferences',async()=>{
    for(const key of PREFERENCES)env.localStorage.removeItem(key);
  }));
  tasks.push(run('Removing temporary backups',async()=>{
    if(!env.navigator.storage?.getDirectory)return;
    const directory=await env.navigator.storage.getDirectory();
    for await(const [name,entry] of directory.entries()){
      if(entry.kind==='file'&&/^verdant-stage-[a-zA-Z0-9_.-]+\.zip$/.test(name))await directory.removeEntry(name);
    }
  }));
  tasks.push(run('Removing Verdant service worker',async()=>{
    if(env.navigator.serviceWorker){
      const scope=new URL('./',env.location.href).href;
      const registrations=await env.navigator.serviceWorker.getRegistrations();
      for(const registration of registrations){
        const script=registration.active?.scriptURL||registration.waiting?.scriptURL||registration.installing?.scriptURL;
        if(registration.scope===scope&&script&&new URL(script).pathname===new URL('sw.js',scope).pathname){
          if(!await registration.unregister())throw Error('Could not unregister Verdant service worker');
        }
      }
    }
  }));
  tasks.push(run('Removing offline cache',async()=>{
    if(env.caches)for(const name of await env.caches.keys())if(name.startsWith('verdant-shell-'))await env.caches.delete(name);
  }));
  await Promise.all(tasks);
  if(failures.length)throw Error(failures.join('\n'));
  // Enumeration is optional; successful delete requests remain the baseline.
  if(typeof env.indexedDB.databases==='function'){
    const remaining=await env.indexedDB.databases();
    if(remaining.some(db=>DATABASES.includes(db.name)))throw Error('Another window recreated garden storage. Close all other Verdant windows and run reset again.');
  }
}
