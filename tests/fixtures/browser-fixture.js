

window.__data={
 plantTypes:[
 {id:'olive',nameEn:'Olive',nameEs:'Olivo',scientificName:'Olea europaea',color:'#427954',links:['https://example.com/olive']},
 {id:'privet',nameEn:'Privet',scientificName:'Ligustrum lucidum',family:'Oleaceae',genus:'Ligustrum',species:'lucidum'},
 {id:'ash',nameEn:'Ash',scientificName:'Fraxinus excelsior',family:'Oleaceae'},
 {id:'oak',nameEn:'Oak',nameEs:'Roble',scientificName:'Quercus robur',family:'Fagaceae'},
 {id:'mystery',nameEn:'Unknown cultivar',scientificName:'Rosa × damascena'}],
 plants:[
 {id:'plant1',plantTypeId:'olive',geometry:{type:'Point',coordinates:[-5.3,36.6]},statuses:[]},
 {id:'plant2',plantTypeId:'privet',geometry:{type:'Point',coordinates:[-5.3,36.6]},statuses:[]},
 {id:'plant3',plantTypeId:'ash',geometry:{type:'Point',coordinates:[-5.3,36.6]},statuses:[]},
 {id:'plant4',plantTypeId:'oak',geometry:{type:'Point',coordinates:[-5.3,36.6]},statuses:[{id:'s1',timestamp:'2026-10-11T00:00:00Z',removed:true}]},
 {id:'plant5',plantTypeId:'mystery',geometry:{type:'Point',coordinates:[-5.3,36.6]},statuses:[]},
 {id:'plant6',plantTypeId:null,geometry:{type:'Point',coordinates:[-5.3,36.6]},statuses:[]}],
 images:[],settings:[]};
function req(result){const r={result};setTimeout(()=>r.onsuccess?.(),0);return r;}
window.__db={objectStoreNames:{contains:()=>true},transaction(storeName,mode){
 const tx={oncomplete:null,onerror:null,onabort:null,objectStore(name){
  name=name||storeName;
  const arr=window.__data[name];
  return {getAll:()=>req([...arr]),getAllKeys:()=>req(arr.map(x=>x.id)),get:id=>req(arr.find(x=>x.id===id)),
    put(record){let at=arr.findIndex(x=>x.id===record.id);if(at<0)arr.push(record);else arr[at]=record;setTimeout(()=>tx.oncomplete?.(),0);return {};},
    delete(id){window.__data[name]=arr.filter(x=>x.id!==id);setTimeout(()=>tx.oncomplete?.(),0);return {};},
    openCursor(){
      const r={result:null};let index=0;
      const advance=()=>{if(index>=arr.length){r.result=null;setTimeout(()=>{r.onsuccess?.();setTimeout(()=>tx.oncomplete?.(),0)},0);return;}
        const record=arr[index++];r.result={value:record,update:newValue=>{const at=arr.findIndex(x=>x.id===record.id);arr[at]=newValue;return {};},continue:advance};setTimeout(()=>r.onsuccess?.(),0)};
      setTimeout(advance,0);return r;
    }
  }}};return tx;
 }};
Object.defineProperty(window,'indexedDB',{value:{open(){return req(window.__db)}},configurable:true});
window.maplibregl={Map:class{constructor(){this.handlers={};this.sources={};this.layers={};setTimeout(()=>this.emit('load'),0)}
 on(ev,fn){(this.handlers[ev]??=[]).push(fn)}emit(ev){for(const fn of this.handlers[ev]||[])fn({})}
 getLayer(k){return this.layers[k]}getSource(k){return this.sources[k]}addSource(k,o){this.sources[k]={...o,setData(data){this.data=data}}}
 addLayer(o){this.layers[o.id]=o} removeSource(k){delete this.sources[k]} removeLayer(k){delete this.layers[k]}
 getCenter(){return {lat:36.6,lng:-5.3}}getZoom(){return 18}getBearing(){return 0}getCanvas(){return {style:{}}}fitBounds(){}easeTo(){}resize(){}queryRenderedFeatures(){return []}
 }};
