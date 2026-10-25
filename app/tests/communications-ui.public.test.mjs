import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
test('React + Ant Design remain while Vite produces production HTML',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts['build:ui'],/vite build/);
 assert.ok(pkg.dependencies.react&&pkg.dependencies.antd);
 assert.ok(pkg.devDependencies.vite&&pkg.devDependencies['@vitejs/plugin-react']);
 const html=read('app/web/dist/index.html');
 assert.match(html,/type="module"/);
 assert.match(html,/\/assets\/index-[\w-]+\.js/);
 assert.match(html,/__ANTD_STYLE_NONCE__/);
});
test('communication page switches exclusive Ant Design Tabs instead of stacked tables',()=>{
 const ui=read('app/web/communications.jsx');
 assert.match(ui,/\bTabs\b/);
 assert.match(ui,/activeKey=\{activeTab\}/);
 assert.match(ui,/key:'candidates'/);
 assert.match(ui,/key:'today'/);
 assert.equal((ui.match(/<Card\b/g)||[]).length,1);
 assert.match(ui,/rowSelection=\{\{selectedRowKeys:selected/);
 assert.match(ui,/复制 AI 执行提示词/);
 assert.match(ui,/makeCommunicationAiPrompt/);
 assert.doesNotMatch(ui,/一键沟通|openGreetPlaceholders|\/api\/communications\/batch/);
});
