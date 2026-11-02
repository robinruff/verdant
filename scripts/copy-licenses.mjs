// Include the MapLibre license in every deployable build.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const root = new URL('../',import.meta.url).pathname;
const upstream = await readFile(join(root,'node_modules/maplibre-gl/LICENSE.txt'),'utf8');
await writeFile(join(root,'dist/THIRD_PARTY_LICENSES.txt'),'MapLibre GL JS 6.16.0\n'+upstream);
