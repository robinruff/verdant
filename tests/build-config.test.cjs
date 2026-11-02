const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
test('public editor URL is validated and applied to exported print sources',async()=>{
  const {editorURL,configurePrint,DEFAULT_EDITOR_URL}=await import('../scripts/configure-print.mjs');
  assert.equal(editorURL(),DEFAULT_EDITOR_URL);
  for(const url of ['javascript:alert(1)','https://user:pass@example.org/','https://example.org/?key=secret','https://example.org/#fragment']){
    assert.throws(()=>editorURL(url));
  }
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'verdant-print-'));
  try{
    for(const name of ['printout.typ','README.md'])await fs.copyFile(path.join(__dirname,'../public/print',name),path.join(dir,name));
    const custom='https://garden.example.org/app/';
    await configurePrint(dir,custom);
    const typst=await fs.readFile(path.join(dir,'printout.typ'),'utf8');
    const readme=await fs.readFile(path.join(dir,'README.md'),'utf8');
    assert(typst.includes('#let editor-url = "'+custom+'"'));
    assert(readme.includes('**Editor:** '+custom));
    assert(!typst.includes(DEFAULT_EDITOR_URL));
    assert(!readme.includes(DEFAULT_EDITOR_URL));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
