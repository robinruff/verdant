/**
 * Assemble the same Verdant application as the regular v1.6.5 build without
 * downloading npm dependencies. The provided precompiled MapLibre 6.16.0 ESM
 * includes a separate local module worker and is copied from third_party/maplibre/.
 * This is a portable distribution builder, not a Vite output.
 */
import {readFile,writeFile,copyFile,cp,mkdir,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
const project=resolve(new URL('..',import.meta.url).pathname);
const dist=join(project,'dist');
const assets=join(dist,'assets');
const vend=join(project,'third_party','maplibre');
const short=b=>createHash('sha256').update(b).digest('hex').slice(0,12);
const load=rel=>readFile(join(project,rel));
const write=async(file,buffer)=>{await mkdir(dirname(join(dist,file)),{recursive:true});await writeFile(join(dist,file),buffer)};
await rm(dist,{recursive:true,force:true});
await mkdir(assets,{recursive:true});
// Runtime-only helper scripts and static PWA assets.
for(const rel of ['garden-title.js','geotiff-local.js','localized-names.js','photo-optimizer.js','taxonomy.js','zip-backup.js','manifest.webmanifest','verdant-rescue.html','icons/icon-192.png','icons/icon-512.png']){
  await write(rel,await load('public/'+rel));
}
const vue=await load('public/vendor/vue.global.prod.js');
const map=await readFile(join(vend,'maplibre-gl.mjs'));
const mcss=await readFile(join(vend,'maplibre-gl.css'));
const license=await readFile(join(vend,'MAPLIBRE-LICENSE.txt'));
const css=await load('styles.css');
const app=await load('app.js');
const shell=await load('src/vue-shell.js');
const scripts={
 vue: `assets/vue.${short(vue)}.js`,
 map:`assets/maplibre-6.16.0/maplibre-gl.mjs`,
 app:`assets/verdant-app.${short(app)}.js`,
 shell:`assets/vue-shell.${short(shell)}.js`,
 css:`assets/verdant.${short(css)}.css`,
 mapcss:`assets/maplibre-gl.${short(mcss)}.css`
};
await write(scripts.vue,vue);
await write(scripts.map,map);
for (const file of ['maplibre-gl-worker.mjs']) {
  await write('assets/maplibre-6.16.0/'+file,await readFile(join(vend,file)));
}
await write(scripts.mapcss,mcss);
await write(scripts.css,css);
await write(scripts.app,app);
await write(scripts.shell,shell);
// Vue shell loads ./settings/manager.js dynamically, so preserve this module
// subtree exactly and let the browser's native ESM loader resolve it.
await cp(join(project,'src/settings'),join(assets,'settings'),{recursive:true,filter:(path)=>!path.endsWith('.map')});
// Backup-tool and app.js resolve this shared image restore module at different
// relative paths in the unbundled portable distribution.
await write('assets/import-photos.js',await load('src/import-photos.js'));
await write('assets/src/import-photos.js',await load('src/import-photos.js'));
// Offline print assets are fetched by backup-tool.js at export time.
// Keep them alongside the app for both normal and portable distributions.
await cp(join(project,'public/print'),join(dist,'print'),{recursive:true});
const entry=`// Precompiled Verdant 1.6.5 offline entry: Vue is loaded by index.html.\nimport * as maplibregl from './maplibre-6.16.0/maplibre-gl.mjs';\nmaplibregl.setWorkerUrl(new URL('./maplibre-6.16.0/maplibre-gl-worker.mjs',import.meta.url).href);\nwindow.maplibregl=maplibregl;\nimport {mountGarden} from './${scripts.shell.split('/').pop()}';\nif(!window.maplibregl?.Map)throw Error('Bundled MapLibre did not initialize.');\nmountGarden();\nawait import('./${scripts.app.split('/').pop()}');\n`;
const entryPath=`assets/verdant-entry.${short(entry)}.js`;
await write(entryPath,entry);
let html=(await load('index.html')).toString();
html=html.replace('<link rel="stylesheet" href="./styles.css">',`<link rel="stylesheet" href="./${scripts.css}">\n  <link rel="stylesheet" href="./${scripts.mapcss}">`);
html=html.replace('<script src="/vendor/vue.global.prod.js"></script>',`<script src="./${scripts.vue}"></script>`);
html=html.replace('<script type="module" src="./src/main.js"></script>',`<script type="module" src="./${entryPath}"></script>`);
for(const file of ['geotiff-local.js','zip-backup.js','photo-optimizer.js','taxonomy.js','localized-names.js','garden-title.js']){
  html=html.replace(`src="/${file}${file==='photo-optimizer.js'?'?v=1.6.5':''}"`,`src="./${file}${file==='photo-optimizer.js'?'?v=1.6.5':''}"`);
}
html=html.replace('href="/manifest.webmanifest"','href="./manifest.webmanifest"').replaceAll('href="/icons/','href="./icons/');
if(/src="\.\/src\/main\.js"|src="\/vendor\/vue|href="\.\/styles\.css"/.test(html))throw Error('Unconverted HTML references');
await write('index.html',html);
await write('THIRD_PARTY_LICENSES.txt',`MapLibre GL JS 6.16.0\n${license.toString()}`);
const all=[];
async function walk(path=''){
  for(const ent of await readdir(join(dist,path),{withFileTypes:true})){
    const p=path?path+'/'+ent.name:ent.name;
    if(ent.isDirectory())await walk(p);else if(!p.endsWith('.map')&&p!=='sw.js')all.push('./'+p);
  }
}
await walk();
// The HTML requests a versioned helper: precache that exact URL for offline use.
all.push('./photo-optimizer.js?v=1.6.5');
// Avoid caching unknown cross-origin resources. All runtime scripts/images are
// local. Never deletes IndexedDB/OPFS data.
const sw=`/* Verdant 1.6.5 portable offline distribution */\nconst CACHE='verdant-shell-v1.6.5-offline-security1';\nconst FILES=${JSON.stringify(all.sort())};\nself.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));\nself.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('verdant-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\nself.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;if(r.mode==='navigate'){e.respondWith(fetch(r).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(r,copy));}return response;}).catch(async()=>await caches.match(r)||await caches.match('./index.html')||Response.error()));return;}e.respondWith(caches.match(r).then(c=>c||fetch(r)));});\n`;
await write('sw.js',sw);
console.log(`Created fully local v1.6.5 portable dist with ${all.length} precached files`);
console.log(`MapLibre v6.16.0: ${(map.length/1024).toFixed(0)} KiB JS, ${(mcss.length/1024).toFixed(0)} KiB CSS, local module Worker`);
