import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
const root=resolve(new URL('../',import.meta.url).pathname,process.env.VERDANT_OUT_DIR||'dist');
async function walk(dir){let out=[];for(const ent of await readdir(dir,{withFileTypes:true})){
  const name=join(dir,ent.name);if(ent.isDirectory())out.push(...await walk(name));else if(!ent.name.endsWith('.map')&&!ent.name.startsWith('sw.'))out.push('./'+relative(root,name).replace(/\\/g,'/'));
}return out;}
const files=await walk(root);
const revision=createHash('sha256');
for(const file of [...files].sort())revision.update(file).update(await readFile(join(root,file)));
const buildId=revision.digest('hex').slice(0,12);
// Match the versioned script URL in index.html even without a network connection.
files.push('./photo-optimizer.js?v=1.6.5');
// Navigation-first update policy; immutable revisioned assets stay cache-first.
const output=`/* Verdant 1.6.5: offline static shell, never touches IndexedDB. */
const CACHE='verdant-shell-v1.6.5-${buildId}';
const FILES=${JSON.stringify(files)};
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
`;
await writeFile(join(root,'sw.js'),output);
console.log(`Wrote offline shell with ${files.length} files`);
