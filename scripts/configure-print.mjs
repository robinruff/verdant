import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const DEFAULT_EDITOR_URL='https://example.org/verdant/';
export function editorURL(value=DEFAULT_EDITOR_URL){
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash){
    throw new Error('VERDANT_EDITOR_URL must be an HTTP(S) URL without credentials, query, or fragment');
  }
  // Keep the value safe in both a Typst string and Markdown text.
  return url.href.replace(/["\\<>`]/g,c=>encodeURIComponent(c));
}
export async function configurePrint(directory,value){
  const url=editorURL(value);
  for(const name of ['printout.typ','README.md']){
    const path=resolve(directory,name);
    const source=await readFile(path,'utf8');
    await writeFile(path,source.replaceAll(DEFAULT_EDITOR_URL,url));
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await configurePrint(resolve(new URL('../',import.meta.url).pathname,process.env.VERDANT_OUT_DIR||'dist','print'),process.env.VERDANT_EDITOR_URL);
}
