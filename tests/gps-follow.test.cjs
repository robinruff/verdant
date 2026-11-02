'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const gps=source.slice(source.indexOf('function updateLocationControls(){'),source.indexOf('function typeReference(type){'));
assert.ok(gps.startsWith('function updateLocationControls()'));

function harness(){
  const nodes=new Map();
  const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',title:'',attrs:{},classList:{toggle(name,on){this[name]=on;}},setAttribute(name,val){this.attrs[name]=val;}});return nodes.get(id);};
  let watchCallbacks,positionCallbacks,watchCleared=[],timers=new Map(),nextTimer=0;
  const geolocation={
    watchPosition(success,error,opts){watchCallbacks={success,error,opts};return 42;},
    clearWatch(id){watchCleared.push(id);},
    getCurrentPosition(success,error,opts){positionCallbacks={success,error,opts};}
  };
  const camera=[],geojson=[];
  let center={lat:0,lng:0};
  const map={
    easeTo(opts){camera.push(opts);center={lat:opts.center[1],lng:opts.center[0]};},
    getCenter(){return center;},
    getSource(){return {setData(data){geojson.push(data);}};}
  };
  const state={locationWatch:null,locationFix:null,locationFollow:false,locationSession:0,
    locationLastTimestamp:0,locationLastReceived:0,locationPollTimer:null,locationPollPending:false,
    locationOutsideMap:false,locationLastErrorTime:0,mode:null,tab:'map',glMap:map,glStyleReady:true};
  const toasts=[];
  const context={state,document:{hidden:false},navigator:{geolocation},$,
    EARTH_M_PER_DEG:111194.92664455874,Date,Math,
    isValidGeo:(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180,
    geoToPixel:(lat,lon)=>({x:lon,y:lat}),pointOnImage:p=>p!=null&&p.x>0&&p.x<50&&p.y>0&&p.y<50,
    toast:(msg)=>toasts.push(msg),clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
    featureCollection:features=>({type:'FeatureCollection',features}),
    pointGeometry:(lat,lon)=>({type:'Point',coordinates:[lon,lat]}),
    setInterval:(cb,interval)=>{const id=++nextTimer;timers.set(id,{cb,interval});return id;},
    clearInterval:id=>timers.delete(id),
    // Realistic test uses different timestamps, avoiding browser clock dependencies.
  };
  vm.createContext(context);vm.runInContext(gps,context);
  return {ctx:context,state,camera,geojson,geolocation,toasts,
    nodes,watchCleared,timers,
    get callbacks(){return watchCallbacks;},get pending(){return positionCallbacks;},
    pos(lat,lon,stamp,accuracy=5){return {coords:{latitude:lat,longitude:lon,accuracy},timestamp:stamp};}};
}

{
  const h=harness();
  h.ctx.toggleLocation();
  assert.equal(h.state.locationFollow,true);
  assert.equal(h.state.locationWatch,42);
  assert.equal(h.callbacks.opts.enableHighAccuracy,true);
  assert.equal(h.callbacks.opts.maximumAge,0);
  assert.equal(h.nodes.get('#locationButton').attrs['aria-pressed'],'true');
  assert.equal(h.nodes.get('#followLocationButton').classList.hidden,true);
  h.callbacks.success(h.pos(5,5,100));
  assert.equal(h.camera.length,1,'first fix follows');
  assert.deepEqual(Array.from(h.camera.at(-1).center),[5,5]);
  assert.equal(h.nodes.get('#followLocationButton').classList.hidden,false);
  assert.equal(h.geojson.at(-1).features.length,2,'point and accuracy circle rendered');
  h.callbacks.success(h.pos(5.0001,5.0001,101));
  assert.equal(h.camera.length,2,'second fix recenters again, unlike v1.5.0');

  h.ctx.pauseLocationFollow();
  assert.equal(h.state.locationFollow,false);
  h.callbacks.success(h.pos(5.0002,5.0002,102));
  assert.equal(h.camera.length,2,'manual pan pauses camera following');
  assert.equal(h.geojson.length,3,'GPS dot still updates when following paused');
  assert.equal(h.nodes.get('#followLocationButton').textContent,'↗ Follow');

  h.ctx.resumeLocationFollow();
  assert.equal(h.state.locationFollow,true);
  assert.equal(h.camera.length,3,'Follow immediately recenters on last fix');
  assert.equal(h.camera.at(-1).duration,0);
  h.callbacks.success(h.pos(5.0003,5.0003,103));
  assert.equal(h.camera.length,4,'later fixes are followed');
  h.callbacks.success(h.pos(10,10,102));
  assert.equal(h.camera.length,4,'older out-of-order GPS callback ignored');
  h.callbacks.error({code:3,message:'GPS timed out'});
  assert.equal(h.state.locationWatch,42,'GPS timeout does not cancel watcher');
  h.ctx.refreshLocation(h.state.locationSession);
  assert.equal(h.pending.opts.maximumAge,0);
  assert.equal(h.state.locationPollPending,true);
  h.pending.success(h.pos(5.0004,5.0004,104));
  assert.equal(h.state.locationPollPending,false);

  const stale=h.callbacks.success;
  h.ctx.toggleLocation();
  assert.equal(h.state.locationWatch,null);
  assert.equal(h.state.locationFix,null);
  assert.equal(h.timers.size,0,'polling cleaned up');
  assert.deepEqual(h.watchCleared,[42]);
  assert.equal(h.geojson.at(-1).features.length,0,'GPS overlay removed on stop');
  stale(h.pos(12,12,105));
  assert.equal(h.state.locationFix,null,'late callbacks after stop ignored');
}
{
  const h=harness();h.ctx.toggleLocation();
  h.callbacks.error({code:1,message:'User denied permission'});
  assert.equal(h.state.locationWatch,null,'permission denial cancels tracking');
  assert.deepEqual(h.watchCleared,[42]);
}
{
  const h=harness();h.ctx.toggleLocation();
  h.callbacks.success(h.pos(80,80,100));
  assert.equal(h.camera.length,0,'outside-image fixes do not jump to blank map');
  assert.equal(h.state.locationOutsideMap,true);
  h.callbacks.success(h.pos(4,4,101));
  assert.equal(h.camera.length,1,'following automatically resumes on returning inside garden');
}
assert.match(source,/document\.addEventListener\('visibilitychange'/);
assert.match(source,/map\.on\('dragstart',\(\)=>pauseLocationFollow\(\)\)/);
assert.match(source,/const DB_NAME = 'verdant-garden-v2'/);
assert.match(source,/const DB_VERSION = 1/);
assert.match(source,/const BACKUP_SCHEMA = 2/);
console.log('PASS: GPS follow/pan/resume, repeated updates, stale fixes, timeouts, permission, foreground refresh, stop cleanup');
