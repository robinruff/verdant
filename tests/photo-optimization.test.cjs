const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=__dirname+'/../';
const source=fs.readFileSync(root+'public/taxonomy.js','utf8')+'\n'+fs.readFileSync(root+'public/garden-title.js','utf8')+'\n'+fs.readFileSync(root+'public/localized-names.js','utf8')+'\n'+fs.readFileSync(root+'app.js','utf8').replace(/init\(\);\s*$/,'');
const optimizer=fs.readFileSync(root+'public/photo-optimizer.js','utf8');
const elements=new Map();const elem=selector=>{if(!elements.has(selector))elements.set(selector,{value:'',innerHTML:'',textContent:'',classList:{toggle(){}}});return elements.get(selector);};
let optimized=0;
const context=vm.createContext({console,Blob,URL,Date,Math,crypto:globalThis.crypto,setTimeout,clearTimeout,
  document:{querySelector:elem,querySelectorAll:()=>[]},window:{}});
vm.runInContext(optimizer,context);context.VerdantPhotos=context.window.VerdantPhotos;
vm.runInContext(source,context);
const originals=new Map();const writes=[];
context.writes=writes;context.originals=originals;
vm.runInContext(`
  dbChange=async (name,method,record)=>{writes.push({name,record});originals.set(record.id,record)};
  toast=()=>{};
  state.settings=[{id:'photoOptimization',targetKB:300,maxDimension:1600,format:'image/jpeg'}];
  VerdantPhotos={...VerdantPhotos,compress:async (blob,config)=>{
    if(blob.size<1000)return {blob,changed:false,reason:'Already within the selected limits.'};
    return {blob:new Blob([new Uint8Array(350)],{type:config.format}),changed:true,width:1200,height:900};
  }};
`,context);
(async()=>{
  const big=new Blob([new Uint8Array(2000)],{type:'image/jpeg'});
  const photoId=await vm.runInContext(`saveImage(new Blob([new Uint8Array(2000)],{type:'image/jpeg'}),'plant.jpg')`,context);
  assert.equal(originals.get(photoId).blob.size,350);
  assert.equal(originals.get(photoId).optimization.width,1200);
  assert.equal(originals.get(photoId).mimeType,'image/jpeg');
  const mapId=await vm.runInContext(`saveImage(new Blob([new Uint8Array(2000)],{type:'image/jpeg'}),'aerial.jpg','map')`,context);
  assert.equal(originals.get(mapId).blob.size,2000,'map imagery must bypass optimizer');
  const backup={format:'verdant-garden-backup',schemaVersion:2,data:{plants:[],plantTypes:[],settings:[{id:'photoOptimization',targetKB:300,maxDimension:1600,format:'image/jpeg'}],images:[]}};
  context.backup=backup;const restored=vm.runInContext('prepareBackup(backup)',context);
  assert.equal(restored.settings.length,1);
  let threw=false;try{context.VerdantPhotos.validate({targetKB:15,maxDimension:1600,format:'image/jpeg'});}catch{threw=true;}
  assert(threw,'must reject unsafe configuration');
  console.log('PASS: stored photos optimized, maps untouched, image IDs stable, schema-2 settings validated');
})().catch(e=>{console.error(e);process.exitCode=1;});
