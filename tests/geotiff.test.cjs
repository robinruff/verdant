// Developer-only coordinate and TIFF metadata checks. Browser raster decoding
// is additionally covered by the manual/headless Chromium tests.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const script=fs.readFileSync(__dirname+'/../public/geotiff-local.js','utf8');
const ctx=vm.createContext({ArrayBuffer,Uint8Array,DataView,Math,Blob,console});
vm.runInContext(script,ctx);
const geo=ctx.VerdantGeoTIFF;
const epsg=25830,lat=40,lon=-3;
const [x,y]=geo.forward(lat,lon,epsg);const roundtrip=geo.inverse(x,y,epsg);
assert(Math.abs(roundtrip.lat-lat)<2e-7);assert(Math.abs(roundtrip.lon-lon)<2e-7);
const fixture=fs.readFileSync(__dirname+'/fixtures/tiny-utm-lzw.tif');
const input=Uint8Array.from(fixture).buffer;const parsed=geo.parse(input);
assert.equal(parsed.geo.epsg,25830);assert.equal(parsed.width,32);assert.equal(parsed.height,32);
assert.equal(parsed.compression,5);
const center=geo.pixelToGeo(parsed.geo,16,16);
assert(Math.abs(center.lat-lat)<2e-7);assert(Math.abs(center.lon-lon)<2e-7);
const p=geo.geoToPixel(parsed.geo,lat,lon);
assert(Math.abs(p.x-16)<.05);assert(Math.abs(p.y-16)<.05);
console.log('PASS — GeoTIFF EPSG:25830 metadata, WGS84 ↔ UTM and pixel round trips');
