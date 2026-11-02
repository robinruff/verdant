import {defineConfig} from 'vite';
import {readFile} from 'node:fs/promises';
import {DEFAULT_EDITOR_URL,editorURL} from './scripts/configure-print.mjs';
export default defineConfig({
  base:'./',
  plugins:[{
    name:'verdant-dev-print-url',
    configureServer(server){
      const url=editorURL(process.env.VERDANT_EDITOR_URL);
      server.middlewares.use(async(req,res,next)=>{
        const name=req.url?.split('?')[0];
        if(!['/print/README.md','/print/printout.typ'].includes(name))return next();
        try{
          const text=await readFile(new URL('./public'+name,import.meta.url),'utf8');
          res.setHeader('Content-Type','text/plain; charset=utf-8');
          res.setHeader('Cache-Control','no-store');
          res.end(text.replaceAll(DEFAULT_EDITOR_URL,url));
        }catch(error){next(error);}
      });
    },
  }],
  publicDir:'public',
  build:{target:'es2022',outDir:process.env.VERDANT_OUT_DIR||'dist',emptyOutDir:true,rollupOptions:{input:'index.html'}},
});
