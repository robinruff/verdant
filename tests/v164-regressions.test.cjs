const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const appSource=['public/taxonomy.js','public/garden-title.js','public/localized-names.js','app.js']
  .map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n').replace(/init\(\);\s*$/,'');
const files=new Map([
  ['verdant-stage-2026-11-01.zip',{kind:'file'}],
  ['verdant-stage-old.zip',{kind:'file'}],
  ['someone-elses.zip',{kind:'file'}],
  ['verdant-stage-not-a-zip.txt',{kind:'file'}],
  ['verdant-stage-folder.zip',{kind:'directory'}],
]);
const values=new Map([['verdant-staged-zip','verdant-stage-2026-11-01.zip']]);
const ctx=vm.createContext({
  console,Blob,URL,Date,Math,window:{},document:{querySelector(){return null;}},
  navigator:{storage:{getDirectory:async()=>({
    async *entries(){for(const item of files.entries())yield item;},
    async removeEntry(name){files.delete(name);}
  })}},
  localStorage:{getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key)}
});
vm.runInContext(appSource,ctx);
(async()=>{
  assert.equal(vm.runInContext('typeof clearStagedZips',ctx),'function');
  await vm.runInContext('clearStagedZips(false)',ctx);
  assert(!files.has('verdant-stage-old.zip'));
  assert(!files.has('verdant-stage-2026-11-01.zip'));
  assert(files.has('someone-elses.zip'));
  assert(files.has('verdant-stage-not-a-zip.txt'));
  assert(files.has('verdant-stage-folder.zip'));
  assert(!values.has('verdant-staged-zip'));
  // No directory API is another supported, non-destructive path on reset.
  values.set('verdant-staged-zip','verdant-stage-another.zip');
  ctx.navigator.storage={};
  await vm.runInContext('clearStagedZips(false)',ctx);
  assert(!values.has('verdant-staged-zip'));
  assert.equal(vm.runInContext('BACKUP_SCHEMA',ctx),2);
  assert.equal(vm.runInContext('SHELL_CACHE',ctx),'verdant-shell-v1.6.5-offline-security1');
  assert.match(fs.readFileSync(path.join(root,'src/settings/backup-tool.js'),'utf8'),/VerdantPhotos\.settings\(/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'src/settings/backup-tool.js'),'utf8'),/VerdantPhotos\.backupSettings\(/);
  assert.doesNotMatch(appSource,/VerdantPhotos\.backupSettings\(/);
  console.log('PASS: clearStagedZips works and preserves unrelated files; no reliance on backupSettings');
})().catch(e=>{console.error(e);process.exitCode=1;});
