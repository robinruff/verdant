// Precompiled Verdant 1.6.5 offline entry: Vue is loaded by index.html.
import * as maplibregl from './maplibre-6.16.0/maplibre-gl.mjs';
maplibregl.setWorkerUrl(new URL('./maplibre-6.16.0/maplibre-gl-worker.mjs',import.meta.url).href);
window.maplibregl=maplibregl;
import {mountGarden} from './vue-shell.6ee083c3e7bb.js';
if(!window.maplibregl?.Map)throw Error('Bundled MapLibre did not initialize.');
mountGarden();
await import('./verdant-app.86b6d70dfecd.js');
