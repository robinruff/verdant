// Checks app startup does not request original photograph records and
// inventory previews create lazy DOM image placeholders, not eager URLs.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../public/taxonomy.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../public/garden-title.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../public/localized-names.js','utf8')+'\n'+fs.readFileSync(__dirname+'/../app.js','utf8').replace(/init\(\);\s*$/,'');
const elements=new Map();const el=key=>{if(!elements.has(key))elements.set(key,{value:'',innerHTML:'',textContent:'',classList:{toggle(){}}});return elements.get(key);};
const ctx=vm.createContext({console,Blob,URL,Date,Math,crypto:globalThis.crypto,setTimeout,clearTimeout,window:{},document:{querySelector:el,querySelectorAll:()=>[]}});
vm.runInContext(source,ctx);
vm.runInContext(`
 dbAll=async store=>{if(store==='images')throw Error('Eager photo loading forbidden');return ({plants:[{id:'plant1',geometry:pointGeometry(40.000,-3.000),plantTypeId:'olive',statuses:[{id:'s1',timestamp:nowISO(),imageIds:['photo1']}]}],plantTypes:[{id:'olive',nameEn:'Olive'}],settings:[]})[store]};
 dbKeys=async store=>{if(store!=='images')throw Error('Wrong keys store');return ['photo1']};
 migrateTaxonomy=async()=>0;renderAll=()=>{};ensureMapImage=()=>{};releasePhotos=()=>{};observePhotos=()=>{};
 state.db={};
`,ctx);
(async()=>{
 await vm.runInContext('loadData()',ctx);
 assert.equal(vm.runInContext('state.markers.length',ctx),1);
 assert.equal(vm.runInContext('state.images.size',ctx),1);
 assert.equal(vm.runInContext('state.images.get("photo1")',ctx),true);
 vm.runInContext('renderPlantList()',ctx);
 const html=el('#plantList').innerHTML;
 assert(html.includes('data-image-id="photo1"'));
 assert(!/<img[^>]*src=/.test(html),'no eager image object URLs in plant list');
 console.log('PASS: IndexedDB loads image IDs only; plant card creates lazy image placeholder');
})().catch(err=>{console.error(err);process.exitCode=1});
