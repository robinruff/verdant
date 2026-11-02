// Preserve full notices for runtime dependencies, vendored Vue and Vite's
// generated runtime helpers. Fail the build if a package lacks license text.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(root,process.env.VERDANT_OUT_DIR||'dist');
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
const sections=['Verdant third-party notices\nGenerated from the committed lockfile. Dependency licenses remain their own.'];
for(const [directory,entry] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
  if(!directory||(entry.dev&&directory!=='node_modules/vite'))continue;
  const folder=join(root,directory);
  const pkg=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));
  const names=(await readdir(folder)).filter(n=>/^(licen[sc]e|copying|notice)(\.|$|-)/i.test(n)).sort();
  let texts=await Promise.all(names.map(async n=>n+'\n'+await readFile(join(folder,n),'utf8')));
  if(!texts.length&&pkg.name==='murmurhash-js'){
    const readme=await readFile(join(folder,'README.md'),'utf8');
    const at=readme.indexOf('## License (MIT)');
    if(at>=0)texts=[readme.slice(at)];
  }
  if(!texts.length)throw new Error('Missing license text for '+pkg.name);
  sections.push(`${pkg.name} ${pkg.version} — ${pkg.license}\n\n${texts.join('\n\n')}`);
}
sections.push('Vue 3.5.13 (vendored) — MIT\n\n'+await readFile(join(root,'public/vendor/VUE-LICENSE.txt'),'utf8'));
const notices=sections.join('\n\n'+'='.repeat(78)+'\n\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n';
await writeFile(join(out,'THIRD_PARTY_LICENSES.txt'),notices);
// Keep notices alongside source as well as in deployable builds.
await writeFile(join(root,'THIRD_PARTY_LICENSES.txt'),notices);
await writeFile(join(out,'LICENSE'),await readFile(join(root,'LICENSE')));
