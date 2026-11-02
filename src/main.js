// v1.6.2: Vite bundles MapLibre and its stylesheet. No runtime CDN or fetch script.
// Pin the original MapLibre 5.12.0 release to minimize behavior changes.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mountGarden } from './vue-shell.js';

window.maplibregl = maplibregl;
mountGarden();
// The legacy plain-JS controller still owns IndexedDB, MapLibre and data flows.
// Load it only after MapLibre and the Vue shell are ready.
await import('../app.js');
