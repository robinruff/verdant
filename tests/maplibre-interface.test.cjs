// MapLibre interface smoke test with an in-memory map mock (not WebGL rendering).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../public/taxonomy.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../public/garden-title.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../public/localized-names.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../app.js','utf8').replace(/init\(\);\s*$/,'');
const scope=vm.createContext({console,Blob,URL,crypto:globalThis.crypto,atob,btoa,Math,Date,setTimeout,clearTimeout});
vm.runInContext(source,scope);
const exec=code=>vm.runInContext(code,scope);
exec(`
  const refLat=36.65,refLon=-5.28;const perLat=111194.92664,perLon=perLat*Math.cos(refLat*Math.PI/180);
  state.map={id:'map',imageId:'img',width:500,height:500,points:[
    {id:'a',lat:refLat,lon:refLon,x:0,y:0},
    {id:'b',lat:refLat-100/perLat,lon:refLon+100/perLon,x:100,y:100}]};
  state.images.set('img',true);state.imageURLs.set('img','blob:mock-map');
  state.markers=[{id:'p1',geometry:pointGeometry(refLat-200/perLat,refLon+200/perLon),plantTypeId:'t1',statuses:[]},
    {id:'p2',geometry:{type:'LineString',coordinates:[[refLon,refLat],[refLon+.001,refLat]]},plantTypeId:'t1',statuses:[]}];
  state.plantTypes=[{id:'t1',nameEn:'Rosemary',color:'#247955'}];
  globalThis.fake={sources:{},layers:{},order:[],
    getLayer(id){return this.layers[id]},getSource(id){return this.sources[id]},
    addSource(id,value){this.sources[id]={def:value,data:null,setData(data){this.data=data}}},
    removeSource(id){delete this.sources[id]},
    addLayer(layer,beforeId){this.layers[layer.id]=layer;const at=beforeId?this.order.indexOf(beforeId):-1;if(at<0)this.order.push(layer.id);else this.order.splice(at,0,layer.id)},
    removeLayer(id){delete this.layers[id];this.order=this.order.filter(x=>x!==id)}
  };
  state.glMap=fake;state.glStyleReady=true;
  refreshMapLayers(false);
`);
assert.equal(exec("fake.getSource('garden-plants').data.features.length"),2);
assert.equal(exec("fake.getSource('garden-plants').data.features[0].geometry.type"),'Point');
assert.equal(exec("fake.getSource('garden-plants').data.features[1].geometry.type"),'LineString');
assert.equal(exec("fake.getSource('garden-plants').data.features[0].properties.color"),'#247955');
exec("state.filters.types=['unassigned'];renderMarkers()");
assert.equal(exec("fake.getSource('garden-plants').data.features.length"),0);
exec("state.filters.types=[];refreshMapLayers(false)");
const order=exec('fake.order.join(",")');
assert(order.indexOf('garden-raster')<order.indexOf('plant-points'),'raster must stay behind markers after map replacement');
assert.equal(exec("fake.getSource('garden-raster').def.coordinates.length"),4);
console.log('PASS — MapLibre adapter provides GeoJSON points and lines, filters and raster stacking');
