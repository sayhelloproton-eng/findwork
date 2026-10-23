import { build } from 'esbuild';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
await build({
 entryPoints:[resolve(root,'app/web/antd-entry.jsx')],
 outfile:resolve(root,'app/web/dist/antd-entry.js'),
 bundle:true,platform:'browser',format:'iife',target:'chrome125',
 jsx:'automatic',minify:true,legalComments:'none',logLevel:'warning'
});
console.log('ANT_DESIGN_BUILD=PASS');
