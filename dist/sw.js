/* Verdant 1.6.7: offline static shell, never touches IndexedDB. */
const CACHE='verdant-shell-v1.6.7-1a3da5520ba8';
const FILES=["./LICENSE","./THIRD_PARTY_LICENSES.txt","./assets/app-d-Dzx2ms.js","./assets/backup-tool-C_RpB0q7.js","./assets/database-ggyK_dQd.js","./assets/import-photos-nyR9Bvot.js","./assets/index-BimxWtk5.js","./assets/index-D5Ucxj4U.css","./assets/manager-Dc0w2nXk.js","./assets/maplibre-gl-worker-CMkqA50c.mjs","./assets/opfs-writer.worker-CM3sF1wR.js","./assets/photo-tool-CNWOVb0p.js","./assets/preload-helper-Ct5FWWRu.js","./assets/reset-data-CFhbrM2z.js","./assets/task-modal-BLmwrXyO.js","./garden-title.js","./geotiff-local.js","./icons/icon-192.png","./icons/icon-32.png","./icons/icon-512.png","./icons/verdant.svg","./index.html","./localized-names.js","./manifest.webmanifest","./photo-optimizer.js","./print/README.md","./print/auto-grid.typ","./print/cluster-tiles.typ","./print/geometry.typ","./print/map.typ","./print/printout.typ","./print/side-labels.typ","./print/tiles.typ","./taxonomy.js","./vendor/VUE-LICENSE.txt","./vendor/vue.global.prod.js","./verdant-rescue.html","./zip-backup.js","./photo-optimizer.js?v=1.6.7"];
const OPTIONAL_VENDOR=[];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(async c=>{
  await c.addAll(FILES);

}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith('verdant-shell-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(req,c));}return r;}).catch(async()=>await caches.match(req)||await caches.match('./index.html')||Response.error()));return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(response=>{
    if(response.ok && OPTIONAL_VENDOR.some(file=>url.pathname.endsWith(file.slice(1)))){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}
    return response;
  })));
});
