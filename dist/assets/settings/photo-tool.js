/* Low-memory migration for existing photos. Shares IndexedDB with Verdant;
   no MapLibre, photo gallery, ZIP library or map decoder loaded. */
'use strict';
export function mountPhotoOptimizer(root) {
  const DB_NAME='verdant-garden-v2',JOB_ID='photoOptimizationJob',SETTING_ID='photoOptimization';
  const $=id=>root.querySelector('#'+id);
  let db=null,busy=false,pauseRequested=false;
  const display=message=>{$('status').textContent=message;};
  function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('IndexedDB failed'));});}
  async function openDB(){
    if(db)return db;
    db=await new Promise((resolve,reject)=>{
      const r=indexedDB.open(DB_NAME);let absent=false;
      r.onupgradeneeded=()=>{absent=true;r.transaction.abort();};
      r.onerror=()=>reject(absent?Error('No Verdant data at this origin. Use your existing localhost address, port and Firefox profile.'):r.error||Error('Cannot open Verdant database'));
      r.onsuccess=()=>resolve(r.result);
    });
    if(!['settings','images'].every(s=>db.objectStoreNames.contains(s)))throw Error('Unexpected database structure; no files modified.');
    db.onversionchange=()=>{db.close();db=null;};return db;
  }
  async function get(store,id){const d=await openDB();return request(d.transaction(store,'readonly').objectStore(store).get(id));}
  async function keys(store){const d=await openDB();return request(d.transaction(store,'readonly').objectStore(store).getAllKeys());}
  async function commit(image,job){
    const d=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(image?['images','settings']:['settings'],'readwrite');
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Save aborted'));tx.onerror=()=>reject(tx.error||Error('Save failed'));
      if(image)tx.objectStore('images').put(image);
      tx.objectStore('settings').put(job);
    });
  }
  async function putSetting(setting){const d=await openDB();return new Promise((resolve,reject)=>{
    const tx=d.transaction('settings','readwrite');tx.objectStore('settings').put(setting);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Could not save settings'));
  });}
  function readForm(){return VerdantPhotos.validate({targetKB:Number($('targetKB').value),maxDimension:Number($('maxDimension').value),format:$('format').value});}
  function fillForm(s){$('targetKB').value=s.targetKB;$('maxDimension').value=s.maxDimension;$('format').value=s.format;}
  async function loadSettings(){const s=VerdantPhotos.settings(await get('settings',SETTING_ID));fillForm(s);return s;}
  async function saveSettings(){const s=readForm();await putSetting(s);display('Photo settings saved. New uploads will use these settings. Existing photos have not been changed.');return s;}
  function displayJob(job){
    if(!job){$('progress').value=0;return;}
    const total=job.total||0;
    $('progress').value=total?Math.round(100*job.processed/total):0;
    display(`${job.status==='done'?'Completed':job.status==='paused'?'Paused':job.status==='running'?'Processing':'Ready'}: ${job.processed}/${total} photographs examined.\n`+
      `${job.changed} optimized · ${job.skipped} unchanged · ${job.failed} failed.\n`+
      `Space saved so far: ${((job.savedBytes||0)/1048576).toFixed(2)} MiB.`+
      ((job.errors||[]).length?'\nRecent issues:\n'+job.errors.join('\n'):'') +
      '\nCheck your journal photos, and keep the original external backup.');
    $('start').textContent=job.status==='paused'||job.status==='running'?'Resume optimization…':'Optimize existing photos…';
  }
  async function inspect(){
    const [ids,map,job]=await Promise.all([keys('images'),get('settings','map'),get('settings',JOB_ID)]);
    const photoCount=ids.filter(id=>id!==map?.imageId).length;
    $('counts').textContent=`${photoCount} photograph records; ${ids.length-photoCount} current map image record(s). No images were decoded.`;
    displayJob(job);
  }
  async function migrate(){
    const config=readForm();
    const saved=await get('settings',SETTING_ID);
    if(!saved || VerdantPhotos.fingerprint(VerdantPhotos.settings(saved))!==VerdantPhotos.fingerprint(config))throw Error('Save your photo settings first, then run migration.');
    if(!$('backupConfirmed').checked)throw Error('Please confirm a verified external backup before optimizing existing photos.');
    if(!confirm(`Optimize your existing plant photographs to approximately ${config.targetKB} KB, maximum ${config.maxDimension}px (${config.format==='image/webp'?'WebP':'JPEG'})?\n\nThis can permanently remove fine details. Processing is one photograph at a time; your map and plant records will not be changed. Continue only after making a verified external backup.`))return;
    const ids=await keys('images');const map=await get('settings','map');
    const photoIds=ids.filter(id=>id!==map?.imageId).sort();
    const fingerprint=VerdantPhotos.fingerprint(config);
    let job=await get('settings',JOB_ID);
    // Resume only an interrupted run with identical limits and the same image set.
    const signature=photoIds.length+':'+(photoIds[0]||'')+':'+(photoIds.at(-1)||'');
    if(!job || job.fingerprint!==fingerprint || job.signature!==signature || job.status==='done'){
      job={id:JOB_ID,status:'running',fingerprint,signature,total:photoIds.length,processed:0,changed:0,skipped:0,failed:0,savedBytes:0,afterId:null,errors:[],updatedAt:new Date().toISOString()};
    }
    job.status='running';await commit(null,job);
    pauseRequested=false;$('pause').disabled=false;
    for(const id of photoIds){
      if(job.afterId!==null && id<=job.afterId)continue;
      if(pauseRequested)break;
      let newRecord=null;
      try{
        const record=await get('images',id);
        if(!record?.blob)throw Error('Image Blob missing');
        const result=await VerdantPhotos.compress(record.blob,config);
        if(result.changed){
          newRecord={...record,blob:result.blob,mimeType:result.blob.type,
            name:(record.name||'photo').replace(/\.(jpe?g|png|webp|heic|heif|bmp|avif)$/i,'')+(result.blob.type==='image/webp'?'.webp':'.jpg'),
            optimization:{version:1,fingerprint,compressedAt:new Date().toISOString(),width:result.width,height:result.height,previousBytes:record.blob.size}};
          job.changed++;job.savedBytes+=Math.max(0,record.blob.size-result.blob.size);
        }else{job.skipped++;if(result.reason&&result.reason!=='Already within the selected limits.'&&job.errors.length<20)job.errors.push(`${id}: ${result.reason}`);}
      }catch(error){job.failed++;if(job.errors.length<20)job.errors.push(`${id}: ${error.message||error}`);}
      job.afterId=id;job.processed++;job.updatedAt=new Date().toISOString();
      // Both image replacement and checkpoint commit in ONE transaction. An
      // interrupted operation leaves the original Blob OR a complete replacement.
      await commit(newRecord,job);
      displayJob(job);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    job.status=pauseRequested?'paused':'done';job.updatedAt=new Date().toISOString();
    await commit(null,job);displayJob(job);
  }
  async function run(fn){if(busy)return;busy=true;window.VerdantManagementBusy=true;for(const id of ['inspect','start'])$(id).disabled=true;
    try{await fn();}catch(error){console.error(error);display('Error: '+(error.message||error)+'\nPreviously saved photographs were not rolled back; completed individual conversions remain valid.');}
    finally{busy=false;window.VerdantManagementBusy=false;$('pause').disabled=true;for(const id of ['inspect','start'])$(id).disabled=false;}
  }
  $('settingsForm').addEventListener('submit',event=>{event.preventDefault();run(saveSettings);});
  $('inspect').onclick=()=>run(inspect);
  $('start').onclick=()=>run(migrate);
  $('pause').onclick=()=>{pauseRequested=true;$('pause').disabled=true;display('Pausing safely after the current photograph…');};
  run(async()=>{await loadSettings();await inspect();});
  return () => { pauseRequested=true; if (db) { db.close?.(); db=null; } };
}
