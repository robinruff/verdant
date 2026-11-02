// Fail the release build rather than ship a ZIP with missing map assets.
import {readdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
const root = new URL('../dist/', import.meta.url).pathname;
const assert = (condition,msg)=>{if(!condition)throw new Error('Incomplete v1.6.5 build: '+msg);};
const names=await readdir(root);
assert(names.includes('index.html'),'index.html is missing');
assert(names.includes('sw.js'),'service worker is missing');
assert(names.includes('manifest.webmanifest'),'PWA manifest is missing');
assert(names.includes('verdant-rescue.html'),'emergency rescue is missing');
for(const filename of ['printout.typ','map.typ','geometry.typ','tiles.typ','side-labels.typ','cluster-tiles.typ','auto-grid.typ','README.md']){
  const body=await readFile(join(root,'print',filename));
  assert(body.length>0,'print template missing or empty: '+filename);
}
assert(names.includes('THIRD_PARTY_LICENSES.txt'),'MapLibre license is missing');
assert(!names.some(n=>/^(vue-v|backup-v|photos-v|settings-tools-v|fetch_maplibre|fetch-maplibre)/.test(n)),'legacy page or fetch script was deployed');
const html=await readFile(join(root,'index.html'),'utf8');
assert(!/vendor\/maplibre-gl|fetch_maplibre/.test(html),'manual map assets still required');
const assets=names.includes('assets')? await readdir(join(root,'assets')) : [];
// Both build paths must ship the separate MapLibre 6 worker locally.
const portableMap=assets.find(n=>n.startsWith('maplibre-6.'));
if(portableMap){
  for(const file of ['maplibre-gl.mjs','maplibre-gl-worker.mjs']){
    assert((await stat(join(root,'assets',portableMap,file))).size>0,'MapLibre module missing: '+file);
  }
}else{
  assert(assets.some(n=>/^maplibre-gl-worker-.*\.mjs$/.test(n)),'MapLibre worker was not emitted by Vite');
}
assert(assets.some(n=>n.endsWith('.js')),'no bundled application javascript');
const chunks=await Promise.all(assets.filter(n=>n.endsWith('.js')).map(n=>readFile(join(root,'assets',n),'utf8')));
assert(chunks.some(c=>c.includes('maplibregl')||c.includes('maplibre')||c.includes('maplibre-gl')),'MapLibre was not included in JS bundles');
const styles=await Promise.all(assets.filter(n=>n.endsWith('.css')).map(n=>readFile(join(root,'assets',n),'utf8')));
assert(styles.some(css=>css.includes('maplibregl-')),'MapLibre CSS was not included');
console.log('Verified v1.6.5 static build ('+assets.length+' hashed assets); no manual MapLibre setup.');
