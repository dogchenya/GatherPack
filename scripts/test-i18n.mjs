import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

await mkdir('artifacts/validation', {recursive:true});
const target=resolve('artifacts/validation/i18n-under-test.mjs');
await writeFile(target,ts.transpileModule(await readFile('src/i18n.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText);
const {catalog,translate}=await import(pathToFileURL(target).href);
const missing=[];
for(const file of ['src/main.tsx','src/FileGraph.tsx','src/ArchiveTree.tsx','src/Modal.tsx']){
 const tree=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(tree)==='t'){
   const arg=node.arguments[0];
   let key;
   if(ts.isStringLiteral(arg))key=arg.text.trim();
   if(ts.isTemplateExpression(arg))key=arg.head.text+arg.templateSpans.map((s,i)=>'{'+i+'}'+s.literal.text).join('');
   if(key&&/\p{Script=Han}/u.test(key)&&key!=='简体中文'&&!catalog.has(key))missing.push({file,key});
  }
  ts.forEachChild(node,visit);
 }visit(tree);
}
assert.deepEqual(missing,[],'Every translated UI source key needs an English entry');
assert.equal(translate('保存设置','zh-CN'),'保存设置');
assert.equal(translate('保存设置','en'),'Save settings');
assert.equal(translate('1 个文件 · 1 KB','en'),'1 file · 1 KB');
assert.equal(translate('不可用：/home/文件夹/失败.txt','en'),'Unavailable: /home/文件夹/失败.txt');
assert.equal(translate('Error: 输出扩展名与压缩格式不一致','en'),'Error: The output extension does not match the archive format');
assert.equal(translate('新增 1 项，重复 0 项，未加入 0 项\n','en'),'Added 1, duplicates 0, rejected 0\n');
assert.match(translate('准备失败：不能覆盖源文件','en'),/Preparation failed: Source files cannot be overwritten/);
console.log('Language catalog coverage, persisted diagnostic templates, nested errors and path preservation passed.');
