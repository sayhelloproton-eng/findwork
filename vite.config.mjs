import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
const web=resolve(import.meta.dirname,'app/web');
export default defineConfig({
 root:web,base:'/',plugins:[react()],publicDir:false,
 build:{outDir:resolve(web,'dist'),emptyOutDir:true,target:'chrome125',assetsDir:'assets',
  rollupOptions:{input:resolve(web,'index.html')}}
});
