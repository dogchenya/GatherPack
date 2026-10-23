import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

await mkdir('artifacts/validation', {recursive: true});
const module = resolve('artifacts/validation/file-graph-under-test.mjs');
await writeFile(module, ts.transpileModule(await readFile('src/graphModel.ts', 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText);
const {buildGraph} = await import(pathToFileURL(module).href);
const entries = [
  {source: '/work/项目/照片/星空.png', destination: '项目/照片/星空.png', directory: false, size: 1200},
  {source: '/work/项目/说明.txt', destination: '项目/说明.txt', directory: false, size: 30},
  {source: '/work/项目', destination: '项目', directory: true, size: 0},
  {source: '/work/项目/照片', destination: '项目/照片', directory: true, size: 0},
  {source: '/other/说明.txt', destination: '说明 (2).txt', directory: false, size: 9},
  {source: '/work/空目录', destination: '空目录', directory: true, size: 0},
];
const issues = [{source: '/missing/丢失.txt', message: '文件不存在', blocking: true}, {source: '/duplicate', message: '已去重', blocking: false}];
entries.forEach(Object.freeze); issues.forEach(Object.freeze); Object.freeze(entries); Object.freeze(issues);
const plan = Object.freeze({entries, issues});
const before = JSON.stringify(plan), result = buildGraph(plan);
assert.equal(JSON.stringify(plan), before, 'the graph must never modify the pack plan');
assert.equal(result.root.bytes, 1239, 'all readable bytes aggregate even for child-first plans');
const project = result.root.children.find(node => node.name === '项目');
assert.equal(project.bytes, 1230); assert.equal(project.source, '/work/项目');
assert.equal(project.children.find(node => node.name === '照片').children[0].source, '/work/项目/照片/星空.png');
assert.equal(result.root.children.find(node => node.name === '说明 (2).txt').source, '/other/说明.txt', 'renamed destinations retain the original source');
assert.equal(result.root.children.find(node => node.name === '空目录').children.length, 0, 'empty folders remain visible');
assert.equal(result.root.children.find(node => node.id === 'issues').children.length, 1, 'blocking items are separate from pack contents');
assert.equal(result.count, 8); assert.equal(buildGraph({entries: [], issues: []}).count, 0);
console.log('Graph model passed: nested/child-first plans, Unicode, source/destination distinction, size aggregation, empty folders, problems and read-only isolation.');
