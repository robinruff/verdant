const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
  const html=fs.readFileSync(__dirname+'/../index.html','utf8');
  assert.match(html,/id="settingsBackupCard"/);
  assert.match(html,/id="restoreFile"[^>]*hidden/);
  assert(!/id="counts"|id="inspect"|data-action="export"/.test(html),'backup counts and intermediary navigation removed');
  assert(!fs.readFileSync(__dirname+'/../src/settings/manager.js','utf8').includes('backupHTML'));
  let onTab,loads=0,mounts=0,cleanups=0,resolveModule;
  const page={},card={scrollIntoView(){}};
  const window={Vue:{
    defineComponent:c=>c,reactive:o=>o,ref:()=>({}),computed:fn=>fn,
    watch:(source,callback)=>{onTab=callback},
    createApp:options=>({mount(){options.setup()}}),
    nextTick:async()=>{}
  },location:{reload(){}},loadBackup:()=>{loads++;return new Promise(resolve=>{resolveModule=resolve})}};
  const document={getElementById:id=>id==='page-settings'?page:id==='settingsBackupCard'?card:null};
  const source=fs.readFileSync(__dirname+'/../src/vue-shell.js','utf8')
    .replace("import {createTaskModal} from './settings/task-modal.js';",'')
    .replace('export function mountGarden','function mountGarden')
    .replace("await import('./settings/backup-tool.js')",'await window.loadBackup()');
  const context=vm.createContext({window,document});
  vm.runInContext(source+'\nmountGarden();',context);
  assert.equal(loads,0,'backup engine not loaded with garden');
  const ui=window.VerdantUI;
  const module={mountBackup:root=>{assert.equal(root,page);mounts++;return ()=>{cleanups++}}};
  ui.tab='settings';const stale=onTab('settings');
  ui.tab='map';await onTab('map');resolveModule(module);await stale;
  assert.equal(mounts,0,'late imports do not bind controls after leaving Settings');
  ui.tab='settings';const pending=onTab('settings');resolveModule(module);await pending;
  assert.equal(mounts,1);
  await ui.openManagement('backup');
  assert.equal(ui.managementTool,null,'backup card does not open a subpage');
  ui.tab='map';await onTab('map');assert.equal(cleanups,1);
  ui.tab='settings';const again=onTab('settings');resolveModule(module);await again;
  assert.equal(mounts,2,'returning to Settings rebinds controls');
  console.log('PASS: inline backup controls, lazy mounting, navigation cleanup, stale import protection');
})().catch(err=>{console.error(err);process.exitCode=1});
