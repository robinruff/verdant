// v1.6.2: Vite bundles MapLibre and its stylesheet. No runtime CDN or fetch script.
// Use the patched MapLibre ESM release pinned in package.json.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { mountGarden } from './vue-shell.js';

// Vite renames the main bundle, so MapLibre cannot infer its worker's URL.
maplibregl.setWorkerUrl(mapWorkerUrl);
window.maplibregl = maplibregl;
mountGarden();
// The legacy plain-JS controller still owns IndexedDB, MapLibre and data flows.
// Load it only after MapLibre and the Vue shell are ready.
window.__VERDANT_DEV__ = import.meta.env.DEV;
await import('../app.js');
