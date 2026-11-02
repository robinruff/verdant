/* Verdant v1.6.5 (Vue 3) — offline-first garden inventory with local MapLibre GL JS.
   IndexedDB stores: plants (GeoJSON geometry), plantTypes, images (Blobs), settings.
   No remote maps, analytics, backend, or required online services at runtime. */
'use strict';

const DB_NAME = 'verdant-garden-v2';
const SHELL_CACHE = 'verdant-shell-v1.6.5-offline';
const DB_VERSION = 1;
const BACKUP_FORMAT = 'verdant-garden-backup';
const BACKUP_SCHEMA = 2;
const STORES = ['plants', 'plantTypes', 'images', 'settings'];
const TAX = globalThis.VerdantTaxonomy;
if (!TAX) throw new Error('Missing local taxonomy.js helper. Garden data was not changed.');
const NAMES = globalThis.VerdantLocalizedNames || {fetchName:async()=>''}; // Older entry pages remain readable.
const TITLE = globalThis.VerdantGardenTitle;
if (!TITLE) throw new Error('Missing garden-title.js helper. Garden data was not changed.');
const EARTH_M_PER_DEG = 111194.92664455874; // R=6,371,000 m, spherical approximation
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const formVal = (fd,field) => String(fd.get(field) || '').trim();
const nowISO = () => new Date().toISOString();
const number = x => typeof x === 'number' && Number.isFinite(x);
const isValidGeo = (lat,lon) => number(lat) && number(lon) && lat>=-90 && lat<=90 && lon>=-180 && lon<=180;
const todayInput = () => { let d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const toInputDate = iso => { let d=new Date(iso); return Number.isFinite(d.getTime()) ? new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16) : todayInput(); };
const dateLabel = iso => { const d=new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Unknown date'; };
const TYPE_PALETTE=['#367c54','#d39032','#6b6ac7','#cf6373','#3d91b6','#967043','#b15c9b','#79a348','#be7350','#467f7e'];
const validColor = c => typeof c==='string' && /^#[0-9a-fA-F]{6}$/.test(c);
// Browser-independent HSL sliders supplement Firefox Android's limited native
// color picker. Saved values remain plain 6-digit hex, as in all older builds.
function hexToHSL(hex){
  const c=hex.replace('#','');const rgb=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255);
  const [r,g,b]=rgb, max=Math.max(...rgb), min=Math.min(...rgb), delta=max-min;
  let h=0,s=0;const l=(max+min)/2;
  if(delta){s=delta/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/delta)%6;break;case g:h=(b-r)/delta+2;break;default:h=(r-g)/delta+4;}}
  return {h:Math.round((h*60+360)%360),s:Math.round(s*100),l:Math.round(l*100)};
}
function hslToHex(h,s,l){
  h=Number(h)/360;s=Number(s)/100;l=Number(l)/100;
  const hue=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return '#'+[0,8,4].map(n=>Math.round(hue(n)*255).toString(16).padStart(2,'0')).join('');
}
function syncColorControls(form,hex,updateSliders=true){
  if(!validColor(hex))return;
  const color=form.elements.color,colorHex=form.querySelector('[data-color-hex]');
  if(color)color.value=hex;if(colorHex)colorHex.value=hex.toLowerCase();
  const hsl=updateSliders?hexToHSL(hex):null;
  for(const [field,value] of Object.entries(hsl||{})){
    const range=form.querySelector(`[data-color-${{h:'hue',s:'saturation',l:'lightness'}[field]}]`);
    if(range)range.value=value;
  }
  const chip=form.querySelector('[data-color-preview]');if(chip)chip.style.background=hex;
  const hue=form.querySelector('[data-color-hue]')?.value||0;
  const sat=form.querySelector('[data-color-saturation]')?.value||0;
  const light=form.querySelector('[data-color-lightness]')?.value||0;
  const satRange=form.querySelector('[data-color-saturation]');if(satRange)satRange.style.background=`linear-gradient(to right,hsl(${hue},0%,${light}%),hsl(${hue},100%,${light}%))`;
  const lightRange=form.querySelector('[data-color-lightness]');if(lightRange)lightRange.style.background=`linear-gradient(to right,#000,hsl(${hue},${sat}%,50%),#fff)`;
}
// GeoJSON [longitude, latitude] is the canonical geometry on every plant.
const pointGeometry=(lat,lon)=>({type:'Point',coordinates:[lon,lat]});
function geometryCoordinate(geometry){
  if(!geometry||!geometry.coordinates)return null;
  const flat=[];
  const visit=coords=>{if(Array.isArray(coords)&&coords.length>=2&&typeof coords[0]==='number'&&typeof coords[1]==='number')flat.push(coords);else if(Array.isArray(coords))for(const x of coords)visit(x);};
  visit(geometry.coordinates);if(!flat.length)return null;
  return {lat:flat.reduce((a,b)=>a+b[1],0)/flat.length,lon:flat.reduce((a,b)=>a+b[0],0)/flat.length};
}
function validGeometry(g){
  if(!g||!['Point','LineString','Polygon'].includes(g.type))return false;
  const point=p=>Array.isArray(p)&&p.length===2&&isValidGeo(p[1],p[0]);
  if(g.type==='Point')return point(g.coordinates);
  if(g.type==='LineString')return Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.every(point);
  if(!Array.isArray(g.coordinates)||!g.coordinates.length)return false;
  return g.coordinates.every(r=>Array.isArray(r)&&r.length>=4&&r.every(point)&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]);
}
function markerCoordinates(marker){return geometryCoordinate(marker?.geometry);}
function typeColor(t) {
  if(!t)return '#75837b';
  if(validColor(t.color))return t.color.toLowerCase();
  // Older plant types have no saved color; derive a stable one from their ID.
  let hash=0;for(const ch of t.id||'')hash=(Math.imul(31,hash)+ch.charCodeAt(0))|0;
  return TYPE_PALETTE[(hash>>>0)%TYPE_PALETTE.length];
}
const plantLabel = p => p ? (p.nameEn || p.nameEs || p.nameDe || p.scientificName || 'Unnamed type') : 'Unidentified plant';
const speciesURL = name => `https://identify.plantnet.org/k-world-flora/species/${encodeURIComponent(name)}/data`;
const safeURL = value => { try { const u=new URL(String(value)); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };

const state = {
  db: null, markers: [], plantTypes: [], images: new Map(), settings: [], map: null,
  imageURLs: new Map(), imageLoadingId:null, mapImageGeneration:0, view:{x:0,y:0,scale:1,rotation:0}, mapReady:false,
  tab:'map', filters:{types:[],genus:[],family:[],taxonActive:false,life:'all',removed:'hide'}, mode:null, targetMarkerId:null,
  calibrationPoint:null, currentMarkerId:null, pendingPhoto:null, candidateIndex:null,
  identification:null, pendingUploads:[], toastTimeout:null, apiKey:'', working:false,
  glMap:null, glLoaded:false, glStyleReady:false, savedCamera:null, previousGardenTab:'map', resumeGPS:false, imageLayerUrl:null, locationWatch:null, locationFix:null, locationFollow:false, locationSession:0,
  locationLastTimestamp:0, locationLastReceived:0, locationPollTimer:null, locationPollPending:false,
  locationOutsideMap:false, locationLastErrorTime:0, transientPhotos:[], searchResults:[], searchQuery:'', searchContext:null
};

function openDB() {
  return new Promise((resolve,reject) => {
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded = () => {
      const db=request.result;
      for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store,{keyPath:'id'});
      // In future versions, add migrations here without deleting existing stores.
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Close other tabs running Verdant before upgrading the database.'));
  });
}
/* v1.5.3 data migration runs in ONE IndexedDB readwrite transaction.
   No DB version/store/ID changes; if any cursor/update fails, transaction
   aborts and no partly converted taxonomy is committed. Idempotent by design. */
function migrateTaxonomy(db) {
  return new Promise((resolve,reject) => {
    const tx=db.transaction('plantTypes','readwrite');
    const store=tx.objectStore('plantTypes');
    let changed=0;
    const cursor=store.openCursor();
    cursor.onsuccess=() => {
      const current=cursor.result;
      if(!current)return;
      const before=current.value,after=TAX.migrateType(before);
      if(['family','genus','species'].some(field=>before[field]!==after[field])) {
        current.update(after);changed++;
      }
      current.continue();
    };
    tx.oncomplete=()=>resolve(changed);
    tx.onerror=()=>reject(tx.error||new Error('Taxonomy migration failed; no changes committed'));
    tx.onabort=()=>reject(tx.error||new Error('Taxonomy migration rolled back'));
  });
}
function dbKeys(store) { return new Promise((resolve,reject)=>{const req=state.db.transaction(store,'readonly').objectStore(store).getAllKeys();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
function dbAll(store) { return new Promise((resolve,reject) => { const req=state.db.transaction(store,'readonly').objectStore(store).getAll(); req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error); }); }
function dbGet(store,id) { return new Promise((resolve,reject) => { const req=state.db.transaction(store,'readonly').objectStore(store).get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error); }); }
function dbChange(store,method,rec) { return new Promise((resolve,reject) => { const tx=state.db.transaction(store,'readwrite'); const obj=tx.objectStore(store);method==='delete'?obj.delete(rec):obj.put(rec);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Database operation aborted')); }); }
const dbPut = (store,record) => dbChange(store,'put',record);
const dbDelete = (store,id) => dbChange(store,'delete',id);
function replaceInArray(arr,record) {const index=arr.findIndex(r=>r.id===record.id); if(index<0)arr.push(record);else arr[index]=record;}
async function saveMarker(marker) {await dbPut('plants',marker);replaceInArray(state.markers,marker);renderAll();}
async function saveType(type) {await dbPut('plantTypes',type);replaceInArray(state.plantTypes,type);renderAll();}
function activePhotoSettings(){return VerdantPhotos.settings(state.settings.find(s=>s.id==='photoOptimization'));}
function populatePhotoSettings(){
  const form=$('#photoOptimizationForm');if(!form)return;
  const settings=activePhotoSettings();
  for(const key of ['targetKB','maxDimension','format']){
    const input=form.elements.namedItem(key);if(input&&document.activeElement!==input)input.value=settings[key];
  }
}
async function saveImage(blob,filename='photo',kind='photo') {
  let output=blob instanceof Blob?blob:new Blob([blob]);
  let optimization=null;
  if(kind==='photo'){
    const config=activePhotoSettings();
    // Identify with Pl@ntNet using the original before this storage step.
    // JPEG/WebP processing is entirely local and touches only new stored photos.
    let processed;
    try{processed=await VerdantPhotos.compress(output,config);}
    catch(err){processed={changed:false,reason:`Processing failed (${errorMessage(err)}); original preserved.`};}
    if(processed.changed){
      optimization={version:1,fingerprint:VerdantPhotos.fingerprint(config),compressedAt:nowISO(),
        width:processed.width,height:processed.height,previousBytes:output.size};
      output=processed.blob;
      filename=String(filename).replace(/\.(jpe?g|png|webp|heic|heif|bmp|avif)$/i,'')+(output.type==='image/webp'?'.webp':'.jpg');
    }else if(processed.reason && processed.reason!=='Already within the selected limits.'){
      toast(`Photo saved without optimization: ${processed.reason}`,true);
    }
  }
  const record={id:uid(),blob:output,name:filename,mimeType:output.type||'application/octet-stream',createdAt:nowISO(),
    ...(optimization?{optimization}:{})};
  await dbPut('images',record);
  // Cache an ID only, never the full photograph Blob.
  state.images.set(record.id,true);
  return record.id;
}
// The only retained original-image object URL is the currently displayed map.
// Journal/list images have short-lived URLs managed by an IntersectionObserver.
function imageURL(id) { return id ? (state.imageURLs.get(id)||'') : ''; }
function forgetImage(id) {
  const url=state.imageURLs.get(id);if(url)URL.revokeObjectURL(url);
  state.imageURLs.delete(id);state.images.delete(id);
  if(state.imageLoadingId===id){state.imageLoadingId=null;state.mapImageGeneration++;}
}
async function ensureMapImage(){
  const id=state.map?.imageId;
  if(!id||!state.images.has(id)||state.imageURLs.has(id)||state.imageLoadingId===id)return;
  const generation=++state.mapImageGeneration;
  state.imageLoadingId=id;
  try{
    const image=await dbGet('images',id);
    if(!image?.blob)throw Error('The background image is missing from local storage.');
    if(generation!==state.mapImageGeneration||state.map?.imageId!==id)return;
    const url=URL.createObjectURL(image.blob);
    for(const [oldId,oldUrl] of state.imageURLs){if(oldId!==id){URL.revokeObjectURL(oldUrl);state.imageURLs.delete(oldId);}}
    state.imageURLs.set(id,url);
    refreshMapLayers(false);
  }catch(err){showError(err);}
  finally{if(state.mapImageGeneration===generation)state.imageLoadingId=null;}
}
// Observe image DOM nodes, not records. Originals are read only when the image
// approaches the viewport; object URLs are released when it leaves the viewport
// or its containing view is replaced. A list of 100 plants stays metadata-only.
const lazyPhotos={observer:null, urls:new Map(), pending:new WeakSet(), visible:new WeakSet()};
function releasePhotos(root){
  if(!root)return;
  for(const img of root.querySelectorAll('img[data-image-id]')){
    lazyPhotos.observer?.unobserve(img);lazyPhotos.visible.delete(img);
    const url=lazyPhotos.urls.get(img);
    if(url){URL.revokeObjectURL(url);lazyPhotos.urls.delete(img);}
    img.removeAttribute('src');
  }
}
function initializePhotoObserver(){
  if(lazyPhotos.observer||!('IntersectionObserver' in window))return;
  lazyPhotos.observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      const img=entry.target;
      if(entry.isIntersecting){lazyPhotos.visible.add(img);loadVisiblePhoto(img);}
      else {lazyPhotos.visible.delete(img);if(img.dataset.imageId && lazyPhotos.urls.has(img)){
        URL.revokeObjectURL(lazyPhotos.urls.get(img));lazyPhotos.urls.delete(img);
        img.removeAttribute('src');
      }}
    }
  },{rootMargin:'240px 0px'});
}
async function loadVisiblePhoto(img){
  if(!img.isConnected||!img.dataset.imageId||lazyPhotos.pending.has(img)||lazyPhotos.urls.has(img))return;
  const id=img.dataset.imageId;lazyPhotos.pending.add(img);
  try{
    const rec=await dbGet('images',id);
    if(!img.isConnected||img.dataset.imageId!==id||!rec?.blob)return;
    // List cards only need thumbnails, never full-size decoded photographs.
    let blob=rec.blob;
    if(img.classList.contains('plant-thumb')&&typeof createImageBitmap==='function'){
      try{
        const bitmap=await createImageBitmap(blob,{resizeWidth:200,resizeHeight:200,resizeQuality:'medium'});
        try{
          const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          canvas.getContext('2d').drawImage(bitmap,0,0);
          blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.68))||blob;
        }finally{bitmap.close();}
      }catch{/* Unsupported codecs fall back to the original Blob. */}
    }
    if(!img.isConnected||img.dataset.imageId!==id||(lazyPhotos.observer&&!lazyPhotos.visible.has(img)))return;
    const url=URL.createObjectURL(blob);lazyPhotos.urls.set(img,url);img.src=url;
  }catch(err){console.warn('Could not display photo',id,err);}
  finally{lazyPhotos.pending.delete(img);}
}
function observePhotos(root){
  initializePhotoObserver();
  for(const img of root.querySelectorAll('img[data-image-id]')){
    if(lazyPhotos.observer)lazyPhotos.observer.observe(img);
    else if(img.getBoundingClientRect().top<innerHeight+200)loadVisiblePhoto(img);
  }
}
async function pruneImages() {
  const referenced=new Set();
  if(state.map?.imageId)referenced.add(state.map.imageId);
  for(const m of state.markers)for(const s of (m.statuses||[])){if(s.imageId)referenced.add(s.imageId);for(const id of (s.imageIds||[]))referenced.add(id);}
  for(const id of [...state.images.keys()])if(!referenced.has(id)){await dbDelete('images',id);forgetImage(id);}
}
async function loadData(){
  // getAll('images') would materialize *all* original Blobs in Firefox RAM.
  await migrateTaxonomy(state.db);
  const [markers,plantTypes,imageIds,settings]=await Promise.all([
    dbAll('plants'),dbAll('plantTypes'),dbKeys('images'),dbAll('settings')
  ]);
  releasePhotos($('#plantList'));releasePhotos($('#modalRoot'));
  for(const url of state.imageURLs.values())URL.revokeObjectURL(url);
  state.imageURLs.clear();state.mapImageGeneration++;state.imageLoadingId=null;
  state.markers=markers;state.plantTypes=plantTypes;
  state.images=new Map(imageIds.map(id=>[id,true]));state.settings=settings;
  state.map=settings.find(s=>s.id==='map')||null;
  state.apiKey=settings.find(s=>s.id==='plantnetKey')?.value||'';
  renderAll();
  if(state.tab!=='settings')void ensureMapImage();
}
async function saveSetting(record) {await dbPut('settings',record);replaceInArray(state.settings,record);if(record.id==='map'){state.map=record;state.mapImageGeneration++;state.imageLoadingId=null;refreshMapLayers(false);void ensureMapImage();}if(record.id==='plantnetKey')state.apiKey=record.value||'';renderAll();}
function typeById(id) {return state.plantTypes.find(t=>t.id===id);}
function markerById(id) {return state.markers.find(m=>m.id===id);}
function effectiveState(marker) {
  const current={alive:true,removed:false,rating:null};
  for(const e of [...(marker.statuses||[])].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id))) {
    if(typeof e.alive==='boolean')current.alive=e.alive;
    if(typeof e.removed==='boolean')current.removed=e.removed;
    if(e.ratingClear===true)current.rating=null;
    else if(Number.isInteger(e.rating)&&e.rating>=1&&e.rating<=10)current.rating=e.rating;
  }
  return current;
}
const latestStatus = m => [...(m.statuses||[])].sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
function statusBadge(s) {return s.removed?'<span class="state-tag removed">○ Removed</span>':s.alive?'<span class="state-tag">● Living</span>':'<span class="state-tag dead">● Dead</span>';}
function markerDisplayName(m) {return m.nickname||plantLabel(typeById(m.plantTypeId));}
function toast(message,isError=false) {
  const node=$('#toast'); node.textContent=message;node.className=isError?'show error':'show';
  clearTimeout(state.toastTimeout);state.toastTimeout=setTimeout(()=>node.className='',4400);
}
function errorMessage(err) {return (err && err.message) || String(err) || 'Unexpected error';}
function showError(err) {console.error('Verdant error:',err);toast(errorMessage(err),true);}
async function safely(fn) {try{return await fn();}catch(err){showError(err);}}
// Recheck MapLibre after hidden-map transitions. CSS and Firefox Android can
// defer layout beyond one rAF; a single resize() while hidden is insufficient.
// Do not destroy the map, recreate its canvas, or reset the user's camera.
let mapRecoveryVersion=0;
function scheduleMapRecovery(reason='resume') {
  const version=++mapRecoveryVersion;
  const recover=()=>{
    if(version!==mapRecoveryVersion||state.tab!=='map'||document.hidden)return;
    const canvas=$('#mapCanvas'),frame=$('#mapViewport'),map=state.glMap;
    if(!map||!canvas||!frame||frame.getBoundingClientRect().width<1||frame.getBoundingClientRect().height<1)return;
    try{
      map.resize();
      // A lost/rebuilt style may be missing the image or plant layers.
      if(state.glStyleReady&&(!map.getSource('garden-plants')||(state.map?.imageId&&imageURL(state.map.imageId)&&imageCorners()&&!map.getLayer('garden-raster'))))refreshMapLayers(false);
      map.triggerRepaint?.();
    }catch(err){console.warn('Map resume ('+reason+'):',err);}
  };
  const start=()=>requestAnimationFrame(()=>requestAnimationFrame(recover));
  if(window.Vue?.nextTick)window.Vue.nextTick(start);else start();
  for(const delay of [180,600])setTimeout(recover,delay);
}
function unloadGardenWorkspace(){
  const map=state.glMap;
  if(map){
    try{const center=map.getCenter();state.savedCamera={center:[center.lng,center.lat],zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()};}catch{}
    try{map.remove();}catch(error){console.warn('Unable to remove MapLibre cleanly',error);}
  }
  state.glMap=null;state.glStyleReady=false;state.glLoaded=false;
  state.mapImageGeneration++;
  releasePhotos($('#plantList'));releasePhotos($('#modalRoot'));
  closePhotoViewer();
  for(const url of state.imageURLs.values())URL.revokeObjectURL(url);
  state.imageURLs.clear();state.imageLoadingId=null;
  if(state.locationWatch!=null){state.resumeGPS=true;stopLocation(false);}else state.resumeGPS=false;
  window.VerdantMapObserver?.disconnect();
  // Avoid dangling dialogs keeping photographs decoded in Settings.
  if($('#modalRoot')?.innerHTML)closeModal();
}
async function restoreGardenWorkspace(){
  await window.Vue.nextTick();
  if(state.tab==='settings')return;
  const mapNode=$('#mapViewport');
  if(mapNode)window.VerdantMapObserver?.observe(mapNode);
  renderAll();
  void ensureMapImage();
  if(state.tab==='map'){
    ensureMap();
    scheduleMapRecovery('workspace-return');
  }
  if(state.resumeGPS){state.resumeGPS=false;toggleLocation();}
}
function setTab(tab) {
  if(window.VerdantManagementBusy){toast('Finish or pause the current data operation before navigating.',true);return;}
  const previous=state.tab;
  if(tab==='settings' && previous!=='settings'){
    state.previousGardenTab=previous;
    unloadGardenWorkspace();
  }
  if(previous==='settings' && tab!=='settings'){
    if(window.VerdantUI?.managementTool)window.VerdantUI.closeManagement();
  }
  state.tab=tab;
  if(window.VerdantUI)window.VerdantUI.tab=tab;
  $$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${tab}`));
  $$('.tab').forEach(t=>{const active=t.dataset.tab===tab;t.classList.toggle('active',active);t.setAttribute('aria-current',active?'page':'false');});
  if(previous==='settings'&&tab!=='settings')void restoreGardenWorkspace();
  else if(tab==='map'){if(!state.glMap)ensureMap();scheduleMapRecovery('tab');setTimeout(()=>followLocation(false),90);}
  window.scrollTo(0,0);
}
function renderAll() {
  const gardenTitle=TITLE.fromSettings(state.settings);
  if(window.VerdantUI)window.VerdantUI.gardenTitle=gardenTitle;
  document.title=`${gardenTitle} — Verdant`;
  const input=$('#gardenTitleInput');
  if(input && document.activeElement!==input)input.value=gardenTitle;
  if(window.VerdantUI)window.VerdantUI.plantCount=state.markers.length;
  else $('#navPlantCount').textContent=state.markers.length;
  if(state.tab!=='settings'&&$('#mapCanvas'))refreshFilterControls();
  const c=getCalibration();
  if(window.VerdantUI)window.VerdantUI.mapPresent=!!state.map;
  $('#mapEmpty')?.classList.toggle('hidden',!!state.map);
  $('#mapViewport')?.classList.toggle('no-map',!state.map);
  if(state.tab!=='settings'&&$('#mapCanvas')){renderMarkers();renderPlantList();renderTypeList();renderLegend();}
  $('#settingsMapInfo').textContent=!state.map?'No map imported yet.':state.map.geo?`GeoTIFF: ${state.map.width} × ${state.map.height} px · EPSG:${state.map.geo.epsg} · positioned automatically`: `Screenshot: ${state.map.width} × ${state.map.height} px · ${state.map.points?.length||0} reference(s) · ${c.valid?'calibrated':'needs calibration'}`;
  $('#apiFeedback').textContent=state.apiKey?'Key saved locally. Test connection when online.':'No API key configured.';
  $('#currentOrigin').textContent=location.origin;
  populatePhotoSettings();
  // Avoid putting a secret into the input's value when merely rerendering.
}

/* Two-point similarity calibration supports an arbitrarily rotated, overhead
   screenshot. East/north metre vectors form an orthogonal transform; a third
   reference provides a real independent accuracy check. */
function getCalibration() {
  if(state.map?.geo)return {valid:true,geotiff:true,epsg:state.map.geo.epsg};
  const points=state.map?.points||[];
  if(points.length<2)return {valid:false,reason:'At least two reference points are needed.'};
  const [a,b]=points;
  if(!isValidGeo(a.lat,a.lon)||!isValidGeo(b.lat,b.lon))return {valid:false,reason:'Invalid GPS reference coordinates.'};
  const lonFactor=EARTH_M_PER_DEG*Math.cos(((a.lat+b.lat)/2)*Math.PI/180);
  const dE=(b.lon-a.lon)*lonFactor,dN=(b.lat-a.lat)*EARTH_M_PER_DEG,dx=b.x-a.x,dy=b.y-a.y;
  const imageDist=Math.hypot(dx,dy),distance=Math.hypot(dE,dN);
  if(imageDist<25||distance<2)return {valid:false,reason:'Choose two farther-apart points (at least 25 pixels and 2 metres).'};
  const aE=(dE*dx-dN*dy)/(dx*dx+dy*dy),bE=(dE*dy+dN*dx)/(dx*dx+dy*dy),scale=Math.hypot(aE,bE);
  if(!number(scale)||scale<=0)return {valid:false,reason:'Invalid GPS reference geometry.'};
  const calib={valid:true,a,aE,bE,scale,lonFactor,distance,verifyError:null,angle:Math.atan2(bE,aE)*180/Math.PI};
  if(points.length>2){const p=points[2],found=pixelToGeoWith(calib,p.x,p.y);
    calib.verifyError=Math.hypot((found.lat-p.lat)*EARTH_M_PER_DEG,(found.lon-p.lon)*lonFactor);
    if(calib.verifyError>Math.max(5,distance*.2)){calib.valid=false;calib.reason=`Third reference disagrees by ${calib.verifyError.toFixed(1)} m. Check GPS points and the image geometry.`;}
  }
  return calib;
}
function pixelToGeoWith(c,x,y){const dx=x-c.a.x,dy=y-c.a.y;
  return {lat:c.a.lat+(c.bE*dx-c.aE*dy)/EARTH_M_PER_DEG,lon:c.a.lon+(c.aE*dx+c.bE*dy)/c.lonFactor};
}
function pixelToGeo(x,y){if(state.map?.geo)return VerdantGeoTIFF.pixelToGeo(state.map.geo,x,y);const c=getCalibration();return c.valid?pixelToGeoWith(c,x,y):null;}
function geoToPixel(lat,lon){
  if(state.map?.geo)return VerdantGeoTIFF.geoToPixel(state.map.geo,lat,lon);
  const c=getCalibration();if(!c.valid)return null;
  const E=(lon-c.a.lon)*c.lonFactor,N=(lat-c.a.lat)*EARTH_M_PER_DEG;
  return {x:c.a.x+(c.aE*E+c.bE*N)/(c.scale*c.scale),y:c.a.y+(c.bE*E-c.aE*N)/(c.scale*c.scale)};
}
function imageDimensions(){return {w:state.map?.width||0,h:state.map?.height||0};}
// For an uncalibrated screenshot use provisional, local-to-app geographic
// coordinates, solely to position the raster while choosing GPS references.
const TEMP_CENTER={lat:36.6497421,lon:-5.2870430};
function temporaryGeo(x,y){
  const {w,h}=imageDimensions(),factor=0.6/EARTH_M_PER_DEG;
  return {lat:TEMP_CENTER.lat+(h/2-y)*factor,lon:TEMP_CENTER.lon+(x-w/2)*factor/Math.cos(TEMP_CENTER.lat*Math.PI/180)};
}
function temporaryPixel(lat,lon){
  const {w,h}=imageDimensions(),factor=0.6/EARTH_M_PER_DEG;
  return {x:w/2+(lon-TEMP_CENTER.lon)*Math.cos(TEMP_CENTER.lat*Math.PI/180)/factor,y:h/2-(lat-TEMP_CENTER.lat)/factor};
}
function hasPositionedImage(){return Boolean(state.map&&getCalibration().valid);}
function imageCorners(){
  if(!state.map)return null;
  const {w,h}=imageDimensions(),geo=hasPositionedImage()?pixelToGeo:temporaryGeo;
  const toPair=(x,y)=>{const pt=geo(x,y);return pt&&isValidGeo(pt.lat,pt.lon)?[pt.lon,pt.lat]:null;};
  const corners=[toPair(0,0),toPair(w,0),toPair(w,h),toPair(0,h)];
  return corners.every(Boolean)?corners:null;
}
function mapCenterPixel(){
  if(!state.glMap||!state.map)return null;
  const c=state.glMap.getCenter();
  return hasPositionedImage()?geoToPixel(c.lat,c.lng):temporaryPixel(c.lat,c.lng);
}
function pointOnImage(p){return !!state.map&&p&&p.x>=0&&p.y>=0&&p.x<=state.map.width&&p.y<=state.map.height;}
function centerMapPixel(px,py){
  if(!state.glMap)return;
  const point=hasPositionedImage()?pixelToGeo(px,py):temporaryGeo(px,py);
  if(point&&isValidGeo(point.lat,point.lon))state.glMap.easeTo({center:[point.lon,point.lat],duration:350});
}
function fitMap(){
  const map=state.glMap,corners=imageCorners();if(!map||!corners)return;
  const x=corners.map(p=>p[0]),y=corners.map(p=>p[1]);
  map.fitBounds([[Math.min(...x),Math.min(...y)],[Math.max(...x),Math.max(...y)]],{padding:30,duration:300,maxZoom:22});
}
function zoomMap(factor){if(state.glMap)state.glMap.easeTo({zoom:state.glMap.getZoom()+Math.log2(factor),duration:260});}
function rotateMap(delta){if(state.glMap)state.glMap.easeTo({bearing:state.glMap.getBearing()+delta*180/Math.PI,duration:280});}
function gardenStyle(){return {version:8,name:'Verdant offline garden',sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#dce8d5'}}]};}
function ensureMap(){
  if(state.glMap||state.tab==='settings'||!$('#mapCanvas'))return;
  if(!window.maplibregl){const alert=$('#mapLibraryError');if(alert){alert.classList.remove('hidden');alert.textContent='The MapLibre module could not initialize. Please reload the application or reinstall this build.';}return;}
  $('#mapLibraryError')?.classList.add('hidden');
  try{
    const map=new maplibregl.Map({container:'mapCanvas',style:gardenStyle(),center:[TEMP_CENTER.lon,TEMP_CENTER.lat],zoom:18,pitch:0,maxPitch:0,maxZoom:23,minZoom:2,attributionControl:false,renderWorldCopies:false});
    state.glMap=map;
    map.on('load',()=>{if(state.glMap!==map)return;state.glStyleReady=true;refreshMapLayers(!state.savedCamera);if(state.savedCamera){map.jumpTo(state.savedCamera);}followLocation(false);});
    // Only user gestures pause GPS follow. Programmatic camera updates must not.
    map.on('dragstart',()=>pauseLocationFollow());
    map.on('rotatestart',e=>{if(e.originalEvent)pauseLocationFollow();});
    map.on('zoomstart',e=>{if(e.originalEvent)pauseLocationFollow();});
    map.on('click',event=>{
      if(state.mode){const rect=$('#mapCanvas').getBoundingClientRect();if(!event.originalEvent)return;
        // An ordinary tap during placement centers the crosshair; dragging stays native.
        map.easeTo({center:event.lngLat,duration:180});return;}
      const hits=map.queryRenderedFeatures(event.point,{layers:['plant-points','plant-lines','plant-fill'].filter(id=>map.getLayer(id))});
      if(hits.length){const id=hits[0].properties.id;if(markerById(id))openMarker(id);}
    });
    map.on('mousemove',e=>{if(!state.mode&&map.getCanvas()){
      const hit=map.queryRenderedFeatures(e.point,{layers:['plant-points','plant-lines','plant-fill'].filter(id=>map.getLayer(id))});
      map.getCanvas().style.cursor=hit.length?'pointer':'grab';}});
    map.on('error',e=>console.warn('MapLibre:',e.error?.message||e));
    map.on('webglcontextrestored',()=>scheduleMapRecovery('webgl-restored'));
    state.glLoaded=true;
  }catch(err){console.error('MapLibre map failed:',err);$('#mapLibraryError').classList.remove('hidden');$('#mapLibraryError').textContent='Map could not start: '+errorMessage(err);}
}
function featureCollection(features=[]){return {type:'FeatureCollection',features};}
function refreshMapLayers(resetView=false){
  const map=state.glMap;if(!map||!state.glStyleReady||state.tab==='settings')return;
  const corners=imageCorners();const url=imageURL(state.map?.imageId);
  if(state.map?.imageId && !url)void ensureMapImage();
  if(map.getLayer('garden-raster'))map.removeLayer('garden-raster');
  if(map.getSource('garden-raster'))map.removeSource('garden-raster');
  if(url&&corners){map.addSource('garden-raster',{type:'image',url,coordinates:corners});map.addLayer({id:'garden-raster',type:'raster',source:'garden-raster',paint:{'raster-fade-duration':0}},map.getLayer('plant-fill')?'plant-fill':undefined);}
  const featureSources=['garden-plants','garden-location'];
  for(const id of featureSources)if(!map.getSource(id))map.addSource(id,{type:'geojson',data:featureCollection()});
  // Fill and line layers also render future polygon/line records; v1.4 edits points only.
  const layers=[
    {id:'plant-fill',type:'fill',source:'garden-plants',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':['get','color'],'fill-opacity':['case',['get','removed'],0.18,0.43]}},
    {id:'plant-outlines',type:'line',source:'garden-plants',filter:['==',['geometry-type'],'Polygon'],paint:{'line-color':['get','color'],'line-width':2.5}},
    {id:'plant-lines',type:'line',source:'garden-plants',filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':7,'line-opacity':['case',['get','removed'],0.35,1]}},
    {id:'plant-points',type:'circle',source:'garden-plants',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':9,'circle-color':['get','color'],'circle-stroke-width':['case',['get','dead'],3,2],'circle-stroke-color':['case',['get','dead'],'#482d23','#ffffff'],'circle-opacity':['case',['get','removed'],0.4,1]}},
    {id:'plant-dead-center',type:'circle',source:'garden-plants',filter:['all',['==',['geometry-type'],'Point'],['==',['get','dead'],true]],paint:{'circle-radius':2.5,'circle-color':'#482d23'}},
    {id:'location-area',type:'fill',source:'garden-location',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#2e84dc','fill-opacity':0.17}},
    {id:'location-border',type:'line',source:'garden-location',filter:['==',['geometry-type'],'Polygon'],paint:{'line-color':'#2e84dc','line-opacity':0.5,'line-width':1}},
    {id:'location-dot',type:'circle',source:'garden-location',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':'#1a75d4','circle-stroke-color':'#fff','circle-stroke-width':3}}
  ];
  for(const layer of layers)if(!map.getLayer(layer.id))map.addLayer(layer);
  renderMarkers();renderLocation();
  if(resetView&&state.map)fitMap();
}
function renderMapImage(resetView=true){
  state.mapReady=!!(state.map?.imageId&&state.images.has(state.map.imageId));
  if(window.VerdantUI)window.VerdantUI.mapPresent=!!state.map;
  $('#mapEmpty')?.classList.toggle('hidden',!!state.map);
  if(state.tab!=='settings'){ensureMap();refreshMapLayers(resetView&&!state.savedCamera);}
}
function markerMatchesFilter(m) {
  const s=effectiveState(m),f=state.filters;
  if(f.taxonActive && !f.types.length)return false;
  if(!TAX.matches(typeById(m.plantTypeId),f))return false;
  if(f.life==='alive'&&!s.alive || f.life==='dead'&&s.alive)return false;
  if(f.removed==='hide'&&s.removed || f.removed==='only'&&!s.removed)return false;
  return true;
}
// A shared Vue taxonomy tree is rendered in Map and Plants. Selecting a parent
// selects all descendant type IDs; changing one species creates a partial parent.
// No selection means unrestricted, for compatibility with older releases.
function refreshFilterControls() {
  const ids=new Set(['unassigned',...state.plantTypes.map(t=>t.id)]);
  state.filters.types=state.filters.types.filter(id=>ids.has(id));
  state.filters.family=[];state.filters.genus=[];
  for(const select of $$('[data-filter-control]'))select.value=state.filters[select.dataset.filterControl];
  if(window.VerdantUI){
    window.VerdantUI.taxonTree=TAX.buildFilterTree(state.plantTypes,plantLabel);
    window.VerdantUI.selectedTaxonIds=[...state.filters.types];
    window.VerdantUI.taxonFilterActive=!!state.filters.taxonActive;
  }
  const n=Number(state.filters.taxonActive)+Number(state.filters.life!=='all')+Number(state.filters.removed!=='hide');
  if($('#mapFilterIndicator'))$('#mapFilterIndicator').textContent=n?`(${n} active)`:'';
  const clear=$('#clearTypeShortcut'),types=state.filters.types;
  if(clear){
    const name=types.length===1 && types[0]!=='unassigned'?plantLabel(typeById(types[0])):types.length===1?'Unassigned':`${types.length} types`;
    clear.classList.toggle('hidden',!state.filters.taxonActive);
    clear.textContent=state.filters.taxonActive?(types.length?`× ${name}`:'× No types'):'';
    clear.title='Clear taxonomy selection';
  }
}
globalThis.VerdantTaxonomyFilterChange=(ids)=>{
  const valid=new Set(['unassigned',...state.plantTypes.map(t=>t.id)]);
  state.filters.types=[...new Set(ids)].filter(id=>valid.has(id));
  state.filters.taxonActive=true;
  state.filters.family=[];state.filters.genus=[];
  updateFilters();
};
globalThis.VerdantTaxonomyFilterReset=()=>{state.filters.types=[];state.filters.taxonActive=false;updateFilters();};
function updateFilters() { refreshFilterControls();renderMarkers();renderPlantList(); }
function showTypeOnMap(id) {
  const type=typeById(id);if(!type){toast('This plant type no longer exists.',true);return;}
  // A type count means all plants of that type, including removed/dead.
  state.filters={types:[id],family:[],genus:[],taxonActive:true,life:'all',removed:'show'};updateFilters();
  const menu=$('#mapFilterMenu');if(menu)menu.open=false;
  setTab('map');
}
function renderMarkers(){
  const map=state.glMap;if(!map||!state.glStyleReady)return;
  const valid=hasPositionedImage();
  const features=valid?state.markers.filter(markerMatchesFilter).filter(m=>validGeometry(m.geometry)).map(m=>{
    const s=effectiveState(m),point=markerCoordinates(m);
    const onImage=pointOnImage(geoToPixel(point.lat,point.lon));
    return onImage?{type:'Feature',id:m.id,geometry:m.geometry,properties:{id:m.id,color:typeColor(typeById(m.plantTypeId)),dead:!s.alive,removed:s.removed,label:markerDisplayName(m)}}:null;
  }).filter(Boolean):[];
  const source=map.getSource('garden-plants');if(source)source.setData(featureCollection(features));
}
function beginPlacement(mode,markerId=null) {
  if(!state.glMap){toast('MapLibre is not ready. Download its local files first, then reload.',true);return;}
  if(!state.map){setTab('map');$('#geoFile').click();toast('Start by importing your garden map.');return;}
  if(mode==='reference'&&state.map?.geo){toast('GeoTIFF maps are already positioned; no calibration required.');return;}
  if(mode!=='reference'&&!getCalibration().valid){setTab('map');openCalibration();toast('Calibrate the map before placing plants.');return;}
  pauseLocationFollow();closeModal();setTab('map');state.mode=mode;state.targetMarkerId=markerId;
  $('#crosshair').classList.remove('hidden');$('#placementBar').classList.remove('hidden');$('#mapBottom').classList.add('hidden');
  $('#mapInstruction').classList.remove('hidden');$('#mapInstruction').textContent='Drag or pinch to position the fixed crosshair · tap to center';
  $('#placementTitle').textContent=mode==='reference'?'Locate the GPS reference':mode==='reposition'?'Move this plant':'Locate your new plant';
  if(mode==='reposition'&&markerId){const marker=markerById(markerId);const coord=markerCoordinates(marker);const p=coord&&geoToPixel(coord.lat,coord.lon);if(p)requestAnimationFrame(()=>centerMapPixel(p.x,p.y));}
}
function cancelPlacement() {state.mode=null;state.targetMarkerId=null;$('#crosshair').classList.add('hidden');$('#placementBar').classList.add('hidden');$('#mapBottom').classList.remove('hidden');$('#mapInstruction').classList.add('hidden');renderMarkers();}
function confirmPlacement() {
  const pos=mapCenterPixel();if(!pointOnImage(pos)){toast('Place the crosshair inside the map image.',true);return;}
  const mode=state.mode,id=state.targetMarkerId;cancelPlacement();
  if(mode==='reference'){state.calibrationPoint=pos;openReferenceForm(pos);return;}
  const geo=pixelToGeo(pos.x,pos.y);if(!geo||!isValidGeo(geo.lat,geo.lon)){toast('Map calibration is missing or invalid.',true);return;}
  if(mode==='reposition'&&id){const marker=markerById(id);if(marker)safely(async()=>{await saveMarker({...marker,geometry:pointGeometry(geo.lat,geo.lon)});openMarker(id);toast('Plant position updated.');});}
  else openNewMarker(geo);
}
async function handleMapFile(file) {
  if(!file)return;
  if(!file.type.startsWith('image/'))throw new Error('Choose a valid map image file.');
  if(file.size>90*1024*1024)throw new Error('Map is larger than 90 MB. Please use a smaller screenshot.');
  if(state.map&&!confirm('Replace your current map screenshot? All saved plants keep their GPS positions, but you must calibrate the new screenshot to display them.'))return;
  const src=URL.createObjectURL(file);let dims;
  try{dims=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(new Error('Could not read this map image.'));img.src=src;});}
  finally{URL.revokeObjectURL(src);}
  if(!dims.width||!dims.height)throw new Error('Map has invalid dimensions.');
  cancelPlacement();
  const imageId=await saveImage(file,file.name,'map');
  const map={id:'map',imageId,width:dims.width,height:dims.height,points:[],updatedAt:nowISO()};
  state.savedCamera=null;await saveSetting(map);renderMapImage(true);await pruneImages();setTab('map');toast('Screenshot saved. Add two GPS reference points next.');openCalibration();
}

/* A georeferenced aerial image is decoded once into a manageable JPEG and
   stored as the same map image Blob used by earlier versions. The extra geo
   transform lives in the existing map setting, not on plant markers. */
async function handleGeoTIFF(file){
  if(!file)return;
  if(!/\.(tif|tiff)$/i.test(file.name) && !/tiff|geotiff/i.test(file.type))throw new Error('Choose a .tif or .tiff GeoTIFF file.');
  if(state.map&&!confirm('Replace the existing map with this GeoTIFF? All plant positions and journals will be kept.'))return;
  const busy=$('#geoBusy');if(busy)busy.textContent='Importing GeoTIFF…';
  toast('Reading GeoTIFF locally…');
  let result;
  try{result=await VerdantGeoTIFF.decode(file,pct=>{if(busy)busy.textContent=`Processing GeoTIFF ${pct}%`;});}
  finally{if(busy)busy.textContent='';}
  const [centerLat,centerLon]=[36.6497421,-5.2870430];
  const center=VerdantGeoTIFF.geoToPixel(result.geo,centerLat,centerLon);
  // Never silently assume the user's garden is inside their uploaded imagery:
  // custom GeoTIFFs can be outside the supplied default location.
  cancelPlacement();
  const imageId=await saveImage(result.blob,file.name.replace(/\.tiff?$/i,'.jpg'),'map');
  state.savedCamera=null;await saveSetting({id:'map',imageId,width:result.width,height:result.height,points:[],geo:result.geo,originalPixels:result.originalPixels,updatedAt:nowISO()});
  renderMapImage(true);await pruneImages();setTab('map');
  toast('GeoTIFF imported and georeferenced. Plant GPS positions have not changed.');
  if(pointOnImage(center)&&!state.markers.length)setTimeout(()=>centerMapPixel(center.x,center.y),150);
}
// Tracking is always opt-in and entirely ephemeral: no GPS fixes are written to IndexedDB.
// Follow is separate from tracking, so a drag pauses camera motion without losing the dot.
function updateLocationControls(){
  const button=$('#locationButton'),follow=$('#followLocationButton');
  if(!button||!follow)return;
  const active=state.locationWatch!=null,hasFix=!!state.locationFix;
  button.textContent=!active?'◎ Locate':hasFix?'◉ GPS on':'◎ Locating…';
  button.title=active?'Stop sharing location with this map':'Start live GPS tracking';
  button.setAttribute('aria-pressed',String(active));
  follow.classList.toggle('hidden',!active||!hasFix);
  follow.textContent=state.locationFollow?'◎ Following':'↗ Follow';
  follow.title=state.locationFollow?'Following your location; drag the map to pause':'Center on your position and follow movement';
  follow.setAttribute('aria-pressed',String(active&&state.locationFollow));
  const indicator=$('#gpsStatus');
  if(indicator){
    indicator.classList.toggle('hidden',!active);
    indicator.textContent=!hasFix?'Waiting for GPS…':state.locationOutsideMap?'Location outside garden map':`GPS ±${Math.round(state.locationFix.accuracy)} m`;
  }
}
function pauseLocationFollow(){
  if(!state.locationFollow)return;
  state.locationFollow=false;
  updateLocationControls();
}
function followLocation(animate=true){
  if(!state.locationFollow||state.mode||state.tab!=='map'||!state.glMap||!state.glStyleReady||!state.locationFix)return;
  const {lat,lon}=state.locationFix,p=geoToPixel(lat,lon);
  if(!pointOnImage(p)){
    if(!state.locationOutsideMap)toast('GPS location is outside the garden map. Tracking continues.',true);
    state.locationOutsideMap=true;updateLocationControls();return;
  }
  state.locationOutsideMap=false;
  updateLocationControls();
  const center=state.glMap.getCenter();
  // Avoid animating every tiny jitter; a larger movement recenters smoothly.
  const meters=Math.hypot((lat-center.lat)*EARTH_M_PER_DEG,(lon-center.lng)*EARTH_M_PER_DEG*Math.cos(lat*Math.PI/180));
  if(meters<1.5)return;
  state.glMap.easeTo({center:[lon,lat],duration:animate?350:0,essential:true});
}
function resumeLocationFollow(){
  if(state.locationWatch==null)return toggleLocation();
  state.locationFollow=true;
  state.locationOutsideMap=false;
  updateLocationControls();
  if(!state.locationFix)refreshLocation(state.locationSession);
  followLocation(false);
}
function renderLocation(){
  if(!state.glMap||!state.glStyleReady)return;
  const fix=state.locationFix,features=[];
  if(fix&&isValidGeo(fix.lat,fix.lon)){
    const r=clamp(fix.accuracy||0,0,10000),circ=[];
    for(let i=0;i<=64;i++){const a=2*Math.PI*i/64;
      circ.push([fix.lon+r*Math.cos(a)/(EARTH_M_PER_DEG*Math.max(.01,Math.cos(fix.lat*Math.PI/180))),fix.lat+r*Math.sin(a)/EARTH_M_PER_DEG]);}
    features.push({type:'Feature',geometry:{type:'Polygon',coordinates:[circ]},properties:{}});
    features.push({type:'Feature',geometry:pointGeometry(fix.lat,fix.lon),properties:{}});
  }
  state.glMap.getSource('garden-location')?.setData(featureCollection(features));
}
function receiveLocation(pos,session){
  if(session!==state.locationSession||state.locationWatch==null)return;
  const c=pos.coords||{};
  if(!isValidGeo(c.latitude,c.longitude))return;
  const timestamp=Number.isFinite(pos.timestamp)?pos.timestamp:Date.now();
  if(timestamp<state.locationLastTimestamp)return;
  state.locationLastTimestamp=timestamp;
  state.locationLastReceived=Date.now();
  state.locationFix={lat:c.latitude,lon:c.longitude,accuracy:Number.isFinite(c.accuracy)?Math.max(0,c.accuracy):0};
  updateLocationControls();renderLocation();followLocation(true);
}
function locationError(err,session){
  if(session!==state.locationSession||state.locationWatch==null)return;
  if(err?.code===1){stopLocation(false);toast('Location permission denied. Check Firefox and Android location permissions.',true);return;}
  // Timeouts and temporary position-unavailable errors are not fatal to watchPosition.
  if(Date.now()-state.locationLastErrorTime>60000){
    state.locationLastErrorTime=Date.now();
    toast('Waiting for a GPS fix: '+(err?.message||'signal unavailable'),true);
  }
}
function refreshLocation(session){
  // Firefox Android can suspend watchPosition while the PWA is backgrounded.
  // Request one fresh fix on resume, or when the stream has gone quiet.
  if(session!==state.locationSession||state.locationWatch==null||state.locationPollPending||document.hidden)return;
  if(typeof navigator.geolocation?.getCurrentPosition!=='function')return;
  state.locationPollPending=true;
  navigator.geolocation.getCurrentPosition(
    pos=>{if(session===state.locationSession)state.locationPollPending=false;receiveLocation(pos,session);},
    err=>{if(session===state.locationSession)state.locationPollPending=false;locationError(err,session);},
    {enableHighAccuracy:true,maximumAge:0,timeout:20000}
  );
}
function stopLocation(notify=true){
  const oldWatch=state.locationWatch;
  state.locationSession++;
  state.locationWatch=null;
  if(oldWatch!=null&&oldWatch!==-1)navigator.geolocation?.clearWatch(oldWatch);
  if(state.locationPollTimer!=null)clearInterval(state.locationPollTimer);
  state.locationPollTimer=null;state.locationPollPending=false;
  state.locationFix=null;state.locationFollow=false;state.locationOutsideMap=false;
  state.locationLastTimestamp=0;state.locationLastReceived=0;
  updateLocationControls();renderLocation();
  if(notify)toast('Live location stopped.');
}
function toggleLocation(){
  if(state.locationWatch!=null){stopLocation();return;}
  if(!navigator.geolocation){toast('This browser does not support location.',true);return;}
  const session=++state.locationSession;
  state.locationFollow=true;state.locationOutsideMap=false;state.locationLastErrorTime=0;
  state.locationWatch=-1; // activated before callbacks, including unusually early ones
  updateLocationControls();
  try{
    const id=navigator.geolocation.watchPosition(
      pos=>receiveLocation(pos,session),err=>locationError(err,session),
      {enableHighAccuracy:true,maximumAge:0,timeout:20000}
    );
    if(session!==state.locationSession){navigator.geolocation.clearWatch(id);return;}
    state.locationWatch=id;updateLocationControls();
    state.locationPollTimer=setInterval(()=>{
      if(!document.hidden&&state.locationWatch!=null&&Date.now()-state.locationLastReceived>20000)refreshLocation(session);
    },12000);
  }catch(err){stopLocation(false);toast('Unable to start GPS: '+errorMessage(err),true);}
}
function typeReference(type){
  if(!type)return '';
  const links=(type.links||[]).map(safeURL).filter(Boolean);
  return links.find(l=>{try{return new URL(l).hostname.toLowerCase().includes('plantnet.org');}catch{return false;}})||links[0]||(type.scientificName?speciesURL(type.scientificName):'');
}
const referenceAnchor=(type,label='Open species reference ↗')=>{const url=typeReference(type);return url?`<a class="reference-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';};

/* Browseable inventory and plant type list. */
function renderPlantList() {
  if(!$('#plantSearch'))return;
  const text=$('#plantSearch').value.toLocaleLowerCase().trim();
  const items=state.markers.filter(m=>{
    const st=effectiveState(m),t=typeById(m.plantTypeId);
    const hay=[m.nickname,TAX.taxonQuery(t)].join(' ').toLocaleLowerCase();
    if(text&&!hay.includes(text))return false;
    return markerMatchesFilter(m);
  }).sort((a,b)=>markerDisplayName(a).localeCompare(markerDisplayName(b)));
  releasePhotos($('#plantList'));
  if(window.VerdantUI){
    window.VerdantUI.plantCards=items.map(m=>{
      const t=typeById(m.plantTypeId),s=effectiveState(m);
      const photoId=latestJournalPhotoId(m);
      return {id:m.id, name:markerDisplayName(m),scientific:t?.scientificName||(!t?'No type assigned':'No scientific name'),
        color:typeColor(t),reference:typeReference(t),photoId:photoId||'',alive:s.alive,removed:s.removed,journalCount:(m.statuses||[]).length};
    });
    void Vue.nextTick(()=>observePhotos($('#plantList')));
    return;
  }
  $('#plantList').innerHTML=items.map(m=>{
    const t=typeById(m.plantTypeId),s=effectiveState(m),photoId=latestJournalPhotoId(m);
    const preview=photoId?`<img class="plant-thumb" data-image-id="${esc(photoId)}" alt="Plant photo" loading="lazy">`:'<div class="plant-thumb blank">✳</div>';
    return `<article class="plant-card" data-open-marker="${esc(m.id)}" role="button" tabindex="0">${preview}<div class="plant-card-body"><h3><span class="plant-type-dot" style="background:${typeColor(t)}"></span>${esc(markerDisplayName(m))}</h3><p>${esc(t?.scientificName||(!t?'No type assigned':'No scientific name'))}</p>${referenceAnchor(t)}<div class="plant-card-footer">${statusBadge(s)}<small>${(m.statuses||[]).length} journal entries</small></div></div></article>`;
  }).join('')||`<div class="empty-list"><div class="big">✳</div><h3>${state.markers.length?'No matching plants':'Your plant collection starts here.'}</h3><p>${state.markers.length?'Try another search or filter.':'Calibrate the garden map, then add your first plant.'}</p><button class="btn btn-primary" data-action="add-marker">+ Add a plant</button></div>`;
  observePhotos($('#plantList'));
}
function renderLegend() {
  const used=state.plantTypes.filter(t=>state.markers.some(m=>m.plantTypeId===t.id));
  const unassigned=state.markers.some(m=>!m.plantTypeId);
  const node=$('#mapLegend');if(!node)return;
  node.innerHTML=used.map(t=>`<span class="legend-item"><span class="legend-dot" style="--dot-color:${typeColor(t)}"></span>${esc(plantLabel(t))}</span>`).join('')+
    (unassigned?'<span class="legend-item"><span class="legend-dot"></span>Unassigned</span>':'')+
    '<span class="legend-item">× = dead · faded = removed</span>';
}
function renderTypeList() {
  if(!$('#typeSearch'))return;
  const search=$('#typeSearch').value.toLocaleLowerCase().trim();
  const types=[...state.plantTypes].filter(t=>TAX.searchable(TAX.taxonQuery(t)).includes(TAX.searchable(search))).sort((a,b)=>plantLabel(a).localeCompare(plantLabel(b)));
  if(window.VerdantUI){
    window.VerdantUI.typeCards=types.map(t=>({id:t.id,name:plantLabel(t), scientific:t.scientificName||'Scientific name not set',taxonomy:[t.family&&`Family: ${t.family}`,t.genus&&`Genus: ${t.genus}`,t.species&&`Species: ${t.species}`].filter(Boolean).join(' · '),
      languages:[t.nameEs&&`ES: ${t.nameEs}`,t.nameDe&&`DE: ${t.nameDe}`].filter(Boolean).join(' · ')||'Add names in other languages',
      color:typeColor(t),reference:typeReference(t),count:state.markers.filter(m=>m.plantTypeId===t.id).length}));
    window.VerdantUI.typeCount=state.plantTypes.length;
    return;
  }
  $('#typeList').innerHTML=types.map(t=>{const count=state.markers.filter(m=>m.plantTypeId===t.id).length;
    return `<article class="type-card"><div class="type-icon" style="--type-color:${typeColor(t)}">❀</div><h3>${esc(plantLabel(t))}</h3><p class="scientific">${esc(t.scientificName||'Scientific name not set')}</p><p class="taxonline">${esc([t.family&&'Family: '+t.family,t.genus&&'Genus: '+t.genus,t.species&&'Species: '+t.species].filter(Boolean).join(' · '))}</p><p class="langline">${esc([t.nameEs&&`ES: ${t.nameEs}`,t.nameDe&&`DE: ${t.nameDe}`].filter(Boolean).join(' · ')||'Add names in other languages')}</p><div class="type-link">${referenceAnchor(t)}</div><footer><span>${count} ${count===1?'plant':'plants'}</span><button class="btn btn-outline btn-small" data-action="edit-type" data-id="${esc(t.id)}">Edit type →</button></footer></article>`;
  }).join('')||`<div class="empty-list"><div class="big">❀</div><h3>${state.plantTypes.length?'No matching types':'Build your plant library.'}</h3><p>${state.plantTypes.length?'Try a different name.':'Add a species once and reuse it whenever you plant another.'}</p><button class="btn btn-primary" data-action="add-type">+ New plant type</button></div>`;
}

/* On-demand, bounded-memory journal photo viewer. Only ONE photo Blob is
   fetched from IndexedDB and one object URL exists at a time. */
const photoViewer={ids:[],index:-1,url:null,token:0,returnFocus:null};
function closePhotoViewer() {
  const open=photoViewer.index>=0;
  ++photoViewer.token;
  if(photoViewer.url)URL.revokeObjectURL(photoViewer.url);
  photoViewer.url=null;photoViewer.ids=[];photoViewer.index=-1;
  $('#photoViewerRoot').replaceChildren();
  document.body.classList.remove('photo-viewer-open');
  const target=photoViewer.returnFocus;photoViewer.returnFocus=null;
  if(open&&target?.isConnected)target.focus({preventScroll:true});
}
async function openPhotoViewer(imageId,trigger) {
  if(!imageId||!state.images.has(imageId))return;
  closePhotoViewer();
  const group=trigger.closest('.ident-photo-grid,.photo-stack');
  const ids=group?[...new Set([...group.querySelectorAll('[data-action="open-photo"]')].map(e=>e.dataset.imageId).filter(id=>state.images.has(id)))]:[imageId];
  photoViewer.ids=ids.includes(imageId)?ids:[imageId];
  photoViewer.returnFocus=trigger;photoViewer.index=0;
  $('#photoViewerRoot').innerHTML=`<div class="photo-viewer" role="dialog" aria-modal="true" aria-label="Journal photo viewer">
      <div class="photo-viewer-toolbar"><span class="photo-viewer-counter" aria-live="polite"></span><button type="button" class="photo-viewer-close" data-action="close-photo" aria-label="Close enlarged photo">×</button></div>
      <div class="photo-viewer-stage"><img alt="Enlarged journal photo"><p class="photo-viewer-message" role="status">Loading photo…</p></div>
      <div class="photo-viewer-nav"><button type="button" data-action="previous-photo" aria-label="Previous photo">‹ Previous</button><span>Swipe to browse photos</span><button type="button" data-action="next-photo" aria-label="Next photo">Next ›</button></div>
    </div>`;
  document.body.classList.add('photo-viewer-open');
  $('#photoViewerRoot .photo-viewer-close').focus({preventScroll:true});
  await showViewerPhoto(photoViewer.ids.indexOf(imageId));
}
async function showViewerPhoto(index) {
  const root=$('#photoViewerRoot');
  if(index<0||index>=photoViewer.ids.length||!root.querySelector('.photo-viewer'))return;
  const token=++photoViewer.token;
  photoViewer.index=index;
  if(photoViewer.url)URL.revokeObjectURL(photoViewer.url);photoViewer.url=null;
  const image=root.querySelector('.photo-viewer-stage img');
  const message=root.querySelector('.photo-viewer-message');
  image.removeAttribute('src');image.classList.add('hidden');
  message.textContent='Loading photo…';message.classList.remove('hidden');
  root.querySelector('.photo-viewer-counter').textContent=`Photo ${index+1} of ${photoViewer.ids.length}`;
  root.querySelector('[data-action="previous-photo"]').disabled=index===0;
  root.querySelector('[data-action="next-photo"]').disabled=index===photoViewer.ids.length-1;
  try {
    const record=await dbGet('images',photoViewer.ids[index]);
    if(token!==photoViewer.token||!root.querySelector('.photo-viewer'))return;
    if(!record?.blob)throw Error('This photo is missing from local storage.');
    photoViewer.url=URL.createObjectURL(record.blob);
    image.src=photoViewer.url;image.classList.remove('hidden');message.classList.add('hidden');
  } catch(err) {
    if(token===photoViewer.token){message.textContent=errorMessage(err);message.classList.remove('hidden');}
  }
}

/* Dialogs, marker details and journal editing. */
function openModal(title,body,footer='',subtitle='',wide=false) {
  discardUploads();
  if(state.pendingPhoto)URL.revokeObjectURL(state.pendingPhoto);
  state.pendingPhoto=null;
  releasePhotos($('#modalRoot'));
  $('#modalRoot').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-head"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
  document.body.classList.add('modal-open');
  observePhotos($('#modalRoot'));
  const focus=$('#modalRoot .modal-close');if(focus)focus.focus({preventScroll:true});
}
function closeModal(){ closePhotoViewer();releasePhotos($('#modalRoot'));clearIdentification();discardUploads();document.body.classList.remove('modal-open');$('#modalRoot').innerHTML='';if(state.tab==='map')scheduleMapRecovery('modal-close');if(state.pendingPhoto)URL.revokeObjectURL(state.pendingPhoto);state.pendingPhoto=null; }
const cancelBtn='<button class="btn btn-outline" data-action="close-modal">Cancel</button>';
// The same Vue taxonomy modal is used by the filters and the plant editor.
// The hidden value is the single source of truth for FormData and remains
// unchanged if the user cancels the picker.
function typeSelect(value='') {
  const selected=typeById(value);
  const name=selected?plantLabel(selected):'— No type yet —';
  return `<div class="type-picker"><input type="hidden" name="plantTypeId" value="${esc(value)}"><button type="button" class="btn btn-outline type-picker-button" data-action="choose-plant-type" aria-haspopup="dialog" aria-controls="taxonomyModal"><span class="type-picker-current">${esc(name)}</span><span aria-hidden="true">⌄</span></button><small class="type-search-count">Choose a species from the searchable family → genus → species tree.</small></div>`;
}

function openNewMarker(geo) {
  openModal('Add a plant',`<form id="newMarkerForm"><div class="form-note">GPS: ${geo.lat.toFixed(7)}, ${geo.lon.toFixed(7)}</div><input type="hidden" name="lat" value="${geo.lat}"><input type="hidden" name="lon" value="${geo.lon}"><div class="field"><label>Plant type (optional)</label>${typeSelect()}</div><div class="field"><label>Identification photos (optional)</label><input type="file" name="newMarkerPhoto" accept="image/*" multiple><p class="hint">Select or take up to five photos of the same plant. Each can be marked leaf, flower, fruit or bark. Photos are temporary unless you choose to keep them.</p><label>Identification flora</label><select name="flora"><option value="nearby">Nearby flora (based on this plant's location)</option><option value="all">All floras (including cultivated plants)</option></select><div id="newPhotoPreview"></div><label class="toggle-row"><input type="checkbox" name="saveIdentificationPhotos"> Keep selected photos in the plant journal</label></div><div class="field"><label>First journal note (optional)</label><textarea name="note" rows="2" maxlength="10000" placeholder="New planting, condition, observations…"></textarea></div><details><summary class="hint">Individual nickname (optional)</summary><input name="nickname" maxlength="120" placeholder="e.g. beside the gate"></details></form>`,`${cancelBtn}<button class="btn btn-outline" type="submit" form="newMarkerForm" value="identify" name="intent">Save & identify ↗</button><button class="btn btn-primary" type="submit" form="newMarkerForm" value="save" name="intent">Save plant →</button>`,'Identify with Pl@ntNet, or simply save the plant');
}
function statusImageIds(entry) {return [...new Set([...(entry?.imageId?[entry.imageId]:[]),...(entry?.imageIds||[])])];}
function latestJournalPhotoId(marker) {
  // Entries can be edited and backdated. Never rely on array insertion order.
  const ordered=[...(marker?.statuses||[])].sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||''))||String(b.id||'').localeCompare(String(a.id||'')));
  for(const entry of ordered)for(const id of statusImageIds(entry).reverse())if(state.images.has(id))return id;
  return '';
}
function photoPreviewCards() {
  return `<div class="photo-stack">${state.pendingUploads.map((photo,i)=>`<div class="photo-stack-item"><img src="${esc(photo.url)}" alt="Selected photograph"><small>${esc(photo.file.name)}</small><label>Plant part</label><select data-photo-organ="${i}">${organOptions(photo.organ)}</select><button type="button" class="tiny-button" data-action="remove-upload" data-index="${i}">Remove</button></div>`).join('')}</div>`;
}
function organOptions(selected='auto') {return [['auto','Automatic'],['leaf','Leaf'],['flower','Flower / bloom'],['fruit','Fruit'],['bark','Bark / trunk']].map(([v,label])=>`<option value="${v}" ${selected===v?'selected':''}>${label}</option>`).join('');}
function updatePhotoPreview(){const node=$('#newPhotoPreview');if(node)node.innerHTML=photoPreviewCards();}
function discardUploads(){for(const item of state.pendingUploads)URL.revokeObjectURL(item.url);state.pendingUploads=[];}
function addUploads(files){const next=[...files];if(state.pendingUploads.length+next.length>10)throw new Error('Add up to ten photos to a journal entry (five maximum for Pl@ntNet).');
  for(const file of next){if(!file.type.startsWith('image/')||file.size>45*1024*1024)throw new Error('Each photo must be an image smaller than 45 MB.');state.pendingUploads.push({file,organ:'auto',url:URL.createObjectURL(file)});}
  updatePhotoPreview();
}
function markerStateText(marker) {const s=effectiveState(marker);return {life:s.alive?'Alive':'Dead',presence:s.removed?'Removed':'In garden',rating:s.rating==null?'—':`${s.rating}/10`};}
function openMarker(id) {
  const marker=markerById(id);if(!marker){toast('Plant not found.',true);return;}
  const markerGeo=markerCoordinates(marker);
  state.currentMarkerId=id;const type=typeById(marker.plantTypeId),s=markerStateText(marker);
  const statuses=[...(marker.statuses||[])].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||b.id.localeCompare(a.id));
  const links=(type?.links||[]).map(url=>safeURL(url)).filter(Boolean);
  if(!links.length&&typeReference(type))links.push(typeReference(type));
  const linkMarkup=links.length?`<ul class="link-list">${links.map(url=>`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(url).hostname)} ↗</a></li>`).join('')}</ul>`:'';
  const journal=statuses.length?statuses.map(e=>{
    const notes=[typeof e.alive==='boolean'?(e.alive?'Marked alive':'Marked dead'):null,typeof e.removed==='boolean'?(e.removed?'Marked removed':'Marked present'):null,
      e.ratingClear?'Rating cleared':Number.isInteger(e.rating)?`Rating ${e.rating}/10`:null,e.identification?.decision==='confirmed'?'Identification confirmed':e.identification?.decision==='unidentified'?'Identification skipped':null].filter(Boolean);
    const photos=statusImageIds(e).filter(id=>state.images.has(id));
    return `<article class="journal-entry"><div class="journal-top"><span class="journal-date">${esc(dateLabel(e.timestamp))}</span><div class="entry-actions"><button data-action="edit-status" data-marker="${esc(id)}" data-status="${esc(e.id)}">Edit</button><button data-action="delete-status" data-marker="${esc(id)}" data-status="${esc(e.id)}">Delete</button></div></div>${e.note?`<p class="journal-note">${esc(e.note)}</p>`:''}${photos.length?`<div class="ident-photo-grid">${photos.map(id=>`<button type="button" class="journal-photo-button" data-action="open-photo" data-image-id="${esc(id)}" aria-label="Enlarge journal photo"><img data-image-id="${esc(id)}" alt="Garden journal photo — tap to enlarge" loading="lazy"></button>`).join('')}</div><div><button class="tiny-button" data-action="identify-status" data-marker="${esc(id)}" data-status="${esc(e.id)}">✳ Identify ${photos.length} photo${photos.length===1?'':'s'} with Pl@ntNet ↗</button></div>`:''}${notes.length?`<div class="journal-changes">${notes.map(x=>`<span class="change-tag">${esc(x)}</span>`).join('')}</div>`:''}${e.identification?.decision==='confirmed'?`<p class="ident-help">Confirmed by you: ${esc(e.identification.scientificName||'species')} · Pl@ntNet suggested score ${number(e.identification.score)?(e.identification.score*100).toFixed(1)+'%':'not available'}</p>`:''}</article>`;
  }).join(''):'<p class="modal-empty">No diary entries yet. Add a photo, note or condition update to start the story.</p>';
  const headPhotoId=latestJournalPhotoId(marker);
  const headIcon=headPhotoId?`<img class="details-icon details-icon-photo plant-thumb" data-image-id="${esc(headPhotoId)}" alt="Most recent journal photograph" loading="lazy">`:'<div class="details-icon">✳</div>';
  openModal(markerDisplayName(marker),`<div class="details-head">${headIcon}<div class="details-title"><h3>${esc(type?plantLabel(type):'Plant not identified yet')}</h3><p>${esc(type?.scientificName||'No scientific name')} · ${markerGeo.lat.toFixed(6)}, ${markerGeo.lon.toFixed(6)}</p></div></div>
    <form id="editMarkerForm" data-id="${esc(id)}"><div class="form-grid"><div class="field"><label>Nickname (optional)</label><input name="nickname" value="${esc(marker.nickname||'')}" maxlength="120" placeholder="Individual nickname"></div><div class="field"><label>Plant type</label>${typeSelect(marker.plantTypeId)}</div></div><div class="details-actions"><button type="submit" class="btn btn-outline btn-small">Save details</button><button type="button" class="btn btn-outline btn-small" data-action="reposition" data-id="${esc(id)}">⌖ Move pin</button><button type="button" class="btn btn-quiet btn-small danger-text" data-action="delete-marker" data-id="${esc(id)}">Delete plant</button></div></form>
    <div class="details-summary"><div class="metric"><span>Life</span><strong>${s.life}</strong></div><div class="metric"><span>Presence</span><strong>${s.presence}</strong></div><div class="metric"><span>Rating</span><strong>${s.rating}</strong></div></div>
    ${linkMarkup?`<h3>Reference links</h3>${linkMarkup}`:''}
    <div class="journal-heading"><h3>Plant journal</h3><button class="btn btn-primary btn-small" data-action="add-status" data-id="${esc(id)}">+ New entry</button></div>${journal}`,'',`${statuses.length} ${statuses.length===1?'entry':'entries'} · newest first`,true);
}
function openStatusForm(markerId,statusId=null) {
  const m=markerById(markerId);if(!m)return;
  const e=statusId?(m.statuses||[]).find(s=>s.id===statusId):null;
  const photos=statusImageIds(e).filter(id=>state.images.has(id)).map(id=>({id}));
  state.pendingPhoto=null;
  openModal(e?'Edit journal entry':'New journal entry',`<form id="statusForm" data-marker="${esc(markerId)}" data-status="${esc(statusId||'')}">
    <div class="field"><label>Date and time</label><input type="datetime-local" name="timestamp" required value="${esc(e?toInputDate(e.timestamp):todayInput())}"></div>
    <div class="field"><label>Notes (optional)</label><textarea name="note" maxlength="10000" placeholder="How is this plant doing? What changed?">${esc(e?.note||'')}</textarea></div>
    <div class="field"><label>Photos (optional)</label><div class="photo-input"><input name="photo" type="file" accept="image/*" multiple><p class="hint">Journal photos are saved locally. You can add them across multiple selections. Pl@ntNet uses a maximum of five photos in one identification.</p><div class="photo-stack">${photos.map(p=>`<div class="photo-stack-item"><button type="button" class="journal-photo-button" data-action="open-photo" data-image-id="${esc(p.id)}" aria-label="Enlarge saved journal photo"><img data-image-id="${esc(p.id)}" alt="Saved journal photo — tap to enlarge"></button><label>Plant part</label><select name="existingOrgan:${esc(p.id)}">${organOptions(e.imageOrgans?.[p.id]||'auto')}</select><label class="toggle-row"><input type="checkbox" name="removeImageId" value="${esc(p.id)}"> Remove this photo</label></div>`).join('')}</div><div id="newPhotoPreview"></div></div></div>
    <div class="form-note">Only fields you explicitly change will affect the plant's current state. “No change” preserves previous values, including when editing historical entries.</div>
    <div class="form-grid"><div class="field"><label>Alive / dead</label><select name="alive"><option value="">No change</option><option value="alive" ${e?.alive===true?'selected':''}>Alive</option><option value="dead" ${e?.alive===false?'selected':''}>Dead</option></select></div><div class="field"><label>Physical presence</label><select name="removed"><option value="">No change</option><option value="present" ${e?.removed===false?'selected':''}>Still present</option><option value="removed" ${e?.removed===true?'selected':''}>Physically removed</option></select></div></div>
    <div class="field"><label>How well is it doing? (1–10)</label><select name="rating"><option value="">No change</option>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${e?.rating===i+1?'selected':''}>${i+1} / 10</option>`).join('')}<option value="clear" ${e?.ratingClear?'selected':''}>Clear current rating</option></select></div>
  </form>`,`${cancelBtn}<button class="btn btn-primary" type="submit" form="statusForm">Save entry →</button>`,'Each entry records only the fields you change');
}
function openTypeForm(id=null) {
  const t=typeById(id)||{color:TYPE_PALETTE[state.plantTypes.length%TYPE_PALETTE.length]};
  openModal(id?'Edit plant type':'New plant type',`<form id="typeForm" data-id="${esc(id||'')}"><div class="species-search"><strong>Import from Pl@ntNet (optional)</strong><p class="hint">Search by the beginning of a scientific name, or paste a Pl@ntNet species link. Online and your own API key required for search.</p><div class="field-row"><input name="speciesQuery" id="speciesQuery" placeholder="e.g. Olea europaea" aria-label="Scientific species search"><button type="button" class="btn btn-outline btn-small" data-action="search-species">Search</button></div><div class="field-row" style="margin-top:8px"><input name="speciesLink" placeholder="https://identify.plantnet.org/…" aria-label="Paste Pl@ntNet species link"><button type="button" class="btn btn-outline btn-small" data-action="import-species-link">Use link</button></div><div id="speciesResults" class="species-results" aria-live="polite"></div></div><div class="form-grid"><div class="field"><label>English name</label><input name="nameEn" value="${esc(t.nameEn||'')}" maxlength="160" placeholder="Olive tree"></div><div class="field"><label>Spanish name</label><input name="nameEs" value="${esc(t.nameEs||'')}" maxlength="160" placeholder="Olivo"></div><div class="field"><label>German name</label><input name="nameDe" value="${esc(t.nameDe||'')}" maxlength="160" placeholder="Olivenbaum"></div><div class="field"><label>Species (full scientific name)</label><input name="scientificName" value="${esc(t.scientificName||t.species||'')}" maxlength="200" placeholder="Olea europaea"></div></div><div class="taxonomy-editor"><h3>Botanical taxonomy</h3><p class="hint">Species is the full scientific name above (for example Olea europaea). Genus and family are optional and are never guessed from its spelling. Enter them manually offline, or import them directly from Pl@ntNet results.</p><div class="form-grid"><div class="field"><label>Family (optional)</label><input name="family" value="${esc(t.family||'')}" maxlength="160" placeholder="Oleaceae" autocomplete="off"></div><div class="field"><label>Genus (optional)</label><input name="genus" value="${esc(t.genus||'')}" maxlength="160" placeholder="Olea" autocomplete="off"></div></div></div><div class="field"><label>Marker color</label><div class="color-edit"><input type="color" name="color" value="${typeColor(t)}" aria-label="Pick any marker color"><input type="text" class="color-hex-input" data-color-hex value="${typeColor(t)}" maxlength="7" spellcheck="false" aria-label="Marker color hexadecimal code" placeholder="#367c54"><span class="color-preview" data-color-preview style="background:${typeColor(t)}" aria-hidden="true"></span></div><div class="color-sliders"><label>Hue<input type="range" data-color-hue min="0" max="359" value="${hexToHSL(typeColor(t)).h}"></label><label>Saturation<input type="range" data-color-saturation min="0" max="100" value="${hexToHSL(typeColor(t)).s}"></label><label>Lightness<input type="range" data-color-lightness min="0" max="100" value="${hexToHSL(typeColor(t)).l}"></label></div><p class="hint">Choose any color with these sliders or enter a six-digit hex code. Gray marks unassigned types.</p></div><div class="field"><label>Reference links — one URL per line</label><textarea name="links" placeholder="https://…">${esc((t.links||[]).join('\n'))}</textarea><p class="hint">Include a Pl@ntNet species page or other trustworthy references.</p></div></form>`,`${id?`<button class="btn btn-quiet danger-text push-left" data-action="delete-type" data-id="${esc(id)}">Delete type</button>`:''}${cancelBtn}<button class="btn btn-primary" type="submit" form="typeForm">${id?'Save changes':'Create type'} →</button>`,'Shared by any number of plants');
}
function openCalibration() {
  if(!state.map){$('#mapFile').click();return;}
  if(state.map.geo){openModal('GeoTIFF already georeferenced',`<p class="form-note">This GeoTIFF contains coordinates in EPSG:${state.map.geo.epsg}. No reference points are required. To change the background, import another GeoTIFF or switch to a screenshot from the Map menu.</p>`, '<button class="btn btn-primary" data-action="close-modal">OK</button>');return;}
  const pts=state.map.points||[],c=getCalibration();
  const quality=pts.length<2?`Add ${2-pts.length} more GPS reference ${pts.length===1?'point':'points'} to calibrate. Choose landmarks far apart, with a difference both east–west and north–south if possible.`
    :c.valid?`Scale ≈ ${c.scale.toFixed(3)} metres/pixel. Image bearing: ${c.angle.toFixed(1)}°. ${c.verifyError==null?'Add a third point to verify precision.':`Third-point verification error: ${c.verifyError.toFixed(1)} m.${c.verifyError>Math.max(5,c.distance*.2)?' Check your GPS references.':''}`}`
    :c.reason;
  openModal('Map calibration',`<div class="form-note">Your plants store WGS84 latitude/longitude, not image pixels. For a directly overhead screenshot (any rotation), each reference pairs a real GPS coordinate with a precise point on the photo. Changing the screenshot will never overwrite your stored GPS positions.</div>
    <h3>GPS reference points</h3>${pts.map((p,i)=>`<div class="calib-point"><div class="point-n">${i+1}</div><div class="point-details"><strong>${Number(p.lat).toFixed(7)}, ${Number(p.lon).toFixed(7)}</strong><small>Image pixel ${Math.round(p.x)}, ${Math.round(p.y)}</small></div><button class="tiny-button danger-text" data-action="delete-reference" data-id="${esc(p.id)}">Remove</button></div>`).join('')||'<p class="modal-empty">No reference points yet.</p>'}
    <p class="calibration-message ${!c.valid&&pts.length>=2?'health-warn':c.valid?'health-good':''}">${esc(quality)}</p>
    <p class="ident-help">Tip: use GPS readings for known landmarks, then pan the image under the crosshair. Tap a spot on the image to center it; zoom for precision. Use directly overhead imagery (no perspective tilt); rotation is supported.</p>`,
    `<button class="btn btn-outline push-left" data-action="close-modal">Done</button>${pts.length<3?'<button class="btn btn-primary" data-action="add-reference">+ Add reference point</button>':''}`,'Two points calibrate; an optional third checks accuracy');
}
function openReferenceForm(p) {
  openModal('GPS reference',`<form id="referenceForm"><div class="form-note">Screenshot point: <strong>${Math.round(p.x)} × ${Math.round(p.y)} px</strong>. Enter the known GPS coordinates of this exact landmark in decimal degrees (WGS84).</div>
    <div class="form-grid"><div class="field"><label>Latitude (north positive)</label><input name="lat" type="number" min="-90" max="90" step="any" required placeholder="36.0000000"></div><div class="field"><label>Longitude (east positive)</label><input name="lon" type="number" min="-180" max="180" step="any" required placeholder="-5.0000000"></div></div><input type="hidden" name="x" value="${p.x}"><input type="hidden" name="y" value="${p.y}"></form>`,`${cancelBtn}<button class="btn btn-primary" type="submit" form="referenceForm">Save reference</button>`,'Use accurate coordinates, not the phone GPS sensor');
}

/* Complete ZIP export and ZIP/legacy JSON atomic restore. Secrets stay local. */
function blobAsBase64(blob) {
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
}
function base64AsBlob(base64,mime) {
  const raw=atob(base64);const chunks=[];
  for(let start=0;start<raw.length;start+=65536){const bytes=new Uint8Array(Math.min(65536,raw.length-start));for(let i=0;i<bytes.length;i++)bytes[i]=raw.charCodeAt(start+i);chunks.push(bytes);}
  return new Blob(chunks,{type:mime});
}
// Low-memory ZIP backup: write to the browser's on-disk Origin Private File System
// in bounded chunks, then offer that completed file to Firefox/Android Downloads.
// This avoids a full-file Blob and Base64 data URLs. The staged file is *not*
// a safe external backup until the user explicitly downloads it.
const STAGED_BACKUP_KEY = 'verdant-staged-zip';
function backupInfo(message){const el=$('#backupInfo');if(el)el.textContent=message;}
async function openBackupDirectory(){
  if(!navigator.storage?.getDirectory)throw new Error('This browser cannot stage large ZIP files on disk. Use verdant-rescue.html to save the records and photographs individually, without clearing site data.');
  return navigator.storage.getDirectory();
}
// Only discard Verdant's temporary ZIP exports, never arbitrary OPFS files or
// IndexedDB records. This is used by the explicit reset flow and the legacy
// "clear staged" action; deleting the staged ZIP is NOT a backup download.
async function clearStagedZips(showFeedback=true){
  let removed=0;
  try{
    if(navigator.storage?.getDirectory){
      const dir=await navigator.storage.getDirectory();
      for await(const [name,entry] of dir.entries()){
        if(entry.kind==='file'&&/^verdant-stage-[a-zA-Z0-9_.-]+\.zip$/.test(name)){
          await dir.removeEntry(name);removed++;
        }
      }
    }
    localStorage.removeItem(STAGED_BACKUP_KEY);
    if(showFeedback)backupInfo(`Cleared ${removed} temporary ZIP(s). Downloaded backups are unaffected.`);
  }catch(err){
    // An explicit reset has already deleted the garden database at this point.
    // A blocked OPFS API must not leave reset stuck with an undefined function.
    localStorage.removeItem(STAGED_BACKUP_KEY);
    if(showFeedback)throw err;
    console.warn('Could not clear temporary Verdant ZIP files:',err);
  }
}
async function downloadStagedBackup(showFailure=true){
  try{
    const filename=localStorage.getItem(STAGED_BACKUP_KEY);
    if(!filename)throw new Error('No staged backup yet. Choose Create ZIP backup first.');
    const dir=await openBackupDirectory();
    const handle=await dir.getFileHandle(filename);const file=await handle.getFile();
    if(!file.size)throw new Error('Staged ZIP file is empty.');
    const url=URL.createObjectURL(file),anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename.replace('verdant-stage-','verdant-backup-');
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),120000);
    backupInfo(`Download requested: ${anchor.download} (${(file.size/1024/1024).toFixed(1)} MB). Check Firefox Downloads and verify the saved ZIP exists. The staged copy is still available here for retrying.`);
  }catch(err){if(showFailure)throw err;backupInfo('No completed ZIP is staged yet.');}
}
async function exportBackup(){
  // Backups are managed inside the lightweight Settings workspace.
  setTab('settings');
  window.VerdantUI?.openManagement?.('backup');
}
function assert(condition,message) {if(!condition)throw new Error('Invalid backup: '+message);}
function uniqueIds(records,label) {
  assert(Array.isArray(records),`${label} is missing`);const ids=new Set();
  for(const r of records){assert(r&&typeof r==='object'&&!Array.isArray(r)&&typeof r.id==='string'&&r.id.length>0,`${label} contains an invalid ID`);assert(!ids.has(r.id),`${label} contains duplicate ID ${r.id}`);ids.add(r.id);}return ids;
}
function prepareBackup(parsed) {
  assert(parsed?.format===BACKUP_FORMAT,'unrecognized backup format');
  assert(Number.isInteger(parsed.schemaVersion),'missing schema version');
  if(parsed.schemaVersion>BACKUP_SCHEMA)throw new Error('This backup was made by a newer version of Verdant. No data was changed.');
  if(parsed.schemaVersion!==BACKUP_SCHEMA)throw new Error('This older backup schema is not supported yet. No data was changed.');
  const d=parsed.data;assert(d&&typeof d==='object','missing data');
  const markerIds=uniqueIds(d.plants,'plants'),typeIds=uniqueIds(d.plantTypes,'plantTypes'),imageIds=uniqueIds(d.images,'images'),settingIds=uniqueIds(d.settings,'settings');
  for(const t of d.plantTypes){for(const field of ['nameEs','nameEn','nameDe','scientificName','family','genus','species'])assert(t[field]==null||typeof t[field]==='string',`plant type ${t.id} has invalid ${field}`);assert(t.color==null||validColor(t.color),`plant type ${t.id} has invalid color`);assert(t.links==null||(Array.isArray(t.links)&&t.links.every(v=>typeof v==='string')),`plant type ${t.id} has invalid links`);}
  for(const m of d.plants){
    assert(validGeometry(m.geometry),`plant ${m.id} has invalid GeoJSON geometry`);
    assert(m.plantTypeId==null||m.plantTypeId===''||typeIds.has(m.plantTypeId),`marker ${m.id} references a missing plant type`);
    assert(m.nickname==null||typeof m.nickname==='string',`marker ${m.id} has invalid nickname`);
    assert(Array.isArray(m.statuses),`marker ${m.id} has no valid status array`);
    uniqueIds(m.statuses,`statuses of ${m.id}`);
    for(const s of m.statuses){
      assert(typeof s.timestamp==='string'&&Number.isFinite(Date.parse(s.timestamp)),`status ${s.id} has invalid timestamp`);
      assert(s.imageId==null||imageIds.has(s.imageId),`status ${s.id} references a missing photo`);
      assert(s.imageIds==null||(Array.isArray(s.imageIds)&&s.imageIds.every(id=>typeof id==='string'&&imageIds.has(id))),`status ${s.id} has missing or invalid photos`);
      assert(s.imageOrgans==null||(s.imageOrgans&&typeof s.imageOrgans==='object'&&!Array.isArray(s.imageOrgans)&&Object.entries(s.imageOrgans).every(([id,v])=>[...statusImageIds(s)].includes(id)&&['auto','leaf','flower','fruit','bark'].includes(v))),`status ${s.id} has invalid photo organ tags`);
      assert(s.note==null||typeof s.note==='string',`status ${s.id} has invalid note`);
      assert(s.alive==null||typeof s.alive==='boolean',`status ${s.id} has invalid alive state`);
      assert(s.removed==null||typeof s.removed==='boolean',`status ${s.id} has invalid removed state`);
      assert(s.rating==null||(Number.isInteger(s.rating)&&s.rating>=1&&s.rating<=10),`status ${s.id} has invalid rating`);
      assert(s.ratingClear==null||typeof s.ratingClear==='boolean',`status ${s.id} has invalid rating clear flag`);
    }
  }
  assert(!settingIds.has('plantnetKey'),'backup must not contain an API key');
  assert(d.settings.every(s=>['map','photoOptimization','gardenTitle'].includes(s.id)),'backup has unsupported or private settings');
  const titleSetting=d.settings.find(s=>s.id==='gardenTitle');
  if(titleSetting)TITLE.validateRecord(titleSetting);
  const photoSettings=d.settings.find(s=>s.id==='photoOptimization');
  if(photoSettings)VerdantPhotos.validate(photoSettings);
  const map=d.settings.find(s=>s.id==='map');
  if(map){
    assert(imageIds.has(map.imageId),'map screenshot is missing');
    assert(Number.isInteger(map.width)&&map.width>0&&Number.isInteger(map.height)&&map.height>0,'map image dimensions invalid');
    assert(Array.isArray(map.points)&&map.points.length<=3,'invalid GPS reference points');
    if(map.geo){const g=map.geo;assert(g&&typeof g==='object'&&[4326,4258,3857,25829,25830,25831,32629,32630,32631].includes(g.epsg)&&[g.x0,g.y0,g.a??g.dx,g.b??0,g.c??0,g.d??g.dy].every(number)&&Math.abs((g.a??g.dx)*(g.d??g.dy)-(g.b??0)*(g.c??0))>1e-14,'invalid GeoTIFF georeferencing');}
    uniqueIds(map.points,'map reference points');
    for(const p of map.points)assert(isValidGeo(p.lat,p.lon)&&number(p.x)&&number(p.y)&&p.x>=0&&p.x<=map.width&&p.y>=0&&p.y<=map.height,'invalid calibration reference');
  }
  const images=[];
  for(const img of d.images){
    assert(img.blob instanceof Blob || (typeof img.base64==='string'&&img.base64.length>0&&/^[A-Za-z0-9+/]*={0,2}$/.test(img.base64)),'image data invalid');
    assert(typeof img.mimeType==='string'&&img.mimeType.startsWith('image/'),'image has invalid MIME type');
    let blob;try{blob=img.blob instanceof Blob?img.blob:base64AsBlob(img.base64,img.mimeType);}catch{throw new Error('Image '+img.id+' has corrupt Base64 content. No data was changed.');}
    assert(blob.size>0,'empty image');
    images.push({id:img.id,name:String(img.name||'image'),mimeType:img.mimeType,createdAt:img.createdAt||null,blob});
  }
  // The referenced IDs and all Blobs have been validated before any write begins.
  // Match the Settings workspace restore path: importing old backups
  // without a photo profile must not inherit this device's unrelated limits.
  return {plants:d.plants,plantTypes:d.plantTypes,images,
    settings:[...d.settings.filter(s=>s.id!=='photoOptimization'),
      VerdantPhotos.settings(d.settings.find(s=>s.id==='photoOptimization'))]};
}
function replaceDatabase(prepared,apiKeyRecord,previousTitleRecord) {
  return new Promise((resolve,reject)=>{
    const tx=state.db.transaction(STORES,'readwrite');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Restore failed'));tx.onabort=()=>reject(tx.error||new Error('Restore aborted; old data remains intact'));
    for(const store of STORES)tx.objectStore(store).clear();
    for(const store of STORES)for(const r of prepared[store])tx.objectStore(store).put(r);
    if(apiKeyRecord)tx.objectStore('settings').put(apiKeyRecord);
    // A pre-1.5.4 ZIP has no title: keep the current local title in that case.
    if(previousTitleRecord && !prepared.settings.some(s=>s.id==='gardenTitle'))tx.objectStore('settings').put(previousTitleRecord);
  });
}
async function importBackup(file) {
  if(!file)return;
  const magic=new Uint8Array(await file.slice(0,4).arrayBuffer());
  const zipped=magic.length===4&&magic[0]===0x50&&magic[1]===0x4b&&magic[2]===0x03&&magic[3]===0x04;
  const parsed=zipped?await VerdantZip.parseVerdantZip(file,name=>backupInfo(`Checking ZIP integrity: ${name}`)):JSON.parse(await file.text());
  const prepared=prepareBackup(parsed);
  const decision=confirm(`REPLACE all local garden data?\n\nIncoming backup:\n• ${prepared.plants.length} plants\n• ${prepared.plantTypes.length} plant types\n• ${prepared.images.length} images (including map)\n\nAll current garden records, photos and calibration will be replaced. Your API key stays local. Export your current garden first if you want a fallback.`);
  if(!decision)return;
  const secret=await dbGet('settings','plantnetKey');
  const previousTitle=await dbGet('settings','gardenTitle');
  const {replaceImportedGarden}=await import('./src/import-photos.js');
  await replaceImportedGarden(state.db,prepared,{apiKey:secret,previousTitle,
    onProgress:message=>backupInfo(message)});
  closeModal();cancelPlacement();await loadData();renderMapImage(true);setTab('map');toast('Backup restored successfully. All IDs and photos retained.');
}

// A PWA cannot uninstall itself; this only deletes Verdant data and its own cache.
function showResetWarning(){
  openModal('Erase Verdant completely?',`<div class="form-note warning"><strong>Permanent action.</strong> This deletes all plants, types, journals, photos, map images and calibration, and your Pl@ntNet key from this browser. It also removes any staged ZIP exports, clears Verdant's offline cache and unregisters its service worker. It cannot be undone.</div><p>Export a backup first if you might want the data again. Removing the installed home-screen app must be done from Android or your browser.</p><form id="resetForm"><div class="field"><label>Type RESET to confirm</label><input name="confirmation" placeholder="RESET" autocomplete="off" required spellcheck="false"></div></form>`,`${cancelBtn}<button class="btn btn-outline danger-text" type="submit" form="resetForm">Permanently erase this app</button>`,'All local garden data will be lost');
}
async function deleteDB(name){
  return new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase(name);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Close any other open Verdant tabs, then retry.'));});
}
async function resetEntireApp(){
  if(state.locationWatch!=null)stopLocation(false);
  state.glMap?.remove();state.glMap=null;state.glStyleReady=false;
  releasePhotos($('#plantList'));releasePhotos($('#modalRoot'));
  for(const url of state.imageURLs.values())URL.revokeObjectURL(url);state.imageURLs.clear();
  state.markers=[];state.plantTypes=[];state.images.clear();state.settings=[];state.map=null;state.apiKey='';
  if(state.db){state.db.close();state.db=null;}
  await deleteDB(DB_NAME);
  await clearStagedZips(false);
  // Clear the previous v1 database as part of this explicitly requested full reset.
  await deleteDB('verdant-garden');
  if('caches' in window){for(const name of await caches.keys())if(name.startsWith('verdant-shell-'))await caches.delete(name);}
  if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration('./');if(reg?.active?.scriptURL.endsWith('/sw.js'))await reg.unregister();}
  $('#modalRoot').innerHTML='';
  document.body.classList.remove('modal-open');
  document.querySelector('main').innerHTML=`<section class="reset-complete"><h1>Verdant data erased</h1><p>Garden records, map, photos and local key have been removed. To uninstall the PWA, long-press its home-screen icon and choose <strong>Uninstall</strong> or <strong>Remove</strong> (the exact wording varies by browser and Android).</p><p>Reopen the site with your local server to start a new garden.</p></section>`;
}
/* Optional Pl@ntNet integration. Only a deliberate user action sends a photo. */
function apiError(response) {
  if(response.status===401||response.status===403)return new Error('API key rejected or origin not authorized. Check the key, “expose my API key”, and the exact authorized app origin.');
  if(response.status===429)return new Error('Pl@ntNet quota reached. Try again after its daily quota resets. Your photo remains saved locally.');
  if(response.status===400||response.status===415)return new Error('Pl@ntNet did not accept the photo. Try a clear JPEG or PNG of a single plant.');
  return new Error(`Pl@ntNet request failed (HTTP ${response.status}). Your local garden remains unchanged.`);
}
async function testPlantnet() {
  const feedback=$('#apiFeedback');if(!state.apiKey){toast('Save your personal API key first.',true);return;}
  if(!navigator.onLine){toast('Connect to the internet to test Pl@ntNet.',true);return;}
  feedback.textContent='Checking quota and authorization…';
  try {
    const url=`https://my-api.plantnet.org/v2/quota/daily?api-key=${encodeURIComponent(state.apiKey)}`;
    const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw apiError(res);
    const json=await res.json(),quota=json?.quota?.identify;
    const detail=quota?`Daily identification quota: ${quota.remaining ?? 'unknown'} remaining out of ${quota.total ?? 'unknown'}.`:'Connected. Quota details were not returned.';
    feedback.textContent='✓ Pl@ntNet connected. '+detail;
    toast('Pl@ntNet connection successful.');
  }catch(err){feedback.textContent='Connection failed: '+(err instanceof TypeError?'Browser request blocked. Check CORS and the authorized origin.':errorMessage(err));toast(feedback.textContent,true);}
}
async function apiPhoto(blob) {
  if(blob.type==='image/jpeg'||blob.type==='image/png')return {blob,name:blob.type==='image/png'?'plant.png':'plant.jpg'};
  const bitmap=await createImageBitmap(blob);
  try{
    const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(new Error('Could not convert photo to JPEG')),'image/jpeg',.88));
    return {blob:jpeg,name:'plant.jpg'};
  }finally{bitmap.close();}
}
function photoFromStatus(markerId,statusId) {const marker=markerById(markerId);return marker?.statuses?.find(s=>s.id===statusId);}
function identificationPhotoHTML(info) {return `<div class="ident-photo-grid">${info.photos.map(photo=>`<div><img src="${esc(photo.url)}" alt="Identification photo (${esc(photo.organ)})"><small>${esc(photo.organ)}</small></div>`).join('')}</div>`;}
function clearIdentification() {if(state.identification){for(const photo of state.identification.photos||[])URL.revokeObjectURL(photo.url);}state.identification=null;}
async function identifyStatus(markerId,statusId) {
  const entry=photoFromStatus(markerId,statusId),photos=[];
  for(const id of statusImageIds(entry)){if(!state.images.has(id))continue;const rec=await dbGet('images',id);if(rec?.blob)photos.push({blob:rec.blob,organ:entry.imageOrgans?.[id]||'auto'});}
  if(!photos.length)throw new Error('This journal entry has no photos.');
  if(photos.length>5)throw new Error('Pl@ntNet accepts up to five photos. Use a journal entry with five photos or fewer.');
  return identifyWithPhotos(markerId,statusId,photos);
}
async function nearbyFlora(lat,lon){
  try{
    const url=`https://my-api.plantnet.org/v2/projects?lat=${lat}&lon=${lon}&api-key=${encodeURIComponent(state.apiKey)}`;
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)return {id:'all',title:'All floras'};
    const projects=await response.json();if(!Array.isArray(projects))return {id:'all',title:'All floras'};
    // Kew-TDWG regional floras are preferred over legacy/thematic collections.
    const chosen=projects.find(p=>/^k-[a-z0-9-]+$/.test(p.id)&&p.id!=='k-world-flora');
    return chosen?{id:chosen.id,title:chosen.title||chosen.id}:{id:'all',title:'All floras'};
  }catch{return {id:'all',title:'All floras'};}
}
async function identifyWithPhotos(markerId,statusId,photos,region='nearby') {
  if(!photos.length||photos.length>5)throw new Error('Select between one and five photos of the same plant.');
  const marker=markerById(markerId);if(!marker)throw new Error('Plant record is missing.');
  clearIdentification();
  const info={markerId,statusId,photos:photos.map(p=>({blob:p.blob||p.file,organ:p.organ||'auto',url:URL.createObjectURL(p.blob||p.file)})),candidates:[],raw:null,region,project:'all',projectTitle:'All floras'};
  state.identification=info;state.candidateIndex=0;
  const footer='<button class="btn btn-outline" data-action="close-modal">Close</button>';
  if(!state.apiKey){openModal('Pl@ntNet setup needed',`${identificationPhotoHTML(info)}<p class="form-note warning">Enter your own API key in Settings. Temporary identification photos are not automatically saved. Save photos in the journal if you want to keep them.</p><button class="btn btn-outline" data-action="go-settings">Open API settings →</button>`,footer);return;}
  if(!navigator.onLine){openModal('Identification needs internet',`${identificationPhotoHTML(info)}<p class="form-note warning">You are offline. Temporary photos are not saved; you may identify later using journal photos, or select them again when online.</p>`,footer);return;}
  openModal('Identifying plant…',`${identificationPhotoHTML(info)}<p class="ident-help">Sending ${photos.length} photo${photos.length===1?'':'s'} directly to Pl@ntNet. Your images are not saved unless you explicitly chose to keep them in the journal.</p>`,footer);
  try{
    const flora=region==='nearby'?await nearbyFlora(markerCoordinates(marker).lat,markerCoordinates(marker).lon):{id:'all',title:'All floras'};
    const form=new FormData();let total=0;
    for(const [i,photo] of info.photos.entries()){
      const converted=await apiPhoto(photo.blob);total+=converted.blob.size;
      form.append('images',converted.blob,`plant-${i+1}-${converted.name}`);
      form.append('organs',photo.organ);
    }
    if(total>50*1024*1024)throw new Error('The selected images exceed Pl@ntNet’s 50 MB total request limit. Select smaller photos.');
    info.project=flora.id;info.projectTitle=flora.title;
    const url=`https://my-api.plantnet.org/v2/identify/${encodeURIComponent(flora.id)}?api-key=${encodeURIComponent(state.apiKey)}&nb-results=3&include-related-images=true&lang=en`;
    const res=await fetch(url,{method:'POST',body:form,cache:'no-store'});if(!res.ok)throw apiError(res);
    const data=await res.json();const candidates=Array.isArray(data.results)?data.results.slice(0,3):[];
    if(!candidates.length)throw new Error('No species suggestions were returned. Try a different leaf or flower photograph.');
    if(state.identification!==info)return;
    info.candidates=candidates;info.raw={version:data.version,remainingIdentificationRequests:data.remainingIdentificationRequests};
    renderIdentification();
  }catch(err){if(state.identification!==info)return;
    const msg=err instanceof TypeError?'Network request failed. Check your connection and allow this exact localhost origin in your Pl@ntNet API settings.':errorMessage(err);
    openModal('Identification unavailable',`${identificationPhotoHTML(info)}<div class="form-note warning">${esc(msg)}</div><p class="ident-help">No photos are automatically saved. Your plant marker and any explicitly saved journal notes remain available offline.</p>`,footer);
  }
}
function relatedImage(candidate) {
  const imgs=candidate?.images||[];const selected=Array.isArray(imgs)?imgs[0]:null;
  if(!selected)return null;const url=selected.url;return {url:safeURL(typeof url==='string'?url:url?.m||url?.o||url?.s||''),author:selected.author||'',license:selected.license||'',citation:selected.citation||''};
}
function renderIdentification() {
  const id=state.identification;if(!id?.candidates?.length)return;
  const candidateHtml=id.candidates.map((c,i)=>{
    const scientific=c.species?.scientificName||c.species?.scientificNameWithoutAuthor||'Unknown';
    const common=c.species?.commonNames?.[0]||scientific,im=relatedImage(c),score=number(c.score)?`${(c.score*100).toFixed(1)} / 100`: 'Unknown';
    return `<label class="candidate ${state.candidateIndex===i?'selected':''}"><input type="radio" name="candidate" value="${i}" ${state.candidateIndex===i?'checked':''}><div>${im?.url?`<img class="candidate-image" src="${esc(im.url)}" alt="Pl@ntNet reference" loading="lazy" referrerpolicy="no-referrer">`:'<div class="candidate-image" style="display:grid;place-items:center;font-size:28px;color:#80a384">✳</div>'}</div><div style="min-width:0"><h4>${i===0?'✳ ':''}${esc(common)}</h4><div class="sci">${esc(scientific)}</div><p>Similarity score: <strong>${esc(score)}</strong> · <a href="${esc(speciesURL(scientific))}" target="_blank" rel="noopener noreferrer">Pl@ntNet entry ↗</a></p>${im?.url?`<small>${esc(im.citation||`Photo: ${im.author||'contributor'} / Pl@ntNet, ${im.license||'licence on source'}`)}</small>`:''}</div></label>`;
  }).join('');
  openModal('Review identification',`${identificationPhotoHTML(id)}<div class="form-note">Pl@ntNet suggests; <strong>you decide.</strong> Scores are model similarity scores, not guaranteed probabilities. Flora: <strong>${esc(id.projectTitle)}</strong>. No identification photos are retained unless you explicitly saved them.</div>${candidateHtml}
    <p class="ident-help">${number(id.raw?.remainingIdentificationRequests)?`${id.raw.remainingIdentificationRequests} identification requests left today. `:''}Online reference photos are not saved in your garden.</p>`,
    `<button class="btn btn-outline push-left" data-action="reject-identification">None of these</button><button class="btn btn-outline" data-action="retry-identification">Retry</button><button class="btn btn-primary" data-action="confirm-identification">Confirm species →</button>`,'Choose deliberately before saving',true);
}
async function finishIdentification(choiceIndex) {
  const info=state.identification;if(!info)return;
  const marker=markerById(info.markerId);if(!marker)throw new Error('The original plant is missing.');
  const next={...marker,statuses:(marker.statuses||[]).map(s=>({...s}))};
  let change=info.statusId?next.statuses.find(s=>s.id===info.statusId):null;
  if(choiceIndex==null){if(change)change.identification={decision:'unidentified',checkedAt:nowISO(),source:'plantnet'};if(change)await saveMarker(next);clearIdentification();if(!change)closeModal();openMarker(next.id);toast('No identification applied.');return;}
  const c=info.candidates[choiceIndex];if(!c)throw new Error('Select a species first.');
  const sci=c.species?.scientificNameWithoutAuthor||c.species?.scientificName;if(!sci)throw new Error('This suggestion has no scientific name.');
  const existing=state.plantTypes.find(t=>t.scientificName&&t.scientificName.trim().toLocaleLowerCase()===sci.trim().toLocaleLowerCase());
  let type=existing;
  if(!type){const names=await localizedNames(sci);type=TAX.migrateType({id:uid(),nameEn:c.species?.commonNames?.[0]||'',nameEs:names.es||'',nameDe:names.de||'',...TAX.fromPlantNetSpecies(c.species),links:[speciesURL(c.species?.scientificName||sci)],createdAt:nowISO()});await saveType(type);}
  next.plantTypeId=type.id;
  if(!change){change={id:uid(),timestamp:nowISO(),note:'',imageIds:[]};next.statuses.push(change);}
  change.identification={decision:'confirmed',source:'plantnet',scientificName:sci,score:c.score,confirmedAt:nowISO(),modelVersion:info.raw?.version||null,project:info.project,
    suggestions:info.candidates.map(x=>({scientificName:x.species?.scientificNameWithoutAuthor||x.species?.scientificName||'',score:x.score}))};
  await saveMarker(next);clearIdentification();openMarker(next.id);toast(`Identification confirmed: ${sci}`);
}
// Localized common names are only retrieved after explicit Pl@ntNet selection.
// These GETs never upload photos; failed lookups never prevent saving a type.
async function localizedNames(scientificName, languages=['es','de']) {
  if(!state.apiKey || !navigator.onLine)return {};
  const results=await Promise.allSettled(languages.map(lang=>NAMES.fetchName({
    scientificName,lang,apiKey:state.apiKey,fetcher:fetch
  })));
  return Object.fromEntries(languages.flatMap((lang,i)=>results[i].status==='fulfilled' && results[i].value?[[lang,results[i].value]]:[]));
}
async function searchPlantNetSpecies() {
  const query=$('#speciesQuery')?.value.trim(),node=$('#speciesResults');if(!node)return;
  if(!query||query.length<2){node.textContent='Enter at least two letters of the scientific name.';return;}
  if(!state.apiKey){node.textContent='Save a personal Pl@ntNet API key in Settings first.';return;}
  if(!navigator.onLine){node.textContent='Species search needs internet. You can still enter names manually.';return;}
  node.textContent='Searching scientific names…';state.searchResults=[];
  try{
    // The project species endpoint includes both genus and family; the global
    // list may omit family. Fallback is explicit and never guesses missing data.
    const suffix=`prefix=${encodeURIComponent(query)}&pageSize=12&page=1&lang=en&api-key=${encodeURIComponent(state.apiKey)}`;
    let results=[], lastError=null;
    for(const endpoint of ['v2/projects/k-world-flora/species','v2/species']) {
      try {
        const res=await fetch(`https://my-api.plantnet.org/${endpoint}?${suffix}`,{cache:'no-store'});
        if(!res.ok)throw apiError(res);
        const data=await res.json();
        results=Array.isArray(data)?data:Array.isArray(data.results)?data.results:[];
        if(results.length)break;
      }catch(err){lastError=err;if(endpoint==='v2/species')throw err;}
    }
    if($('#speciesQuery')?.value.trim()!==query)return;
    state.searchResults=results;
    node.innerHTML=state.searchResults.length?state.searchResults.map((species,i)=>`<button type="button" class="species-choice" data-action="choose-species" data-index="${i}"><strong>${esc(species.scientificNameWithoutAuthor||species.scientificName||'Unlabelled')}</strong><small>${esc((species.commonNames||[]).slice(0,3).join(' · ')||'Scientific name only')}</small></button>`).join(''):'No matches. Try the start of a different scientific name.';
  }catch(err){node.textContent=err instanceof TypeError?'Network/CORS error. Check Pl@ntNet origin authorization.':errorMessage(err);}
}
async function chooseSpeciesResult(index){
  const species=state.searchResults[index],form=$('#typeForm');if(!species||!form)return;
  const sci=species.scientificNameWithoutAuthor||species.scientificName;if(!sci)return;
  const existing=state.plantTypes.find(t=>t.scientificName?.trim().toLowerCase()===sci.trim().toLowerCase());
  if(existing&&!form.dataset.id){const node=$('#speciesResults');if(node)node.textContent='This species already exists in your library. Edit that type instead of creating a duplicate.';return;}
  const imported=TAX.fromPlantNetSpecies(species);
  form.elements.scientificName.value=imported.species;
  // Pl@ntNet is the only automatic taxonomy source. An unavailable field
  // stays untouched when editing, and blank when creating a type.
  for(const field of ['genus','family'])if(imported[field])form.elements[field].value=imported[field];
  if(!form.elements.nameEn.value.trim() && species.commonNames?.[0])form.elements.nameEn.value=species.commonNames[0];
  const link=speciesURL(sci),links=form.elements.links.value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!links.includes(link))form.elements.links.value=[...links,link].join('\n');
  const status=$('#speciesResults');
  status.textContent=`Selected ${sci}. Loading Spanish and German common names when available…`;
  const names=await localizedNames(sci);
  if(form.isConnected && form.elements.scientificName.value===imported.species){
    if(names.es && !form.elements.nameEs.value.trim())form.elements.nameEs.value=names.es;
    if(names.de && !form.elements.nameDe.value.trim())form.elements.nameDe.value=names.de;
  }
  if(form.isConnected && form.elements.scientificName.value===imported.species)status.textContent=`Selected ${sci}. ${Object.keys(names).length?'Localized names added where available.':'No additional localized names returned.'} Review fields before saving.`;
}
function importPlantNetLink(){
  const form=$('#typeForm'),text=form?.elements.speciesLink.value.trim(),node=$('#speciesResults');if(!form)return;
  const url=safeURL(text);if(!url){node.textContent='Paste a valid https:// Pl@ntNet species URL.';return;}
  const host=new URL(url).hostname;if(!(host==='plantnet.org'||host.endsWith('.plantnet.org'))){node.textContent='This does not look like a Pl@ntNet link.';return;}
  const segments=new URL(url).pathname.split('/').filter(Boolean);const index=segments.indexOf('species');let species='';
  if(index>=0&&segments[index+1]){try{species=decodeURIComponent(segments[index+1]);}catch{species=segments[index+1];}}
  if(species&& !/^\d+$/.test(species))form.elements.scientificName.value=species;
  const links=form.elements.links.value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!links.includes(url))form.elements.links.value=[...links,url].join('\n');
  if(species&&!/^\d+$/.test(species))form.elements.speciesQuery.value=species;
  node.textContent=species?`Filled in “${species}” from the link (unverified). Use Search and choose a Pl@ntNet result to import genus and family, when available.`:'Link added. Enter a scientific or common name to complete this type.';
}

/* Event delegation keeps the HTML compact and the dynamically-created dialogs simple. */
async function action(name,el) {
  const id=el.dataset.id, markerId=el.dataset.marker,statusId=el.dataset.status;
  switch(name) {
    case 'close-modal': clearIdentification();closeModal();return;
    case 'choose-plant-type':window.VerdantUI?.openPlantTypeModal(el.closest('.type-picker')?.querySelector('[name=plantTypeId]'));return;
    case 'open-photo':await openPhotoViewer(el.dataset.imageId,el);return;
    case 'close-photo':closePhotoViewer();return;
    case 'previous-photo':await showViewerPhoto(photoViewer.index-1);return;
    case 'next-photo':await showViewerPhoto(photoViewer.index+1);return;
    case 'show-type-on-map':showTypeOnMap(id);return;
    case 'clear-taxonomy-group':globalThis.VerdantTaxonomyFilterReset();return;
    case 'clear-type-filter':globalThis.VerdantTaxonomyFilterReset();return;
    case 'help': openModal('Getting started',`<div class="form-note"><strong>1. Import a cropped GeoTIFF.</strong> It positions itself automatically; a screenshot with two calibration points still works.</div><p class="ident-help"><strong>2. Optional live GPS.</strong> Tap Locate to start tracking. The blue dot and accuracy circle update with new phone fixes, and the map follows your movement. Drag the map to stop camera following without stopping GPS, then tap Follow to recenter. Tap GPS on to stop tracking.</p><p class="ident-help"><strong>3. Add plants.</strong> Pan the map under the crosshair to set a permanent GPS position. Give the plant an optional nickname and type.</p><p class="ident-help"><strong>4. Keep a diary.</strong> Open a marker to add photos, notes, alive/dead changes, removal and ratings. Empty change fields never reset previous values.</p><p class="ident-help"><strong>5. Export backups regularly.</strong> Your data is entirely in this browser's storage, including photos. Use Settings → Create ZIP backup, then Download ready ZIP to protect it.</p><p class="ident-help">Pinch or mouse-wheel to zoom, drag to pan, and use +/- to adjust the map. The app works offline once cached; online Pl@ntNet identification is optional.</p>`,'<button class="btn btn-primary" data-action="close-modal">Got it</button>');return;
    case 'upload-map':$('#mapFile').click();return;
    case 'upload-geotiff':$('#geoFile').click();return;
    case 'toggle-location':toggleLocation();return;
    case 'follow-location':resumeLocationFollow();return;
    case 'zoom-in':zoomMap(1.3);return;
    case 'zoom-out':zoomMap(1/1.3);return;
    case 'zoom-fit':pauseLocationFollow();fitMap();return;
    case 'rotate-left':rotateMap(-Math.PI/12);return;
    case 'rotate-right':rotateMap(Math.PI/12);return;
    case 'rotate-reset':if(state.glMap)state.glMap.easeTo({bearing:0,duration:350});return;
    case 'add-marker':beginPlacement('new');return;
    case 'reset-filters':state.filters={types:[],family:[],genus:[],taxonActive:false,life:'all',removed:'hide'};updateFilters();return;
    case 'cancel-placement':cancelPlacement();return;
    case 'confirm-placement':confirmPlacement();return;
    case 'open-calibration':if(state.tab==='settings'){setTab('map');await Vue.nextTick();}openCalibration();return;
    case 'add-reference': if((state.map?.points||[]).length<3)beginPlacement('reference');return;
    case 'delete-reference':{
      if(!confirm('Remove this GPS reference? Calibration may become unavailable until you add a replacement.'))return;
      const map={...state.map,points:(state.map.points||[]).filter(p=>p.id!==id)};await saveSetting(map);refreshMapLayers(false);openCalibration();toast('Reference removed.');return;
    }
    case 'add-type':openTypeForm();return;
    case 'search-species':await searchPlantNetSpecies();return;
    case 'choose-species':chooseSpeciesResult(Number(el.dataset.index));return;
    case 'import-species-link':importPlantNetLink();return;
    case 'remove-upload':{
      const item=state.pendingUploads.splice(Number(el.dataset.index),1)[0];if(item)URL.revokeObjectURL(item.url);updatePhotoPreview();return;
    }
    case 'edit-type':openTypeForm(id);return;
    case 'delete-type':{
      if(state.markers.some(m=>m.plantTypeId===id)){toast('This type is in use. Reassign its plants before deleting it.',true);return;}
      if(!confirm('Delete this unused plant type?'))return;
      await dbDelete('plantTypes',id);state.plantTypes=state.plantTypes.filter(t=>t.id!==id);renderAll();closeModal();toast('Plant type deleted.');return;
    }
    case 'reposition':beginPlacement('reposition',id);return;
    case 'delete-marker':{
      const m=markerById(id);if(!m)return;
      if(!confirm(`Delete “${markerDisplayName(m)}” and all its diary entries?\n\nIMPORTANT: If the plant was physically removed, DO NOT delete it. Add a journal entry marking it “Physically removed” to keep its history.\n\nOnly delete records created by mistake or no longer wanted.`))return;
      await dbDelete('plants',id);state.markers=state.markers.filter(p=>p.id!==id);await pruneImages();renderAll();closeModal();toast('Plant record deleted.');return;
    }
    case 'add-status':openStatusForm(id);return;
    case 'edit-status':openStatusForm(markerId,statusId);return;
    case 'delete-status':{
      if(!confirm('Delete this journal entry and its recorded changes? The plant’s calculated state may change.'))return;
      const m=markerById(markerId);if(!m)return;
      await saveMarker({...m,statuses:(m.statuses||[]).filter(e=>e.id!==statusId)});await pruneImages();openMarker(markerId);toast('Journal entry deleted.');return;
    }
    case 'identify-status':await identifyStatus(markerId,statusId);return;
    case 'confirm-identification':await finishIdentification(state.candidateIndex);return;
    case 'reject-identification':await finishIdentification(null);return;
    case 'retry-identification':if(state.identification){const info=state.identification;await identifyWithPhotos(info.markerId,info.statusId,info.photos.map(p=>({blob:p.blob,organ:p.organ})),info.region);}return;
    case 'go-settings':clearIdentification();closeModal();setTab('settings');$('#apiKey').focus();return;
    case 'export':window.VerdantUI?.openManagement?.('backup');return;
    case 'optimize-photos':window.VerdantUI?.openManagement?.('photos');return;
    case 'download-staged':await downloadStagedBackup();return;
    case 'clear-staged':await clearStagedZips();return;
    case 'import':window.VerdantUI?.openManagement?.('backup');return;
    case 'test-api':await testPlantnet();return;
    case 'reset-application':showResetWarning();return;
    case 'remove-api-key':{
      if(!state.apiKey)return;
      if(!confirm('Remove the Pl@ntNet API key from this device?'))return;
      await dbDelete('settings','plantnetKey');state.settings=state.settings.filter(s=>s.id!=='plantnetKey');state.apiKey='';$('#apiKey').value='';$('#apiFeedback').textContent='Key removed from this device.';toast('API key removed.');return;
    }
    case 'persistent-storage':{
      if(!navigator.storage?.persist){toast('This browser does not support persistent storage requests.',true);return;}
      let granted=false;
      try {granted=!!(await navigator.storage.persisted?.())||!!(await navigator.storage.persist());}
      catch(err){console.warn('Browser refused storage persistence request',err);}
      $('#storageInfo').textContent=granted
        ?'✓ Persistent storage granted by the browser.'
        :'Persistent storage was not granted by this browser. Your garden still works in local storage; Safari can decide automatically without asking. Keep ZIP backups of important changes.';
      toast(granted?'Persistent storage granted.':'Storage protection was not granted; keep ZIP backups.');return;
    }
    default:return;
  }
}
async function onSubmit(form,submitter=null) {
  const fd=new FormData(form);
  switch(form.id) {
    case 'gardenTitleForm':{
      const title=TITLE.record(formVal(fd,'gardenTitle'));
      await saveSetting(title);toast('Garden title saved and included in future backups.');return;
    }
    case 'photoOptimizationForm':{
      const options=VerdantPhotos.validate({targetKB:Number(formVal(fd,'targetKB')),
        maxDimension:Number(formVal(fd,'maxDimension')),format:formVal(fd,'format')});
      await saveSetting(options);toast('Photo settings saved. Only future uploads change. Use Optimize existing photos to migrate older pictures.');return;
    }
    case 'resetForm':{if(formVal(fd,'confirmation')!=='RESET')throw new Error('Type RESET exactly to confirm.');await resetEntireApp();return;}
    case 'newMarkerForm':{
      const lat=Number(formVal(fd,'lat')),lon=Number(formVal(fd,'lon'));if(!isValidGeo(lat,lon))throw new Error('Invalid plant coordinates.');
      const selected=[...state.pendingUploads],identify=submitter?.value==='identify';
      if(identify&&(!selected.length||selected.length>5))throw new Error('Choose one to five photos before asking Pl@ntNet.');
      const keep=!!fd.get('saveIdentificationPhotos'),firstNote=formVal(fd,'note'),statuses=[];
      const imageIds=[],imageOrgans={};if(keep)for(const photo of selected){const photoId=await saveImage(photo.file,photo.file.name);imageIds.push(photoId);imageOrgans[photoId]=photo.organ;}
      if(firstNote||imageIds.length)statuses.push({id:uid(),timestamp:nowISO(),note:firstNote,...(imageIds.length?{imageIds,imageOrgans}:{})});
      const id=uid(),m={id,geometry:pointGeometry(lat,lon),nickname:formVal(fd,'nickname'),plantTypeId:formVal(fd,'plantTypeId')||null,statuses,createdAt:nowISO()};
      await saveMarker(m);
      const photos=selected.map(p=>({blob:p.file,organ:p.organ}));
      if(identify){await identifyWithPhotos(id,statuses[0]?.id||null,photos,formVal(fd,'flora')||'nearby');}
      else{discardUploads();openMarker(id);toast('Plant added to the map.');}
      return;
    }
    case 'editMarkerForm':{
      const m=markerById(form.dataset.id);if(!m)return;
      await saveMarker({...m,nickname:formVal(fd,'nickname'),plantTypeId:formVal(fd,'plantTypeId')||null});openMarker(m.id);toast('Plant details saved.');return;
    }
    case 'typeForm':{
      const id=form.dataset.id||uid(),previous=typeById(id);
      const t={...(previous||{}),id,nameEn:formVal(fd,'nameEn'),nameEs:formVal(fd,'nameEs'),nameDe:formVal(fd,'nameDe'),scientificName:formVal(fd,'scientificName'),
        family:formVal(fd,'family'),genus:formVal(fd,'genus'),species:formVal(fd,'scientificName'),
        color:formVal(fd,'color'),links:formVal(fd,'links').split(/\n/).map(x=>x.trim()).filter(Boolean),createdAt:previous?.createdAt||nowISO()};
      if(!t.nameEn&&!t.nameEs&&!t.nameDe&&!t.scientificName)throw new Error('Enter at least one plant name.');
      if(['family','genus','species'].some(field=>t[field].length>160))throw new Error('Taxonomy fields must be 160 characters or shorter.');
      if(!validColor(t.color))throw new Error('Choose a valid marker color.');
      if(t.links.some(x=>!safeURL(x)))throw new Error('Reference links must begin with https:// or http://');
      await saveType(t);closeModal();toast(previous?'Plant type updated.':'Plant type created.');return;
    }
    case 'statusForm':{
      const m=markerById(form.dataset.marker);if(!m)return;
      const existing=(m.statuses||[]).find(s=>s.id===form.dataset.status);
      const timestamp=new Date(formVal(fd,'timestamp'));if(!Number.isFinite(timestamp.getTime()))throw new Error('Choose a valid journal date and time.');
      const status={...(existing||{}),id:existing?.id||uid(),timestamp:timestamp.toISOString(),note:formVal(fd,'note')};
      delete status.alive;delete status.removed;delete status.rating;delete status.ratingClear;
      if(formVal(fd,'alive')==='alive')status.alive=true;
      if(formVal(fd,'alive')==='dead')status.alive=false;
      if(formVal(fd,'removed')==='removed')status.removed=true;
      if(formVal(fd,'removed')==='present')status.removed=false;
      if(formVal(fd,'rating')==='clear')status.ratingClear=true;
      else if(formVal(fd,'rating'))status.rating=Number(formVal(fd,'rating'));
      const oldIds=statusImageIds(existing),removed=new Set(fd.getAll('removeImageId'));
      const imageIds=oldIds.filter(id=>!removed.has(id));
      const imageOrgans={};for(const id of imageIds)imageOrgans[id]=formVal(fd,`existingOrgan:${id}`)||existing?.imageOrgans?.[id]||'auto';
      const newPhotos=[...state.pendingUploads];
      if(imageIds.length+newPhotos.length>10)throw new Error('A journal entry supports up to ten photos.');
      for(const photo of newPhotos){const imageId=await saveImage(photo.file,photo.file.name);imageIds.push(imageId);imageOrgans[imageId]=photo.organ;}
      if(newPhotos.length||removed.size)delete status.identification;
      delete status.imageId;delete status.imageIds;delete status.imageOrgans;
      if(imageIds.length){status.imageIds=imageIds;status.imageOrgans=imageOrgans;}
      if(!status.note&&!imageIds.length&&typeof status.alive!=='boolean'&&typeof status.removed!=='boolean'&&status.rating==null&&!status.ratingClear&&!status.identification)throw new Error('Add a note, photo, or condition change.');
      const statuses=[...(m.statuses||[]).filter(s=>s.id!==status.id),status];await saveMarker({...m,statuses});await pruneImages();openMarker(m.id);toast(existing?'Journal entry updated.':'Journal entry saved.');return;
    }
    case 'referenceForm':{
      if(!state.map)throw new Error('Upload a map before setting references.');
      const lat=Number(formVal(fd,'lat')),lon=Number(formVal(fd,'lon')),x=Number(formVal(fd,'x')),y=Number(formVal(fd,'y'));
      if(!isValidGeo(lat,lon)||!pointOnImage({x,y}))throw new Error('Coordinates must be within valid GPS and map ranges.');
      const points=[...(state.map.points||[]),{id:uid(),lat,lon,x,y}];if(points.length>3)throw new Error('Up to three references are supported.');
      await saveSetting({...state.map,points});if(getCalibration().valid)setTimeout(fitMap,90);openCalibration();toast('GPS reference saved.');return;
    }
    case 'apiForm':{
      const key=$('#apiKey').value.trim();if(!key)throw new Error('Enter a Pl@ntNet API key or use Remove key.');
      await saveSetting({id:'plantnetKey',value:key});$('#apiKey').value='';$('#apiFeedback').textContent='Key saved locally. Test connection to verify authorization and quota.';toast('Personal API key saved on this device.');return;
    }
  }
}
async function updateStorageInfo() {
  const node=$('#storageInfo');try{
    if(!navigator.storage?.estimate){node.textContent='Storage estimates are not supported in this browser.';return;}
    const est=await navigator.storage.estimate(),used=est.usage!=null?(est.usage/1048576).toFixed(1):'?',total=est.quota!=null?(est.quota/1048576).toFixed(0):'?';
    const persistent=await navigator.storage.persisted?.();node.textContent=`Used: ${used} MB · Browser quota: ${total} MB · Persistent storage: ${persistent?'granted':'not granted'}.`;
  }catch{node.textContent='Browser storage information unavailable. Back up regularly.';}
}
async function registerOffline() {
  const badge=$('#connectionBadge');
  if(!('serviceWorker' in navigator)){badge.textContent='Offline install unavailable';return;}
  try{
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    const check=async()=>{
      const shell=await caches.open(SHELL_CACHE);
      let index=await shell.match('./index.html');
      if(!index){const regular=await caches.open('verdant-shell-v1.6.5');index=await regular.match('./index.html');}
      badge.innerHTML=index?'<span class="status-dot"></span>Offline ready':'<span class="status-dot"></span>Preparing offline access';badge.classList.toggle('ready',!!index);
    };await check();navigator.serviceWorker.addEventListener('controllerchange',check);
  }catch(err){badge.textContent='Offline cache failed — use local server';console.warn('Service worker setup:',err);}
}
function setupEvents() {
  document.addEventListener('click',e=>{
    const tab=e.target.closest('[data-tab]');if(tab){setTab(tab.dataset.tab);return;}
    const target=e.target.closest('[data-action]');if(target){e.preventDefault();safely(()=>action(target.dataset.action,target));return;}
    // Only actual map pin buttons may open a marker. Journal forms also use data-marker.
    const m=e.target.closest('button.marker[data-marker]');if(m){e.stopPropagation();openMarker(m.dataset.marker);return;}
    if(e.target.closest('a'))return;
    const card=e.target.closest('[data-open-marker]');if(card){openMarker(card.dataset.openMarker);return;}
    // Never dismiss a form by tapping outside it: prevent accidental data loss.
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(photoViewer.index>=0)closePhotoViewer();else if($('#modalRoot').innerHTML)closeModal();else if(state.mode)cancelPlacement();return;}
    if(photoViewer.index>=0){
      if(e.key==='ArrowRight'){e.preventDefault();safely(()=>showViewerPhoto(photoViewer.index+1));}
      if(e.key==='ArrowLeft'){e.preventDefault();safely(()=>showViewerPhoto(photoViewer.index-1));}
      // Keep keyboard focus in the accessible photo dialog.
      if(e.key==='Tab'){const controls=[...$('#photoViewerRoot').querySelectorAll('button:not([disabled])')];if(controls.length){const i=controls.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();controls.at(-1).focus();}else if(!e.shiftKey&&i===controls.length-1){e.preventDefault();controls[0].focus();}}}
      return;
    }
    if(e.key==='Enter'&&e.target.id==='speciesQuery'){e.preventDefault();safely(searchPlantNetSpecies);return;}
    if(e.key==='Enter'&&e.target.name==='speciesLink'){e.preventDefault();importPlantNetLink();return;}
    if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open-marker]')){e.preventDefault();openMarker(e.target.dataset.openMarker);}
  });
  document.addEventListener('submit',e=>{if(!e.target.matches('form'))return;e.preventDefault();safely(()=>onSubmit(e.target,e.submitter));});
  document.addEventListener('change',e=>{
    if(e.target.name==='candidate'){state.candidateIndex=Number(e.target.value);$$('.candidate').forEach((c,i)=>c.classList.toggle('selected',i===state.candidateIndex));}
    if(e.target.matches('[data-photo-organ]')){const photo=state.pendingUploads[Number(e.target.dataset.photoOrgan)];if(photo)photo.organ=e.target.value;}
    if(['photo','newMarkerPhoto'].includes(e.target.name)&&e.target.files?.length){const files=[...e.target.files];e.target.value='';safely(()=>addUploads(files));}
  });
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-filter-control]')){state.filters[e.target.dataset.filterControl]=e.target.value;updateFilters();}
  });
  document.addEventListener('input',e=>{if(e.target.id==='plantSearch')renderPlantList();if(e.target.id==='typeSearch')renderTypeList();});
  document.addEventListener('input',e=>{
    if(e.target.matches('#typeForm input[type=color]'))syncColorControls(e.target.closest('form'),e.target.value);
    if(e.target.matches('[data-color-hex]')){
      const hex=e.target.value.trim();if(validColor(hex))syncColorControls(e.target.closest('form'),hex);
    }
    if(e.target.matches('[data-color-hue],[data-color-saturation],[data-color-lightness]')){
      const form=e.target.closest('form');const read=part=>form.querySelector(`[data-color-${part}]`).value;
      syncColorControls(form,hslToHex(read('hue'),read('saturation'),read('lightness')),false);
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-color-hex]')){
      const input=e.target.closest('form').elements.color;
      if(validColor(e.target.value.trim()))syncColorControls(e.target.closest('form'),e.target.value.trim());
      else{e.target.value=input.value;toast('Enter a six-digit color such as #27a46b.',true);}
    }
  });
  document.addEventListener('click',e=>{if(e.target.classList.contains('photo-viewer'))closePhotoViewer();});
  let swipeX=null;
  $('#photoViewerRoot').addEventListener('touchstart',e=>{swipeX=e.touches.length===1?e.touches[0].clientX:null;},{passive:true});
  $('#photoViewerRoot').addEventListener('touchend',e=>{if(swipeX==null||e.changedTouches.length!==1)return;const dx=e.changedTouches[0].clientX-swipeX;swipeX=null;if(Math.abs(dx)>70)safely(()=>showViewerPhoto(photoViewer.index+(dx<0?1:-1)));},{passive:true});

  $('#geoFile').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';safely(()=>handleGeoTIFF(file));});
  $('#mapFile').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';safely(()=>handleMapFile(file));});
  $('#backupFile').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';safely(()=>importBackup(file));});
  if('ResizeObserver' in window){window.VerdantMapObserver=new ResizeObserver(()=>{if(state.tab==='map')scheduleMapRecovery('resize-observer');});window.VerdantMapObserver.observe($('#mapViewport'));}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){scheduleMapRecovery('visible');if(state.locationWatch!=null)refreshLocation(state.locationSession);}});
  window.addEventListener('pageshow',e=>{scheduleMapRecovery('pageshow');if(e.persisted&&state.locationWatch!=null)refreshLocation(state.locationSession);});
  window.addEventListener('focus',()=>scheduleMapRecovery('window-focus'));
}
function shellIsCompatible() {
  const required=['modalRoot','toast','connectionBadge','mapCanvas','mapViewport','mapEmpty','mapLibraryError','mapFilterIndicator','mapLegend','navPlantCount','plantSearch','plantList','typeSearch','typeList','mapFile','geoFile','backupFile','apiFeedback','currentOrigin','settingsMapInfo','storageInfo','photoOptimizationForm','photoViewerRoot','clearTypeShortcut'];
  const missing=required.filter(id=>!document.getElementById(id));
  if(!missing.length)return true;
  console.error('Verdant UI and JavaScript versions do not match. Missing:',missing);
  document.body.innerHTML='<main style="max-width:45rem;margin:4rem auto;padding:2rem;font:16px/1.6 system-ui"><h1>Verdant files are out of sync</h1><p>The page and JavaScript come from different versions, often because the browser has an old PWA cache. No garden data was erased.</p><p>Run the local server, make sure all v1.6.1 files are in the same folder, and reload. If needed, clear the cached files for this site (not the stored garden data).</p><p>See README troubleshooting.</p></main>';
  return false;
}
async function init() {
  if(!shellIsCompatible())return;
  setupEvents();ensureMap();
  try {state.db=await openDB();await loadData();renderMapImage(true);if(location.hash==='#settings')setTab('settings');await updateStorageInfo();await registerOffline();}
  catch(err){showError(err);openModal('Local storage unavailable',`<p class="form-note warning">${esc(errorMessage(err))}</p><p>Verdant requires IndexedDB, enabled JavaScript and a browser served from localhost or HTTPS. No existing data was deliberately changed.</p>`);}
}
init();
