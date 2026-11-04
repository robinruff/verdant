/* Verdant ZIP backup streaming tools. No compression: photos are already compressed.
   ZIP32 with data descriptors, CRC-32 and UTF-8 file names; max 4 GiB total.
   Each Blob is read in small slices, never encoded to Base64 or concatenated. */
(function(global){
'use strict';
const enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true});
const CHUNK=256*1024, MAX=0xffffffff;
// Optional self-contained print bundle; the data.json schema stays unchanged.
// Both export and restore use this exact filename allowlist.
const PRINT_MODULES=Object.freeze(['printout.typ','map.typ','geometry.typ','tiles.typ','side-labels.typ','cluster-tiles.typ','auto-grid.typ']);
const PRINT_FILES=Object.freeze([...PRINT_MODULES,'README.md']);
const LEGACY_PRINT_FILES=Object.freeze([...PRINT_MODULES,'PRINT_README.txt']);
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}
const updateCRC=(crc,chunk)=>{for(let i=0;i<chunk.length;i++)crc=table[(crc^chunk[i])&255]^(crc>>>8);return crc>>>0;};
const u16=(dv,o,v)=>dv.setUint16(o,v,true),u32=(dv,o,v)=>dv.setUint32(o,v>>>0,true);
function dosDateTime(date=new Date()){
 const y=Math.max(1980,date.getFullYear());
 return {date:((Math.min(y,2107)-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate(),time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1)};
}
async function writeZip(output,entries,onProgress=()=>{}){
 const writer=typeof output.getWriter==='function'?output.getWriter():output;
 const central=[];let offset=0,files=0,done=false;
 async function write(bytes){if(offset+bytes.byteLength>MAX)throw Error('ZIP exceeds 4 GiB limit. Export a smaller garden.');await writer.write(bytes);offset+=bytes.byteLength;}
 try{
  for await(const entry of entries){
   const name=String(entry.path);const nameBytes=enc.encode(name);
   if(!name||nameBytes.length>65535||name.startsWith('/')||name.includes('..')||name.includes('\\'))throw Error('Unsafe ZIP entry name');
   if(!(entry.blob instanceof Blob)||entry.blob.size>MAX)throw Error('ZIP input is invalid or over 4 GiB');
   if(central.some(x=>x.name===name))throw Error('Duplicate ZIP entry: '+name);
   const {time,date}=dosDateTime();const start=offset;
   const header=new Uint8Array(30+nameBytes.length),h=new DataView(header.buffer);
   u32(h,0,0x04034b50);u16(h,4,20);u16(h,6,0x0808);u16(h,8,0);u16(h,10,time);u16(h,12,date);
   u16(h,26,nameBytes.length);header.set(nameBytes,30);await write(header);
   let crc=0xffffffff,size=0;
   for(let at=0;at<entry.blob.size;at+=CHUNK){
    const bytes=new Uint8Array(await entry.blob.slice(at,at+CHUNK).arrayBuffer());
    crc=updateCRC(crc,bytes);size+=bytes.length;await write(bytes);
   }
   crc=(crc^0xffffffff)>>>0;
   const desc=new Uint8Array(16),v=new DataView(desc.buffer);
   u32(v,0,0x08074b50);u32(v,4,crc);u32(v,8,size);u32(v,12,size);await write(desc);
   central.push({name,nameBytes,crc,size,start,time,date});files++;onProgress({files,bytes:offset,name});
  }
  if(central.length>65535)throw Error('Too many files for ZIP32');
  const centralStart=offset;
  for(const e of central){
   const bytes=new Uint8Array(46+e.nameBytes.length),v=new DataView(bytes.buffer);
   u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);u16(v,8,0x0808);u16(v,10,0);
   u16(v,12,e.time);u16(v,14,e.date);u32(v,16,e.crc);u32(v,20,e.size);u32(v,24,e.size);
   u16(v,28,e.nameBytes.length);u32(v,42,e.start);bytes.set(e.nameBytes,46);await write(bytes);
  }
  const centralSize=offset-centralStart;const end=new Uint8Array(22),v=new DataView(end.buffer);
  u32(v,0,0x06054b50);u16(v,8,files);u16(v,10,files);u32(v,12,centralSize);u32(v,16,centralStart);
  await write(end);await writer.close();done=true;return {files,bytes:offset};
 }finally{if(!done){try{await writer.abort?.();}catch{}}}
}
async function openZip(blob,progress=()=>{},{signal}={}){
 signal?.throwIfAborted();
 if(!(blob instanceof Blob))throw Error('Select a ZIP file');
 if(blob.size<22||blob.size>MAX)throw Error('ZIP too small or larger than 4 GiB');
 const tailStart=Math.max(0,blob.size-65557);const tail=new Uint8Array(await blob.slice(tailStart).arrayBuffer()),view=new DataView(tail.buffer);
 let eocd=-1;
 for(let i=tail.length-22;i>=0;i--){if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===tail.length){eocd=i;break;}}
 if(eocd<0)throw Error('ZIP end record not found');
 const u16r=(dv,p)=>dv.getUint16(p,true),u32r=(dv,p)=>dv.getUint32(p,true);
 const count=u16r(view,eocd+10),centralSize=u32r(view,eocd+12),centralOffset=u32r(view,eocd+16);
 if(u16r(view,eocd+4)||u16r(view,eocd+6)||u16r(view,eocd+8)!==count||centralOffset+centralSize>tailStart+eocd)throw Error('Invalid or multipart ZIP');
 const central=new DataView(await blob.slice(centralOffset,centralOffset+centralSize).arrayBuffer());
 const entries=new Map();let at=0;
 for(let n=0;n<count;n++){
  signal?.throwIfAborted();
  if(at+46>central.byteLength||u32r(central,at)!==0x02014b50)throw Error('Invalid central directory');
  const flags=u16r(central,at+8),method=u16r(central,at+10),crc=u32r(central,at+16),compressed=u32r(central,at+20),size=u32r(central,at+24);
  const nameLength=u16r(central,at+28),extraLength=u16r(central,at+30),commentLength=u16r(central,at+32),localOffset=u32r(central,at+42);
  if(method!==0||flags&1||compressed!==size||!(flags&0x0800))throw Error('Unsupported ZIP entry (must be unencrypted, stored UTF-8)');
  if(at+46+nameLength+extraLength+commentLength>central.byteLength)throw Error('Invalid entry length');
  const name=dec.decode(new Uint8Array(central.buffer,central.byteOffset+at+46,nameLength));
  if(!name||name.includes('..')||name.startsWith('/')||name.includes('\\')||entries.has(name))throw Error('Unsafe or duplicate ZIP entry');
  const local=new DataView(await blob.slice(localOffset,localOffset+30).arrayBuffer());
  if(local.byteLength<30||u32r(local,0)!==0x04034b50)throw Error('Invalid ZIP file header');
  const contentAt=localOffset+30+u16r(local,26)+u16r(local,28);
  if(contentAt+size>centralOffset)throw Error('ZIP content overlaps directory');
  entries.set(name,{name,size,crc,blob:blob.slice(contentAt,contentAt+size)});
  at+=46+nameLength+extraLength+commentLength;
 }
 if(at!==central.byteLength)throw Error('Malformed ZIP directory');
 async function verify(e){
  let crc=0xffffffff;
  for(let i=0;i<e.size;i+=CHUNK){signal?.throwIfAborted();crc=updateCRC(crc,new Uint8Array(await e.blob.slice(i,i+CHUNK).arrayBuffer()));}
  signal?.throwIfAborted();
  if(((crc^0xffffffff)>>>0)!==e.crc)throw Error('Backup ZIP CRC mismatch: '+e.name);
  progress(e.name);
 }
 return {entries,verify};
}
async function parseVerdantZip(file,progress=()=>{},options={}){
 const zip=await openZip(file,progress,options),json=zip.entries.get('data.json');
 if(!json||json.size>24*1024*1024)throw Error('ZIP missing data.json or records are unexpectedly large');
 await zip.verify(json);
 let parsed;try{parsed=JSON.parse(await json.blob.text());}catch{throw Error('Invalid data.json');}
 if(parsed?.format!=='verdant-garden-backup'||parsed.schemaVersion!==2||!parsed.data||!Array.isArray(parsed.data.images))throw Error('Not a Verdant schema-2 ZIP backup');
 if(zip.entries.size<parsed.data.images.length+1)throw Error('Image files in ZIP do not match manifest');
 const paths=new Set();
 for(const meta of parsed.data.images){
  const p=meta.path;
  if(typeof p!=='string'||!/^images\/[0-9]{5,8}\.bin$/.test(p)||paths.has(p))throw Error('Invalid or duplicate image path');
  paths.add(p);const item=zip.entries.get(p);if(!item)throw Error('Missing image from ZIP: '+p);
  await zip.verify(item);
  meta.blob=item.blob.slice(0,item.size,meta.mimeType);delete meta.path;
 }
 // Older backups have no Typst files; new ones must include the entire bundle.
 // Reject unknown entries and verify CRC for the bundled source files as well.
 const extras=[];
 for(const [name,item] of zip.entries){
  if(name==='data.json'||paths.has(name))continue;
  if(!PRINT_FILES.includes(name)&&!LEGACY_PRINT_FILES.includes(name))throw Error('Unexpected file in Verdant backup: '+name);
  extras.push(name);await zip.verify(item);
 }
 if(extras.length&&!([PRINT_FILES,LEGACY_PRINT_FILES].some(files=>extras.length===files.length&&files.every(name=>extras.includes(name)))))throw Error('Incomplete Typst print template in ZIP');
 return parsed;
}
global.VerdantZip={writeZip,openZip,parseVerdantZip,printFiles:PRINT_FILES};
})(typeof window!=='undefined'?window:globalThis);
