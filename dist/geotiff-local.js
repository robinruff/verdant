/* Verdant's minimal offline GeoTIFF importer.
   Classic GeoTIFF, including rotated affine imagery, RGB/gray 8-bit, strips or tiles; compression
   none, LZW, Deflate or modern JPEG. No CDN, worker, or npm required.
   EPSG:4326 / 4258, 3857, 25829-25831, 32629-32631.
   Reject unknown formats rather than silently placing plants incorrectly. */
'use strict';
(function(scope) {
  const ensure=(ok,msg)=>{if(!ok)throw new Error('GeoTIFF: '+msg);};
  const supported=new Set([4326,4258,3857,25829,25830,25831,32629,32630,32631]);
  const rad=Math.PI/180;
  function utmZone(epsg){return epsg % 100;}
  function forward(lat,lon,epsg) {
    if(epsg===4326||epsg===4258)return [lon,lat];
    if(epsg===3857){const safe=Math.min(85.05112878,Math.max(-85.05112878,lat));return [6378137*lon*rad,6378137*Math.log(Math.tan(Math.PI/4+safe*rad/2))];}
    const zone=utmZone(epsg),a=6378137,f=epsg>=25800&&epsg<25900?1/298.257222101:1/298.257223563;
    const e2=f*(2-f),ep=e2/(1-e2),phi=lat*rad,L=(lon-(zone*6-183))*rad;
    const s=Math.sin(phi),c=Math.cos(phi),t=Math.tan(phi),N=a/Math.sqrt(1-e2*s*s),T=t*t,C=ep*c*c,A=c*L;
    const M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*phi)-(35*e2**3/3072)*Math.sin(6*phi));
    return [500000+.9996*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep)*A**5/120),.9996*(M+N*t*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep)*A**6/720))];
  }
  function inverse(x,y,epsg){
    if(epsg===4326||epsg===4258)return {lat:y,lon:x};
    if(epsg===3857)return {lat:(2*Math.atan(Math.exp(y/6378137))-Math.PI/2)/rad,lon:x/6378137/rad};
    const zone=utmZone(epsg),a=6378137,f=epsg>=25800&&epsg<25900?1/298.257222101:1/298.257223563;
    const e2=f*(2-f),ep=e2/(1-e2),e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2)),M=y/.9996;
    const mu=M/(a*(1-e2/4-3*e2**2/64-5*e2**3/256));
    const phi=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
    const s=Math.sin(phi),c=Math.cos(phi),t=Math.tan(phi),N=a/Math.sqrt(1-e2*s*s),R=a*(1-e2)/(1-e2*s*s)**1.5,T=t*t,C=ep*c*c,D=(x-500000)/(N*.9996);
    const lat=phi-(N*t/R)*(D*D/2-(5+3*T+10*C-4*C*C-9*ep)*D**4/24+(61+90*T+298*C+45*T*T-252*ep-3*C*C)*D**6/720);
    const lon=(zone*6-183)*rad+(D-(1+2*T+C)*D**3/6+(5-2*C+28*T-3*C*C+8*ep+24*T*T)*D**5/120)/c;
    return {lat:lat/rad,lon:lon/rad};
  }
  const axes=geo=>({a:geo.a??geo.dx,b:geo.b??0,c:geo.c??0,d:geo.d??geo.dy});
  const geoToPixel=(geo,lat,lon)=>{const [x,y]=forward(lat,lon,geo.epsg),{a,b,c,d}=axes(geo),det=a*d-b*c;ensure(Math.abs(det)>1e-14,'invalid affine transform');return {x:((x-geo.x0)*d-(y-geo.y0)*b)/det,y:((y-geo.y0)*a-(x-geo.x0)*c)/det};};
  const pixelToGeo=(geo,x,y)=>{const {a,b,c,d}=axes(geo);return inverse(geo.x0+a*x+b*y,geo.y0+c*x+d*y,geo.epsg);};
  function lzwDecode(data, expected){
    let at=0,bit=0,codeSize=9,next=258,table=[],out=new Uint8Array(expected),written=0;
    const reset=()=>{table=[];for(let i=0;i<256;i++)table[i]=[i];codeSize=9;next=258;};
    const read=()=>{let n=0;for(let i=0;i<codeSize;i++){if(at>=data.length)return -1;n=n*2+((data[at]>>(7-bit))&1);bit++;if(bit===8){bit=0;at++;}}return n;};
    reset();let prev=null;
    for(let guard=0;guard<expected*2+1024;guard++){
      const code=read();if(code<0||code===257)break;
      if(code===256){reset();prev=null;continue;}
      let row;
      if(table[code])row=table[code];else if(code===next&&prev)row=[...prev,prev[0]];else throw new Error('Invalid LZW block.');
      if(written<expected){const take=Math.min(row.length,expected-written);for(let k=0;k<take;k++)out[written+k]=row[k];written+=take;}
      if(prev){table[next++]=[...prev,row[0]];if(next===(1<<codeSize)-1&&codeSize<12)codeSize++;}
      prev=row;
    }
    ensure(written>=expected,'LZW block ended early');return out;
  }
  async function inflated(buf){
    ensure(typeof DecompressionStream!=='undefined','this browser does not support Deflate-compressed TIFFs');
    const stream=new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function parse(buffer){
    const view=new DataView(buffer),bytes=new Uint8Array(buffer);
    ensure(buffer.byteLength>16,'file is empty');
    const little=view.getUint16(0,true)===0x4949;
    ensure(little||view.getUint16(0,false)===0x4d4d,'not a TIFF');
    const u16=o=>{ensure(o+2<=bytes.length,'truncated header');return view.getUint16(o,little);};
    const u32=o=>{ensure(o+4<=bytes.length,'truncated data');return view.getUint32(o,little);};
    ensure(u16(2)===42,'BigTIFF is not supported; export as a classic cropped GeoTIFF');
    const n=u16(u32(4));let pos=u32(4)+2;ensure(n<1000,'invalid tag count');
    const types={1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8};const tags=new Map();
    for(let i=0;i<n;i++,pos+=12){
      const tag=u16(pos),type=u16(pos+2),count=u32(pos+4),size=types[type];if(!size||count>1e8)continue;
      const offset=count*size<=4?pos+8:u32(pos+8);ensure(offset+count*size<=bytes.length,'tag '+tag+' is truncated');
      let values=[];for(let j=0;j<count;j++){const p=offset+j*size;
        if(type===3)values.push(u16(p));else if(type===4)values.push(u32(p));else if(type===12)values.push(view.getFloat64(p,little));else if(type===5)values.push(u32(p)/u32(p+4));else if(type===11)values.push(view.getFloat32(p,little));else values.push(bytes[p]);
      }
      tags.set(tag,tag===347?[...bytes.subarray(offset,offset+count)]:values);
    }
    const get=(tag,def=[])=>tags.get(tag)||def;const one=(tag,def)=>get(tag)[0]??def;
    const width=one(256),height=one(257),compression=one(259,1),samples=one(277,1),planar=one(284,1),photo=one(262,2),bits=get(258,[8]);
    ensure(width>0&&height>0&&width<100000&&height<100000&&width*height<=150e6,'invalid or excessively large image; crop the GeoTIFF first');
    ensure(samples>=1&&samples<=4&&planar===1&&bits.every(b=>b===8),'requires interleaved 8-bit RGB/RGBA or grayscale pixels');
    ensure([1,5,7,8,32946].includes(compression),'unsupported compression '+compression+'; re-export using LZW/Deflate/JPEG');
    ensure([1,2,6].includes(photo),'unsupported photographic color encoding '+photo);
    ensure(!(photo===6&&compression!==7),'YCbCr TIFF needs JPEG compression');
    const keys=get(34735);let epsg=null;
    if(keys.length>=4){for(const desired of [3072,2048]){for(let i=4;i+3<keys.length;i+=4){const id=keys[i],loc=keys[i+1],value=keys[i+3];if(id===desired&&loc===0){epsg=value;break;}}if(epsg)break;}}
    ensure(supported.has(epsg),'unsupported or missing coordinate system (EPSG '+(epsg||'?')+'); export as EPSG:25830 or EPSG:4326');
    const transform=get(34264),tie=get(33922),scale=get(33550);let geo;
    if(transform.length===16){geo={epsg,x0:transform[3],y0:transform[7],a:transform[0],b:transform[1],c:transform[4],d:transform[5]};}
    else{ensure(tie.length>=6&&scale.length>=2,'missing GeoTIFF geographic tiepoint/scale');geo={epsg,x0:tie[3]-tie[0]*scale[0],y0:tie[4]+tie[1]*scale[1],dx:scale[0],dy:-scale[1]};}
    const axis=axes(geo),det=axis.a*axis.d-axis.b*axis.c;ensure([geo.x0,geo.y0,axis.a,axis.b,axis.c,axis.d].every(Number.isFinite)&&Math.abs(det)>1e-14,'invalid georeferenced pixel transform');
    const tileWidth=one(322,width),tileHeight=one(323,one(278,height));
    const offsets=get(324,get(273)),sizes=get(325,get(279));
    ensure(tileWidth>0&&tileHeight>0&&offsets.length===Math.ceil(width/tileWidth)*Math.ceil(height/tileHeight)&&sizes.length===offsets.length,'tile or strip layout unsupported');
    return {width,height,compression,samples,photo,geo,offsets,sizes,tileWidth,tileHeight,predictor:one(317,1),jpegTables:new Uint8Array(get(347,[])),bytes};
  }
  const jpegBlob=(block,tables)=>{
    if(tables.length>4&&tables[0]===255&&tables[1]===216){
      const mid=tables.subarray(2,tables.length-2),segment=block[0]===255&&block[1]===216?block.subarray(2):block;
      return new Blob([Uint8Array.of(255,216),mid,segment],{type:'image/jpeg'});
    }
    return new Blob([block],{type:'image/jpeg'});
  };
  async function decode(file,update=()=>{}){
    ensure(file.size<=180*1024*1024,'file larger than 180 MB; crop it first');
    const parsed=parse(await file.arrayBuffer()),{width,height,compression,samples,photo,offsets,sizes,tileWidth,tileHeight,bytes,predictor,jpegTables}=parsed;
    const maxSide=4096,maxPixels=14e6,resample=Math.min(1,maxSide/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
    const outW=Math.max(1,Math.round(width*resample)),outH=Math.max(1,Math.round(height*resample));
    const output=document.createElement('canvas');output.width=outW;output.height=outH;
    const ctx=output.getContext('2d',{alpha:false});ensure(ctx,'canvas not available');ctx.imageSmoothingQuality='high';
    const cols=Math.ceil(width/tileWidth),rows=Math.ceil(height/tileHeight);
    for(let index=0;index<offsets.length;index++){
      const x=(index%cols)*tileWidth,y=Math.floor(index/cols)*tileHeight,w=Math.min(tileWidth,width-x),h=Math.min(tileHeight,height-y);
      const off=offsets[index],size=sizes[index];ensure(size>0&&off+size<=bytes.length,'truncated image tile '+index);
      const packed=bytes.subarray(off,off+size);
      if(compression===7){
        const bitmap=await createImageBitmap(jpegBlob(packed,jpegTables));
        try{ctx.drawImage(bitmap,0,0,w,h,x*resample,y*resample,w*resample,h*resample);}finally{bitmap.close?.();}
      }else{
        const expected=tileWidth*Math.min(tileHeight,height-y)*samples;
        let raw=compression===1?packed:compression===5?lzwDecode(packed,expected):await inflated(packed);
        ensure(raw.length>=expected,'decoded tile smaller than expected');
        if(predictor===2){for(let row=0;row<Math.min(tileHeight,height-y);row++)for(let col=samples;col<tileWidth*samples;col++){
          const idx=row*tileWidth*samples+col;raw[idx]=(raw[idx]+raw[idx-samples])&255;
        }}else ensure(predictor===1,'unsupported TIFF predictor '+predictor);
        const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;const tctx=tmp.getContext('2d');
        const rgba=tctx.createImageData(w,h);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
          const src=(yy*tileWidth+xx)*samples,dst=(yy*w+xx)*4;
          rgba.data[dst]=raw[src];rgba.data[dst+1]=samples>=3?raw[src+1]:raw[src];rgba.data[dst+2]=samples>=3?raw[src+2]:raw[src];rgba.data[dst+3]=samples===4?raw[src+3]:255;
        }
        tctx.putImageData(rgba,0,0);ctx.drawImage(tmp,x*resample,y*resample,w*resample,h*resample);
      }
      if(index%12===0||index===offsets.length-1){update(Math.round((index+1)/offsets.length*100));await new Promise(resolve=>setTimeout(resolve,0));}
    }
    const jpeg=await new Promise((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(new Error('Could not encode map image')),'image/jpeg',.89));
    return {blob:jpeg,width:outW,height:outH,geo:{...parsed.geo,...(parsed.geo.a!=null?{a:parsed.geo.a/resample,b:parsed.geo.b/resample,c:parsed.geo.c/resample,d:parsed.geo.d/resample}:{dx:parsed.geo.dx/resample,dy:parsed.geo.dy/resample})},originalPixels:[width,height],sourceEPSG:parsed.geo.epsg};
  }
  scope.VerdantGeoTIFF={decode,parse,forward,inverse,geoToPixel,pixelToGeo};
})(typeof window==='undefined'?globalThis:window);
