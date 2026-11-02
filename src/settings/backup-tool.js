import {diskWriter} from './disk-writer.js';
import {replaceImportedGarden} from '../import-photos.js';
/* Dedicated low-memory backup UI. Same origin and IndexedDB as Verdant.
   Never imports app.js, MapLibre, geotiff decoder, or photographs into RAM en masse. */
'use strict';
export function mountBackup(root, {onRestore=()=>{}}={}) {
const DB_NAME='verdant-garden-v2', STAGED='verdant-staged-zip';
const $=id=>root.querySelector('#'+id);
const report=text=>{$('message').textContent=text;};
let db=null, busy=false;
function idb(req){return new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error||Error('IndexedDB request failed'));});}
async function openDB(){
  if(db)return db;
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME);let fresh=false;
    req.onupgradeneeded=()=>{fresh=true;req.transaction.abort();};
    req.onerror=()=>reject(fresh?Error('No garden database at this origin. Check the exact address/port and Firefox profile.'):req.error||Error('Could not open the garden database'));
    req.onsuccess=()=>{const value=req.result;if(fresh){value.close();reject(Error('Garden database does not exist'));return;}db=value;db.onversionchange=()=>{db.close();db=null;};resolve(db);};
  });
}
async function storeCall(store,op,arg){const d=await openDB();if(!d.objectStoreNames.contains(store))throw Error(`Database store ${store} is missing`);
  const s=d.transaction(store,'readonly').objectStore(store);return idb(arg===undefined?s[op]():s[op](arg));}
const all=name=>storeCall(name,'getAll');
const keys=name=>storeCall(name,'getAllKeys');
const get=(name,key)=>storeCall(name,'get',key);
const count=name=>storeCall(name,'count');
async function directory(){if(!navigator.storage?.getDirectory)throw Error('Disk-backed ZIP creation is unavailable in this browser. Use the emergency rescue page to save records without clearing your data.');return navigator.storage.getDirectory();}
function requireUnique(records,label){const seen=new Set();if(!Array.isArray(records))throw Error('Invalid '+label);
  for(const r of records){if(typeof r?.id!=='string'||!r.id||seen.has(r.id))throw Error('Missing/duplicate ID in '+label);seen.add(r.id);}return seen;}
function verifyReferences(d){
  const plants=requireUnique(d.plants,'plants'),types=requireUnique(d.plantTypes,'types'),images=requireUnique(d.images,'images');
  if(!plants.size)console.info('Exporting an empty garden');
  requireUnique(d.settings,'settings');
  if(d.settings.some(s=>!['map','photoOptimization','gardenTitle'].includes(s.id)))throw Error('Invalid backup settings');
  for(const plant of d.plants){
    if(plant.plantTypeId&&!types.has(plant.plantTypeId))throw Error('Missing type on plant '+plant.id);
    if(!plant.geometry||!['Point','LineString','Polygon'].includes(plant.geometry.type))throw Error('Invalid geometry on plant '+plant.id);
    if(!Array.isArray(plant.statuses))throw Error('Invalid statuses on plant '+plant.id);
    requireUnique(plant.statuses,'journal entries');
    for(const entry of plant.statuses){for(const id of [entry.imageId,...(entry.imageIds||[])].filter(Boolean))if(!images.has(id))throw Error('Missing photo '+id);}
  }
  const titleRecord=d.settings.find(s=>s.id==='gardenTitle');
  if(titleRecord)VerdantGardenTitle.validateRecord(titleRecord);
  const photoSettings=d.settings.find(s=>s.id==='photoOptimization');
  if(photoSettings){if(!window.VerdantPhotos)throw Error('Photo settings validator missing');VerdantPhotos.validate(photoSettings);}
  for(const setting of d.settings)if(setting.imageId&&!images.has(setting.imageId))throw Error('Missing map image '+setting.imageId);
}
async function inspect(){
  const [plants,plantTypes,images]=await Promise.all([count('plants'),count('plantTypes'),count('images')]);
  $('counts').textContent=`${plants} plants · ${plantTypes} types · ${images} image records`;
  report('Garden checked. No changes were made.');
}
async function exportZip(){
  if(!window.VerdantZip)throw Error('Local ZIP engine missing.');
  const dir=await directory();
  const [plants,plantTypes,settings,imageIds]=await Promise.all([all('plants'),all('plantTypes'),all('settings'),keys('images')]);
  const imageMeta=[];
  // Each IndexedDB get returns a single image record; the Blob is released
  // after the metadata has been extracted. Never getAll('images').
  for(let i=0;i<imageIds.length;i++){
    const r=await get('images',imageIds[i]);
    if(!(r?.blob instanceof Blob)||!r.blob.size)throw Error('Missing/corrupt image: '+imageIds[i]);
    imageMeta.push({id:r.id,name:r.name||'image',mimeType:r.mimeType||r.blob.type||'image/jpeg',createdAt:r.createdAt||null,path:`images/${String(i+1).padStart(5,'0')}.bin`});
    if(i%16===0)report('Checking photographs… '+(i+1)+' / '+imageIds.length);
  }
  // Store the effective photo profile in every backup, including gardens
  // using the defaults without an explicit photoOptimization DB record.
  const selected=settings.filter(s=>['map','photoOptimization','gardenTitle'].includes(s.id));
  const portableSettings=[...selected.filter(s=>s.id!=='photoOptimization'),
    VerdantPhotos.settings(selected.find(s=>s.id==='photoOptimization'))];
  const data={plants,plantTypes,settings:portableSettings,images:imageMeta};
  verifyReferences(data);
  const backup={format:'verdant-garden-backup',schemaVersion:2,exportedAt:new Date().toISOString(),data};
  // The fixed, small Typst bundle is shipped with the offline app. Load it
  // from this same origin (including the service-worker cache) before writing
  // anything, so exports never silently omit the printable report.
  const printFiles=[];
  for(const name of VerdantZip.printFiles){
    const url=new URL('./print/'+name,document.baseURI);
    const response=await fetch(url);
    if(!response.ok||!new URL(response.url).pathname.endsWith('/print/'+name))throw Error('Print template missing: '+name+'. Redeploy the complete Verdant app.');
    const blob=await response.blob();
    if(!blob.size)throw Error('Print template is empty: '+name);
    printFiles.push({path:name,blob});
  }
  const filename='verdant-stage-'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip';
  const handle=await dir.getFileHandle(filename,{create:true});
  try{
    const writer=await diskWriter(handle, filename);
    async function* entries(){
      yield {path:'data.json',blob:new Blob([JSON.stringify(backup)],{type:'application/json'})};
      for(let i=0;i<imageIds.length;i++){
        const rec=await get('images',imageIds[i]);
        if(!rec?.blob||rec.blob.size===0)throw Error('Photo removed during backup: '+imageIds[i]);
        // Exactly one original Blob at a time. The ZIP engine slices it at 256 KB.
        yield {path:imageMeta[i].path,blob:rec.blob};
      }
      for(const entry of printFiles)yield entry;
    }
    const expectedCount=imageIds.length+1+printFiles.length;
    const result=await VerdantZip.writeZip(writer,entries(),progress=>{
      report(`Writing ZIP… ${progress.files} / ${expectedCount} files, ${(progress.bytes/1048576).toFixed(1)} MiB`);
    });
    const file=await handle.getFile();
    const zip=await VerdantZip.openZip(file);
    if(zip.entries.size!==expectedCount)throw Error('ZIP verification failed: file count mismatch');
    // Bounded 256 KB CRC checks; no full-file buffers or Base64 conversion.
    for(const e of zip.entries.values())await zip.verify(e);
    localStorage.setItem(STAGED,filename);
    $('download').disabled=false;
    report(`Backup ready: ${plants.length} plants and ${imageIds.length} images (${(result.bytes/1048576).toFixed(1)} MiB).\n\nDownload the ZIP and keep another copy somewhere safe. Your garden hasn't changed.`);
  }catch(err){try{await dir.removeEntry(filename);}catch{}throw err;}
}
async function download(){
  const filename=localStorage.getItem(STAGED);if(!filename)throw Error('No completed ZIP staged here');
  const file=await(await(await directory()).getFileHandle(filename)).getFile();if(!file.size)throw Error('Staged ZIP is empty');
  const url=URL.createObjectURL(file),a=document.createElement('a');
  const title=(await get('settings','gardenTitle'))?.value||'verdant-garden';
  const slug=String(title).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,52)||'verdant-garden';
  const day=new Date().toISOString().slice(0,10);
  a.href=url;a.download=`${slug}-${day}.zip`;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
  report(`Download requested: ${a.download} (${(file.size/1048576).toFixed(1)} MiB).\nCheck that the file was saved successfully, and keep a copy in another safe location.`);
}
function validGeo(g){
  if(!g||!['Point','LineString','Polygon'].includes(g.type))return false;
  const pair=p=>Array.isArray(p)&&p.length===2&&p.every((n,i)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=(i?90:180));
  if(g.type==='Point')return pair(g.coordinates);
  if(g.type==='LineString')return Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.every(pair);
  return Array.isArray(g.coordinates)&&g.coordinates.length>0&&g.coordinates.every(r=>Array.isArray(r)&&r.length>=4&&r.every(pair)&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]);
}
function validateIncoming(parsed){
  if(parsed?.format!=='verdant-garden-backup'||parsed.schemaVersion!==2)throw Error('Not a supported Verdant schema-2 backup');
  const d=parsed.data;verifyReferences(d);
  const allowed=['auto','leaf','flower','fruit','bark'];
  for(const t of d.plantTypes){if(t.color!=null&&!/^#[0-9a-f]{6}$/i.test(t.color))throw Error('Invalid color for '+t.id);if(t.links!=null&&(!Array.isArray(t.links)||t.links.some(x=>typeof x!=='string')))throw Error('Invalid reference links');}
  for(const m of d.plants){
    if(!validGeo(m.geometry))throw Error('Invalid geometry for '+m.id);
    for(const e of m.statuses){
      if(typeof e.timestamp!=='string'||!Number.isFinite(Date.parse(e.timestamp)))throw Error('Invalid journal timestamp');
      if(e.alive!=null&&typeof e.alive!=='boolean'||e.removed!=null&&typeof e.removed!=='boolean')throw Error('Invalid status value');
      if(e.rating!=null&&(!Number.isInteger(e.rating)||e.rating<1||e.rating>10))throw Error('Invalid rating');
      if(e.imageOrgans&&Object.values(e.imageOrgans).some(v=>!allowed.includes(v)))throw Error('Invalid photo label');
    }
  }
  const photos=d.settings.find(s=>s.id==='photoOptimization');
  if(photos){if(!window.VerdantPhotos)throw Error('Photo optimizer library missing');VerdantPhotos.validate(photos);}
  const map=d.settings.find(s=>s.id==='map');
  if(map&&(!(map.width>0)||!(map.height>0)||!Array.isArray(map.points)||map.points.length>3))throw Error('Invalid map settings');
  for(const im of d.images)if(!(im.blob instanceof Blob)||!im.blob.size||typeof im.mimeType!=='string'||!im.mimeType.startsWith('image/'))throw Error('Corrupt or invalid image '+im.id);
  // Old schema-2 backups may omit the profile. Restore the known defaults
  // rather than leaking the importing browser's preferences into this garden.
  return {...d,settings:[...d.settings.filter(s=>s.id!=='photoOptimization'),
    VerdantPhotos.settings(d.settings.find(s=>s.id==='photoOptimization'))]};
}
async function restore(){
  const file=$('restoreFile').files?.[0];if(!file)throw Error('Select a ZIP backup first');
  if(!window.VerdantZip)throw Error('ZIP library missing');
  report('Verifying ZIP and checking every image checksum (no changes to garden yet)…');
  const parsed=await VerdantZip.parseVerdantZip(file,name=>report('Verified ZIP entry: '+name));
  const d=validateIncoming(parsed);
  report(`Verified backup: ${d.plants.length} plants · ${d.plantTypes.length} types · ${d.images.length} image files · created ${new Date(parsed.exportedAt).toLocaleString()}.\nNo data has been replaced. Review these details before continuing.`);
  const decision=confirm(`Replace ALL existing Verdant records?\n\nIncoming: ${d.plants.length} plants, ${d.plantTypes.length} types, ${d.images.length} images.\n\nAll local garden records and photos will be replaced. Your local Pl@ntNet key will remain.\n\nOnly proceed after backing up your existing garden.`);
  if(!decision){report('Restore cancelled. No garden data changed.');return;}
  const current=await openDB();
  const secret=await get('settings','plantnetKey');
  const previousTitle=await get('settings','gardenTitle');
  await replaceImportedGarden(current,d,{apiKey:secret,previousTitle,
    onProgress:text=>report(text)});
  report(`Restore complete: ${d.plants.length} plants, ${d.images.length} images. Reloading garden…`);
  await onRestore();
}
async function repairPhotos(){
  const file=$('restoreFile').files?.[0];if(!file)throw Error('Select your original Verdant ZIP backup first');
  if(!window.VerdantZip)throw Error('ZIP library missing');
  report('Verifying backup photos before repair (no garden changes)…');
  const parsed=await VerdantZip.parseVerdantZip(file,name=>report('Verified ZIP entry: '+name));
  const plants=await all('plants');
  const referenced=new Set();
  for(const plant of plants)for(const entry of plant.statuses||[]){
    if(entry.imageId)referenced.add(entry.imageId);
    for(const id of entry.imageIds||[])referenced.add(id);
  }
  const imageIds=new Set();
  for(const image of parsed.data.images){
    if(typeof image.id!=='string'||!image.id||imageIds.has(image.id)||
        typeof image.mimeType!=='string'||!image.mimeType.startsWith('image/'))
      throw Error('Invalid or duplicate image metadata in ZIP');
    imageIds.add(image.id);
  }
  const selected=parsed.data.images.filter(image=>referenced.has(image.id));
  if(!selected.length)throw Error('No matching image references in this garden. Select the ZIP originally used to import this garden.');
  if(!confirm(`Repair ${selected.length} matching image files from this ZIP?\n\nPlant records, journal entries, new photos, and settings will NOT be replaced.\n\nOnly photo bytes whose IDs match the current garden will be updated.`))return;
  await replaceImportedGarden(await openDB(),{images:selected},{imagesOnly:true,onProgress:text=>report(text)});
  report(`Repaired ${selected.length} matching images. No plant or journal records were replaced. Reloading…`);
  await onRestore();
}
async function updateWorker(){
  if(!('serviceWorker' in navigator))throw Error('Service workers are not supported');
  const reg=await navigator.serviceWorker.getRegistration('./');
  if(!reg){report('No existing installed worker. Open the main app online to register it.');return;}
  await reg.update();
  report('Checked for an updated Service Worker. If the new version installed, reopen the garden from the link above. This operation never clears IndexedDB.');
}
async function doTask(fn){if(busy)return;busy=true;
  for(const id of ['inspect','create','download','restore','repair','update'])$(id).disabled=true;
  window.VerdantManagementBusy=true;
  try{await fn();}catch(err){console.error(err);report('Error: '+(err?.message||err)+'\n\nExisting garden data was not deliberately cleared.');}
  finally{busy=false;window.VerdantManagementBusy=false;for(const id of ['inspect','create','restore','repair','update'])$(id).disabled=false;$('download').disabled=!localStorage.getItem(STAGED);}
}
$('inspect').onclick=()=>doTask(inspect);
$('create').onclick=()=>doTask(exportZip);
$('download').onclick=()=>doTask(download);
$('restore').onclick=()=>doTask(restore);
$('repair').onclick=()=>doTask(repairPhotos);
$('update').onclick=()=>doTask(updateWorker);
(async()=>{try{const staged=localStorage.getItem(STAGED);if(!staged)return;const file=await(await(await directory()).getFileHandle(staged)).getFile();if(file.size){$('download').disabled=false;report(`Previous completed ZIP available to re-download (${(file.size/1048576).toFixed(1)} MiB).`);}}catch{}})();

  return () => { if (db) { db.close?.(); db=null; } };
}
