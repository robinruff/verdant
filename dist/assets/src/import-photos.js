/* Portable, bounded-memory ZIP image restore.
 * A Blob.slice() of an iOS Files-picker ZIP can remain tied to its original
 * provider. Store detached image bytes, and verify a read from IndexedDB,
 * before atomically replacing any garden records. No schema migration.
 */
const CHUNK=256*1024;
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[i]=c>>>0;}return t;})();
function updateCRC(crc,bytes){for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);return crc>>>0;}
const finishCRC=crc=>(crc^0xffffffff)>>>0;
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Image storage request failed'));});}
function transact(db,storeName,doWork){return new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,'readwrite');
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Image storage transaction aborted'));
  tx.onerror=()=>reject(tx.error||Error('Image storage transaction failed'));
  try{doWork(tx.objectStore(storeName),tx);}catch(err){try{tx.abort();}catch{}reject(err);}
});}
async function detachBlob(source,mimeType){
  // Only one photo is buffered at once; never materialize the complete ZIP.
  const parts=[];let crc=0xffffffff;
  for(let at=0;at<source.size;at+=CHUNK){
    const part=new Uint8Array(await source.slice(at,at+CHUNK).arrayBuffer());
    parts.push(part);crc=updateCRC(crc,part);
  }
  return {blob:new Blob(parts,{type:mimeType}),crc:finishCRC(crc)};
}
async function checksum(blob){let crc=0xffffffff;
  for(let at=0;at<blob.size;at+=CHUNK)crc=updateCRC(crc,new Uint8Array(await blob.slice(at,at+CHUNK).arrayBuffer()));
  return finishCRC(crc);
}
async function cleanup(db,ids){if(!ids.length)return;
  try{await transact(db,'images',store=>{for(const id of ids)store.delete(id);});}
  catch(err){console.warn('Could not remove temporary restore images',err);}
}
/** Restore metadata and images as one final transaction after staged image validation.
 * Existing plant, image and settings records are not cleared if staging fails.
 */
export async function replaceImportedGarden(db,data,{apiKey=null,previousTitle=null,onProgress=()=>{},imagesOnly=false}={}){
  const nonce=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`).replace(/[^a-z0-9-]/gi,'');
  const staged=[];
  try{
    for(let i=0;i<data.images.length;i++){
      const image=data.images[i];
      if(!(image.blob instanceof Blob)||!image.blob.size)throw Error(`Missing image data: ${image.id}`);
      const tempId=`\uffffverdant-import-${nonce}-${i}`;
      const {blob,crc}=await detachBlob(image.blob,image.mimeType);
      staged.push({tempId,originalId:image.id,crc,size:blob.size});
      // Detached from the selected ZIP's File/Blob backing before persistence.
      const record={id:tempId,name:image.name||'image',mimeType:image.mimeType,
        createdAt:image.createdAt||null,blob};
      await transact(db,'images',store=>store.put(record));
      const stored=await request(db.transaction('images','readonly').objectStore('images').get(tempId));
      if(!(stored?.blob instanceof Blob)||stored.blob.size!==blob.size||
          await checksum(stored.blob)!==crc)throw Error(`Stored photo verification failed: ${image.id}. Original garden was preserved.`);
      onProgress(`Checking imported images… ${i+1} / ${data.images.length}`);
    }
    // Names/IDs are tiny; only one image Blob is ever materialized at a time.
    const keys=await request(db.transaction('images','readonly').objectStore('images').getAllKeys());
    const kept=new Set(staged.map(s=>s.tempId));
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(imagesOnly?['images']:['plants','plantTypes','images','settings'],'readwrite');
      const photos=tx.objectStore('images');
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(tx.error||Error('Restore aborted; original garden preserved'));
      tx.onerror=()=>reject(tx.error||Error('Restore failed; original garden preserved'));
      if(!imagesOnly){
        for(const store of ['plants','plantTypes','settings'])tx.objectStore(store).clear();
        // Delete old images only on a complete garden replacement.
        for(const id of keys)if(!kept.has(id))photos.delete(id);
        for(const store of ['plants','plantTypes','settings'])for(const record of data[store])tx.objectStore(store).put(record);
        if(apiKey)tx.objectStore('settings').put(apiKey);
        if(previousTitle&&!data.settings.some(s=>s.id==='gardenTitle'))tx.objectStore('settings').put(previousTitle);
      }
      for(const entry of staged){
        const get=photos.get(entry.tempId);
        get.onsuccess=()=>{
          if(!get.result?.blob){tx.abort();return;}
          photos.put({...get.result,id:entry.originalId});
          photos.delete(entry.tempId);
        };
      }
    });
  }catch(err){await cleanup(db,staged.map(s=>s.tempId));throw err;}
}
