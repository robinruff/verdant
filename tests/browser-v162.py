from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
fixture=(root/'tests/fixtures/browser-fixture.js').read_text()
fixture+='''
window.__mapMade=0;window.__mapRemoved=0;
const OldMap=window.maplibregl.Map;
window.maplibregl.Map=class extends OldMap {constructor(...args){super(...args);window.__mapMade++;}remove(){window.__mapRemoved++;}getPitch(){return 0;}jumpTo(opts){window.__lastRestoredCamera=opts;}};
// Tiny in-memory OPFS double; real engine still writes and verifies a ZIP byte-for-byte.
window.__opfs=new Map(); const __store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__store.get(k)||null,setItem:(k,v)=>__store.set(k,String(v)),removeItem:k=>__store.delete(k)}});
window.__diskWriter=async(handle,filename)=>{
 const chunks=[];return {write:async bytes=>chunks.push(new Uint8Array(bytes)),close:async()=>{const blob=new Blob(chunks,{type:'application/zip'});window.__opfs.set(filename,blob);},abort:async()=>{window.__opfs.delete(filename)}};
};
Object.defineProperty(navigator,'storage',{configurable:true,value:{getDirectory:async()=>({getFileHandle:async (name,options)=>{if(options?.create && !window.__opfs.has(name))window.__opfs.set(name,new Blob([]));return {getFile:async()=>{const blob=window.__opfs.get(name);if(!blob)throw Error('No staged ZIP');return blob;}};},removeEntry:async name=>window.__opfs.delete(name)})}});
window.__data.images.push({id:'photo-1',blob:new Blob([new Uint8Array([1,2,3,4])],{type:'image/png'}),mimeType:'image/png',name:'small.png'});
window.__data.plants[0].statuses=[{id:'journal-1',timestamp:'2026-10-01T00:00:00Z',imageIds:['photo-1']}];
// Enhance test DB transactions to allow multi-store atomic restore.
const initialTransaction=window.__db.transaction;
window.__db.transaction=function(names,mode){const tx=initialTransaction.call(this,names,mode);const originalStore=tx.objectStore;tx.objectStore=(name)=>{
 const store=originalStore(name);const arr=window.__data[name];store.count=()=>req(arr.length);
 store.clear=()=>{arr.length=0;setTimeout(()=>tx.oncomplete?.(),0);};
 return store;
 };return tx;};
'''
html=(root/'index.html').read_text().split('  <script src="./vendor/vue.global.prod.js">')[0]+'</body></html>'
manager=(root/'src/settings/manager.js').read_text().replace('export async function mountManagement','async function mountManagement').replace("await import('./backup-tool.js')","await Promise.resolve({mountBackup:window.__mountBackup})").replace("await import('./photo-tool.js')","await Promise.resolve({mountPhotoOptimizer:window.__mountPhotoOptimizer})").replace('onRestore:()=>window.location.reload()','onRestore:()=>{window.__restored=true}')
backup=(root/'src/settings/backup-tool.js').read_text().replace("import {diskWriter} from './disk-writer.js';",'const diskWriter=window.__diskWriter;').replace('export function mountBackup','function mountBackup')
photo=(root/'src/settings/photo-tool.js').read_text().replace('export function mountPhotoOptimizer','function mountPhotoOptimizer')
vue=(root/'src/vue-shell.js').read_text().replace('export function mountGarden','function mountGarden').replace("await import('./settings/manager.js')",'await Promise.resolve({mountManagement:window.__mountManagement})')+'\nmountGarden();'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 pg=b.new_page(viewport={'width':430,'height':900},accept_downloads=True)
 errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.set_content(html)
 pg.add_style_tag(content=(root/'styles.css').read_text())
 pg.add_script_tag(content=fixture)
 for name in ['public/vendor/vue.global.prod.js','public/taxonomy.js','public/garden-title.js','public/localized-names.js','public/photo-optimizer.js','public/zip-backup.js']:
  pg.add_script_tag(content=(root/name).read_text())
 pg.add_script_tag(content=backup+'\n'+photo+'\n'+manager+'\nwindow.__mountBackup=mountBackup;window.__mountPhotoOptimizer=mountPhotoOptimizer;window.__mountManagement=mountManagement;')
 pg.add_script_tag(content=vue)
 pg.add_script_tag(content=(root/'app.js').read_text())
 try: pg.wait_for_function('window.VerdantUI?.plantCount===6',timeout=3000)
 except Exception:
  print('DEBUG:',errors,'rendered',pg.locator('body').inner_text()[-850:],'ui',pg.evaluate('window.VerdantUI?.plantCount'))
  raise
 if pg.locator('#modalRoot .modal-close').count():pg.locator('#modalRoot .modal-close').click()
 pg.locator('[data-tab=map]').click()
 made=pg.evaluate('window.__mapMade');assert made>=1,made
 pg.locator('[data-tab=plants]').click();pg.locator('[data-tab=types]').click();pg.locator('[data-tab=map]').click();assert pg.evaluate('window.__mapMade')==made,'Map must stay alive between garden tabs'
 pg.locator('[data-tab=settings]').click()
 assert pg.locator('#page-map').count()==0 and pg.locator('#plantList').count()==0
 assert pg.evaluate('window.__mapRemoved')>=1
 # Save title while the map DOM is absent: must not access removed nodes.
 pg.locator('#gardenTitleInput').fill('Sunset Orchard');pg.locator('#gardenTitleForm button').click()
 pg.wait_for_function("document.querySelector('.garden-display-title')?.textContent==='Sunset Orchard'")
 pg.locator('#page-settings [data-action=export]').click()
 pg.wait_for_timeout(600)
 
 pg.wait_for_selector('#settingsManagementRoot #create',timeout=3000)
 pg.locator('#settingsManagementRoot #create').click()
 pg.wait_for_timeout(800)
 
 pg.wait_for_function("document.querySelector('#settingsManagementRoot #download')?.disabled===false",timeout=3000)
 print('backup status',pg.locator('#settingsManagementRoot #message').inner_text()[:170]);
 zipbytes=pg.evaluate('async()=>{const key=localStorage.getItem("verdant-staged-zip");const b=window.__opfs.get(key);return (await b.arrayBuffer()).byteLength}')
 assert zipbytes>400
 roundtrip=pg.evaluate('async()=>{const key=localStorage.getItem("verdant-staged-zip");const parsed=await VerdantZip.parseVerdantZip(window.__opfs.get(key));return {plants:parsed.data.plants.length,photos:parsed.data.images.length,title:parsed.data.settings.find(s=>s.id==="gardenTitle")?.value};}')
 print('backup roundtrip',roundtrip)
 assert roundtrip['plants']==6 and roundtrip['photos']==1 and roundtrip['title']=='Sunset Orchard'
 pg.locator('.management-back').click();pg.wait_for_timeout(200);
 pg.locator('#page-settings [data-action=optimize-photos]').click();pg.wait_for_selector('#settingsManagementRoot #start')
 pg.wait_for_timeout(150)
 print('photo counts',pg.locator('#settingsManagementRoot #counts').inner_text())
 pg.locator('.management-back').click()
 pg.locator('[data-tab=map]').click();pg.wait_for_timeout(450)
 assert pg.locator('#mapCanvas').count()==1
 assert pg.evaluate('window.__mapMade')==made+1
 assert pg.locator('#page-map').is_visible() and not pg.locator('#page-plants').is_visible(), 'map visible, other tabs hidden'
 pg.locator('[data-tab=plants]').click();assert pg.locator('.plant-card').count()==5
 pg.locator('[data-tab=settings]').click();pg.locator('#page-settings [data-action=import]').click();pg.wait_for_selector('#settingsManagementRoot #restoreFile')
 # Import the newly created ZIP into the isolated, in-memory test database.
 pg.on('dialog', lambda dialog: dialog.accept())
 raw=bytes(pg.evaluate('async()=>Array.from(new Uint8Array(await window.__opfs.get(localStorage.getItem("verdant-staged-zip")).arrayBuffer()))'))
 pg.evaluate('window.__data.plants.length=0;window.__data.images.length=0;')
 pg.locator('#settingsManagementRoot #restoreFile').set_input_files({'name':'test-garden.zip','mimeType':'application/zip','buffer':raw})
 pg.locator('#settingsManagementRoot #restore').click()
 pg.wait_for_function('window.__restored===true',timeout=10000)
 assert pg.evaluate('window.__data.plants.length')==6
 assert pg.evaluate('window.__data.images.length')==1
 assert pg.evaluate('window.__data.settings.find(x=>x.id==="gardenTitle")?.value')=='Sunset Orchard'
 print('browser checks',{'maps_created':pg.evaluate('window.__mapMade'),'removed':pg.evaluate('window.__mapRemoved'),'errors':errors})
 assert not errors,errors
 print('PASS v1.6.2: garden tabs shared map, Settings releases map/photos, title editing, live backup ZIP create & verify, photo tool mount, map recreation')
 b.close()
