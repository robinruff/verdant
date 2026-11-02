// Self-contained v1.4 model tests; no external dependencies.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../public/photo-optimizer.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../public/taxonomy.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../public/garden-title.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../public/localized-names.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../app.js','utf8').replace(/init\(\);\s*$/,'');
const ctx=vm.createContext({console,Blob,atob,btoa,crypto:globalThis.crypto,URL,Date,Math,setTimeout,clearTimeout});
vm.runInContext(source,ctx,{filename:'app.js'});
const run=expr=>vm.runInContext(expr,ctx);
const set=code=>vm.runInContext(code,ctx);
const near=(a,b,eps=1e-6)=>assert(Math.abs(a-b)<eps,`${a} differs from ${b}`);
assert.equal(run('DB_NAME'),'verdant-garden-v2');
assert.equal(run('BACKUP_SCHEMA'),2);
assert.equal(run('STORES[0]'),'plants');
assert.equal(run('validGeometry(pointGeometry(40.0000,-3.0000))'),true);
assert.equal(run('validGeometry({type:"LineString",coordinates:[[-5.2,36.6],[-5.3,36.7]]})'),true);
assert.equal(run('validGeometry({type:"Polygon",coordinates:[[[-5.2,36.6],[-5.3,36.6],[-5.3,36.7],[-5.2,36.6]]]})'),true);
assert.equal(run('validGeometry({type:"Polygon",coordinates:[[[-5.2,36.6],[-5.3,36.6],[-5.3,36.7]]]})'),false);
assert.equal(run('validGeometry({type:"Point",coordinates:[250,36.6]})'),false,'GeoJSON must use [lon, lat]');
const c=run('geometryCoordinate({type:"LineString",coordinates:[[-5.0,36.6],[-5.2,36.8]]})');near(c.lat,36.7);near(c.lon,-5.1);
const lat1=36.65,lon1=-5.18,scale=.45;
const lat2=lat1-250*scale/111194.92664455874;
const lon2=lon1+420*scale/(111194.92664455874*Math.cos((lat1+lat2)/2*Math.PI/180));
set(`state.map={id:'map',imageId:'mapblob',width:1000,height:700,points:[{id:'p1',lat:${lat1},lon:${lon1},x:180,y:120},{id:'p2',lat:${lat2},lon:${lon2},x:600,y:370}]}`);
assert.equal(run('getCalibration().valid'),true);
const test=run('pixelToGeo(440,310)');set(`globalThis.pt=geoToPixel(${test.lat},${test.lon})`);
near(run('pt.x'),440);near(run('pt.y'),310);
const corners=run('imageCorners()');assert.equal(corners.length,4);
assert.equal(corners[0][0]<-5.17,true);
set('state.map.points=[]');assert.equal(run('getCalibration().valid'),false);
const p=run('temporaryGeo(412,333)');set(`globalThis.tmpPixel=temporaryPixel(${p.lat},${p.lon})`);
near(run('tmpPixel.x'),412);near(run('tmpPixel.y'),333);
set(`globalThis.plant={id:'plant1',geometry:pointGeometry(40.0000,-3.000),statuses:[{id:'old',timestamp:'2026-05-02T00:00:00Z',alive:false,removed:true,rating:7},{id:'new',timestamp:'2026-05-03T00:00:00Z',note:'photo-only'}]}`);
assert.equal(run('effectiveState(plant).alive'),false);
assert.equal(run('effectiveState(plant).removed'),true);
assert.equal(run('effectiveState(plant).rating'),7);
set(`plant.statuses.push({id:'r',timestamp:'2026-05-04T00:00:00Z',ratingClear:true})`);
assert.equal(run('effectiveState(plant).rating'),null);
const backup={format:'verdant-garden-backup',schemaVersion:2,exportedAt:'2026-10-19T00:00:00Z',data:{
 plants:[{id:'p1',geometry:{type:'Point',coordinates:[-3.000,40.0000]},plantTypeId:'t1',statuses:[{id:'s1',timestamp:'2026-10-19T00:00:00Z',imageIds:['photo'],imageOrgans:{photo:'flower'},alive:false}]}],
 plantTypes:[{id:'t1',nameEn:'Olive',scientificName:'Olea europaea',color:'#aabbcc',links:[]}],
 images:[{id:'photo',name:'p.png',mimeType:'image/png',base64:'YWJj'},{id:'mapblob',name:'m.png',mimeType:'image/png',base64:'YWJj'}],
 settings:[{id:'map',imageId:'mapblob',width:1000,height:700,points:[]}]
}};
set('globalThis.backup='+JSON.stringify(backup));
assert.equal(run('prepareBackup(backup).plants[0].geometry.type'),'Point');
const titleBackup=structuredClone(backup);titleBackup.data.settings.push({id:'gardenTitle',value:'My Olive Grove'});set('globalThis.titleBackup='+JSON.stringify(titleBackup));assert.equal(run('prepareBackup(titleBackup).settings.find(s=>s.id==="gardenTitle").value'),'My Olive Grove');
const invalidTitle=structuredClone(titleBackup);invalidTitle.data.settings.at(-1).value='   ';set('globalThis.invalidTitle='+JSON.stringify(invalidTitle));assert.throws(()=>run('prepareBackup(invalidTitle)'),/Garden title/);
assert.equal(run('prepareBackup(backup).images[0].blob.size'),3);
const noImage=structuredClone(backup);noImage.data.images.splice(0,1);set('globalThis.noImage='+JSON.stringify(noImage));
assert.throws(()=>run('prepareBackup(noImage)'),/missing or invalid photos/);
const old=structuredClone(backup);old.schemaVersion=1;set('globalThis.old='+JSON.stringify(old));assert.throws(()=>run('prepareBackup(old)'),/older backup schema/);
const newer=structuredClone(backup);newer.schemaVersion=3;set('globalThis.newer='+JSON.stringify(newer));assert.throws(()=>run('prepareBackup(newer)'),/newer version/);
const secret=structuredClone(backup);secret.data.settings.push({id:'plantnetKey',value:'private'});set('globalThis.secret='+JSON.stringify(secret));assert.throws(()=>run('prepareBackup(secret)'),/API key/);
const line=structuredClone(backup);line.data.plants[0].geometry={type:'LineString',coordinates:[[-3.000,40.0000],[-3.001,40.0001]]};set('globalThis.line='+JSON.stringify(line));assert.equal(run('prepareBackup(line).plants[0].geometry.type'),'LineString');
const poly=structuredClone(backup);poly.data.plants[0].geometry={type:'Polygon',coordinates:[[[-5.28,36.64],[-5.29,36.64],[-5.29,36.65],[-5.28,36.64]]]};set('globalThis.poly='+JSON.stringify(poly));assert.equal(run('prepareBackup(poly).plants[0].geometry.type'),'Polygon');
const geo=structuredClone(backup);geo.data.settings[0].geo={epsg:25830,x0:296000,y0:4058800,a:.3,b:.1,c:.1,d:-.3};set('globalThis.geo='+JSON.stringify(geo));assert.equal(run('prepareBackup(geo).settings[0].geo.b'),.1);
set(`state.plantTypes=[{id:'t1',nameEn:'Olive',color:'#ff9933'}];state.markers=[{id:'a',geometry:pointGeometry(36.64,-5.28),plantTypeId:'t1',statuses:[]},{id:'b',geometry:pointGeometry(36.64,-5.29),plantTypeId:'t1',statuses:[{id:'e',timestamp:'2026-01-01T00:00:00Z',removed:true}]}]`);
assert.equal(run('state.markers.filter(markerMatchesFilter).length'),1);
set("state.filters.removed='show'");assert.equal(run('state.markers.filter(markerMatchesFilter).length'),2);
console.log('PASS — v1.4 GeoJSON schema, georeferencing, filters, journal state and backup validation');
