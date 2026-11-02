const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../public/zip-backup.js','utf8');
const context=vm.createContext({Blob,Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,Date,globalThis:{}});
vm.runInContext(source,context);
const Z=context.globalThis.VerdantZip;
(async()=>{
  const photos=[new Blob([Uint8Array.from({length:2097153},(_,i)=>(i*i)%256)],{type:'image/jpeg'}),new Blob([Uint8Array.from([0,1,2,3,4,0,255])],{type:'image/png'})];
  const records={format:'verdant-garden-backup',schemaVersion:2,exportedAt:new Date().toISOString(),data:{
    plants:[{id:'p',geometry:{type:'Point',coordinates:[-5.287,36.649]},statuses:[{id:'s',timestamp:'2026-10-19T00:00:00Z',imageIds:['im1','im2']}]}],plantTypes:[],settings:[],
    images:[{id:'im1',mimeType:'image/jpeg',path:'images/00001.bin'},{id:'im2',mimeType:'image/png',path:'images/00002.bin'}]}};
  let parts=[],calls=0;
  const output={async write(b){assert(b.byteLength<=256*1024+200);calls++;parts.push(new Uint8Array(b));},async close(){},async abort(){throw new Error('should not abort');}};
  const entries=[{path:'data.json',blob:new Blob([JSON.stringify(records)])},...photos.map((blob,i)=>({path:records.data.images[i].path,blob}))];
  await Z.writeZip(output,entries);
  const zip=new Blob(parts,{type:'application/zip'});
  const parsed=await Z.parseVerdantZip(zip);
  assert.equal(parsed.data.plants.length,1);assert.equal(parsed.data.images.length,2);
  assert.equal(parsed.data.images[0].blob.size,photos[0].size);
  assert.deepEqual(Buffer.from(await parsed.data.images[1].blob.arrayBuffer()),Buffer.from(await photos[1].arrayBuffer()));
  assert(calls>=10,'Should stream photo in many chunks rather than one buffer');
  // Corruption of a photo must fail before restore confirmation.
  const orig=Buffer.from(await zip.arrayBuffer());const index=orig.indexOf(Buffer.from([0,1,2,3,4,0,255]));assert(index>=0);orig[index+3]^=0x40;
  await assert.rejects(()=>Z.parseVerdantZip(new Blob([orig])),/CRC mismatch/);
  // Failure aborts the output and won't produce a completed ZIP.
  let aborted=false;
  await assert.rejects(()=>Z.writeZip({async write(){throw Error('full disk')},async abort(){aborted=true}},entries),/full disk/);
  assert(aborted);
  console.log('PASS: streaming ZIP multi-MB roundtrip, photo integrity, CRC errors, writer abort');
})().catch(e=>{console.error(e);process.exitCode=1;});
