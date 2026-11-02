/* Verdant photo optimizer (v1.4.4): local-only, one photograph at a time.
   No dependencies. The caller owns IndexedDB writes and rollback semantics. */
(function(root){
  'use strict';
  const DEFAULTS=Object.freeze({id:'photoOptimization',targetKB:300,maxDimension:1600,format:'image/jpeg'});
  const MIMES=['image/jpeg','image/webp'];
  function validate(input){
    const n=Number(input?.targetKB),d=Number(input?.maxDimension),format=String(input?.format||'');
    if(!Number.isInteger(n)||n<50||n>10000)throw Error('Target size must be a whole number from 50 to 10,000 KB.');
    if(!Number.isInteger(d)||d<480||d>8000)throw Error('Maximum dimension must be between 480 and 8,000 pixels.');
    if(!MIMES.includes(format))throw Error('Choose JPEG or WebP output.');
    return {id:'photoOptimization',targetKB:n,maxDimension:d,format};
  }
  const settings=value=>validate(value||DEFAULTS);
  // Backups are garden-portable: always include the effective configuration,
  // even if the user never pressed Save and the defaults were only implicit.
  // Also use this when restoring an older backup without the record; never
  // borrow different photo limits from the destination browser.
  function backupSettings(records){
    if(!Array.isArray(records))throw Error('Missing garden settings array.');
    const matches=records.filter(r=>r?.id==='photoOptimization');
    if(matches.length>1)throw Error('Duplicate photo settings in backup.');
    const photo=settings(matches[0]||null);
    return [...records.filter(r=>r?.id!=='photoOptimization'),photo];
  }
  const fingerprint=s=>`${s.targetKB}:${s.maxDimension}:${s.format}`;
  function isEligible(blob){return blob instanceof Blob && /^image\/(jpeg|png|webp|bmp|heic|heif|avif)$/i.test(blob.type);}
  async function decode(blob){
    if(typeof createImageBitmap==='function'){
      try{
        const bitmap=await createImageBitmap(blob);
        if(!bitmap.width||!bitmap.height)throw Error('Invalid image dimensions');
        return {width:bitmap.width,height:bitmap.height,draw:(ctx,w,h)=>ctx.drawImage(bitmap,0,0,w,h),close:()=>bitmap.close()};
      }catch(e){ /* HTMLImageElement fallback handles browser-specific decoders. */ }
    }
    const url=URL.createObjectURL(blob),img=new Image();
    try{
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('This browser cannot decode this photograph.'));img.src=url;});
      if(!img.naturalWidth||!img.naturalHeight)throw Error('Invalid image dimensions');
      return {width:img.naturalWidth,height:img.naturalHeight,draw:(ctx,w,h)=>ctx.drawImage(img,0,0,w,h),close:()=>{img.src='';URL.revokeObjectURL(url);}};
    }catch(e){URL.revokeObjectURL(url);throw e;}
  }
  function encode(canvas,mime,quality){
    return new Promise((resolve,reject)=>{
      try { canvas.toBlob(b=>b?resolve(b):reject(Error('Browser could not encode this photograph.')),mime,quality); }
      catch(e){reject(e);}
    });
  }
  // Approximately sized photographs: prefer detail to hitting an exact byte count.
  // At most four canvas sizes and up to five quality trials per size.
  async function compress(blob,options){
    const config=settings(options);
    if(!(blob instanceof Blob)||!blob.size)throw Error('Empty or invalid photo');
    if(!isEligible(blob))return {blob,changed:false,reason:'Unsupported or animated image; original preserved.'};
    let decoded;
    try{decoded=await decode(blob);}catch(err){return {blob,changed:false,reason:err.message||'Image decoder unavailable; original preserved.'};}
    try{
      const originalWidth=decoded.width,originalHeight=decoded.height;
      const originalMax=Math.max(originalWidth,originalHeight),limit=config.targetKB*1024;
      if(originalMax<=config.maxDimension && blob.size<=limit){
        return {blob,changed:false,reason:'Already within the selected limits.',width:originalWidth,height:originalHeight};
      }
      const firstScale=Math.min(1,config.maxDimension/originalMax);
      let best=null;
      for(let pass=0;pass<4;pass++){
        const scale=firstScale*Math.pow(0.8,pass);
        const w=Math.max(1,Math.round(originalWidth*scale)),h=Math.max(1,Math.round(originalHeight*scale));
        // Avoid extreme downscaling simply to meet an arbitrary byte target.
        if(pass>0&&Math.max(w,h)<Math.min(640,config.maxDimension))break;
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        try{
          const ctx=canvas.getContext('2d',{alpha:config.format!=='image/jpeg'});
          if(!ctx)throw Error('Canvas context unavailable.');
          if(config.format==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);}
          decoded.draw(ctx,w,h);
          let lo=0.55,hi=0.88;
          // Start near visually useful quality; binary search up to 4 more passes.
          for(let attempt=0;attempt<5;attempt++){
            const q=attempt===0?0.82:(lo+hi)/2;
            const out=await encode(canvas,config.format,q);
            if(out.type!==config.format)throw Error(`This browser does not support ${config.format} encoding. Choose JPEG instead.`);
            const candidate={blob:out,width:w,height:h,quality:q,changed:true,overTarget:out.size>limit,originalWidth,originalHeight};
            if(!best || (candidate.blob.size<=limit && best.blob.size>limit) ||
                (candidate.blob.size<=limit&&best.blob.size<=limit&&w*h>best.width*best.height) ||
                (candidate.blob.size<=limit&&best.blob.size<=limit&&w*h===best.width*best.height&&q>best.quality) ||
                (candidate.blob.size>limit&&best.blob.size>limit&&candidate.blob.size<best.blob.size))best=candidate;
            if(out.size>limit)hi=q;else lo=q;
          }
          if(best && !best.overTarget)break;
        }finally{canvas.width=0;canvas.height=0;}
      }
      if(!best)return {blob,changed:false,reason:'Encoding did not produce a usable image.',width:originalWidth,height:originalHeight};
      // Compression should never increase the original's disk usage. Resized images
      // are always smaller in pixel dimensions, but can be slightly larger in bytes.
      if(best.blob.size>=blob.size){return {blob,changed:false,reason:'The processed version was not smaller; original preserved.',width:originalWidth,height:originalHeight};}
      return best;
    }finally{decoded.close();}
  }
  root.VerdantPhotos=Object.freeze({DEFAULTS,validate,settings,backupSettings,fingerprint,isEligible,compress});
})(typeof window!=='undefined'?window:globalThis);
