'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../public/taxonomy.js','utf8');
const ctx=vm.createContext({});vm.runInContext(src,ctx);const t=ctx.VerdantTaxonomy;
const plain=x=>JSON.parse(JSON.stringify(x));
// Never derive missing taxa by splitting a scientific name.
const original={id:'stable1',nameEn:'Olive',scientificName:'Olea europaea',links:['https://example.org'],color:'#123456'};
const migrated=t.migrateType(original);
assert.notEqual(migrated,original);
assert.equal(migrated.id,original.id);
assert.equal(original.genus,undefined);
assert.equal(migrated.family,'');
assert.equal(migrated.genus,'');
assert.equal(migrated.species,'Olea europaea');
assert.deepEqual(plain(t.migrateType(migrated)),plain(migrated),'idempotent');
const existing=t.migrateType({...original, family:'Oleaceae',genus:'Olea',species:'europaea'});
assert.equal(existing.family,'Oleaceae');assert.equal(existing.genus,'Olea');
assert.equal(existing.species,'Olea europaea','repairs legacy auto-created epithet');
const manual=t.migrateType({...original, family:'My-family',genus:'My-genus',species:'special cultivar'});
assert.equal(manual.species,'special cultivar','distinct, manually saved species is preserved');
const plantNet=t.fromPlantNetSpecies({scientificNameWithoutAuthor:'Hibiscus rosa-sinensis',genus:{scientificNameWithoutAuthor:'Hibiscus'},family:{scientificNameWithoutAuthor:'Malvaceae'}});
assert.deepEqual(plain(plantNet),{scientificName:'Hibiscus rosa-sinensis',species:'Hibiscus rosa-sinensis',genus:'Hibiscus',family:'Malvaceae'});
assert.deepEqual(plain(t.fromPlantNetSpecies({scientificName:'Olea europaea'})),{scientificName:'Olea europaea',species:'Olea europaea',genus:'',family:''});
assert(t.searchable('Limón').includes('limon'));
const records=[{id:'a',family:'Oleaceae',genus:'Olea',species:'europaea'},
 {id:'b',family:'Oleaceae',genus:'Ligustrum',species:'lucidum'},
 {id:'c',family:'Fagaceae',genus:'Quercus',species:'suber'}];
assert.deepEqual(records.filter(r=>t.matches(r,{types:[],family:['Oleaceae'],genus:['Olea','Ligustrum']})).map(r=>r.id),['a','b']);
assert.deepEqual(records.filter(r=>t.matches(r,{types:[],family:['Fagaceae'],genus:['Olea','Ligustrum']})).map(r=>r.id),[]);
assert.deepEqual(records.filter(r=>t.matches(r,{types:['b'],family:[],genus:[]})).map(r=>r.id),['b']);
assert(t.matches(null,{types:['unassigned'],family:[],genus:[]}));
assert(!t.matches(null,{types:[],family:['Oleaceae'],genus:[]}));
assert.equal(t.groupTypes(records).length,3);
assert.equal(fs.readFileSync(__dirname+'/../app.js','utf8').includes("const DB_VERSION = 1;"),true);
console.log('PASS: no taxonomy inference, full species names, Pl@ntNet fields, idempotent migration and filtering');
