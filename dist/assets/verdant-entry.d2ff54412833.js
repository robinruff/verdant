// Precompiled Verdant 1.6.5 offline entry: MapLibre and Vue are loaded by index.html.
import {mountGarden} from './vue-shell.6ee083c3e7bb.js';
if(!window.maplibregl?.Map)throw Error('Bundled MapLibre did not initialize.');
mountGarden();
await import('./verdant-app.0be45c0e0517.js');
