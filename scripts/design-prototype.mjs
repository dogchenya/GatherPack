import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const source=resolve('prototypes/gatherpack-v2'), output=resolve('artifacts/design/gatherpack-v2');
await mkdir(output,{recursive:true});
let html=await readFile(join(source,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="app.css">','<style>'+await readFile(join(source,'app.css'),'utf8')+'</style>');
html=html.replace('<script src="app.js"></script>','<script>'+await readFile(join(source,'app.js'),'utf8')+'</script>');
await writeFile(join(output,'GatherPack-prototype.html'),html);
await writeFile(join(output,'review.html'),await readFile(join(source,'review-template.html')));
await writeFile(join(output,'Design-notes.md'),await readFile(join(source,'README.md')));
const server=createServer(async(req,res)=>{
 const file=resolve(output,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(output+'/')&&!file.startsWith(output+'\\')){res.writeHead(403).end();return;}
 try{const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.png':'image/png','.mp4':'video/mp4','.webm':'video/webm'})[extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port+'/GatherPack-prototype.html';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??(process.platform==='win32'?'msedge':undefined),headless:true});
const checks=[], errors=[];
const check=(name,value)=>{assert.ok(value,name);checks.push({name,passed:true});};
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const state=page=>page.evaluate(()=>window.prototypeDemo.getState());
async function select(page,ids){await page.keyboard.down('Control');for(const id of ids)await page.locator('[data-source="'+id+'"]').click();await page.keyboard.up('Control');}
async function move(page,x,y,steps=18,delay=16){const old=page.__mouse??{x:40,y:40};for(let i=1;i<=steps;i++){await page.mouse.move(old.x+(x-old.x)*i/steps,old.y+(y-old.y)*i/steps);if(delay)await pause(delay);}page.__mouse={x,y};}
async function click(page,selector,wait=180){const box=await page.locator(selector).first().boundingBox();assert.ok(box,selector);await move(page,box.x+box.width/2,box.y+box.height/2,14,16);await page.locator(selector).first().click();await pause(wait);}
async function drag(page,selector,dx,dy){const b=await page.locator(selector).boundingBox();const x=b.x+Math.min(90,b.width/2),y=b.y+b.height/2;await move(page,x,y);await page.mouse.down();await move(page,x+dx,y+dy,20,16);await page.mouse.up();await pause(240);}
async function screenshot(page,name){await pause(250);await page.screenshot({path:join(output,name),fullPage:!name.includes('mobile')});}
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(url);check('starts with a compact shelf and no collected files',(await state(page)).items.length===0);
 await screenshot(page,'01-compact.png');
 await select(page,['brief','assets','budget']);await page.locator('[data-source="brief"]').dragTo(page.locator('#orb'));
 check('real HTML drag/drop collects multiple selected source items',(await state(page)).items.length===3);
 check('drop opens the lightweight collection panel',(await state(page)).expanded);
 await screenshot(page,'02-collection.png');
 const before=await page.locator('#shelf').boundingBox();await drag(page,'#shelfHandle',-70,25);const after=await page.locator('#shelf').boundingBox();
 check('broad header moves the panel',after.x<before.x-50);
 await page.locator('#collapse').click();await drag(page,'#orb',-100,125);
 check('moving the whole compact icon does not expand it',!(await state(page)).expanded);
 await page.locator('#orb').click();check('click still opens after dragging',(await state(page)).expanded);
 await page.locator('#collectSelected').click();check('duplicate references are not added',(await state(page)).items.length===3);
 await page.locator('[data-folder="downloads"]').click();await select(page,['brief2','spec']);await page.keyboard.press('Control+Alt+Shift+E');
 check('browser shortcut collects from a second source folder',(await state(page)).items.length===5);
 await page.locator('#graphView').click();await pause(350);
 check('graph displays final automatic collision numbering',(await page.locator('#graphCanvas').innerText()).includes('项目说明 (2).pdf'));
 await page.locator('[data-node="assets"]').click();check('folder branches collapse in the read-only graph',await page.locator('[data-node="palette"]').count()===0);
 await page.locator('[data-node="assets"]').click();await page.locator('[data-node="palette"]').click();
 check('selected graph node exposes its full source path',(await page.locator('#graphDetail').innerText()).includes('设计素材/配色.svg'));
 const zoomBefore=await page.locator('#zoomLevel').innerText();await page.locator('#zoomIn').click();
 check('graph zoom buttons work',await page.locator('#zoomLevel').innerText()!==zoomBefore);
 const panBefore=await page.locator('#graphCanvas').getAttribute('style');const area=await page.locator('#graphViewport').boundingBox();
 await page.mouse.move(area.x+30,area.y+area.height-15);await page.mouse.down();await page.mouse.move(area.x+90,area.y+area.height-40,{steps:8});await page.mouse.up();
 check('graph canvas can be panned',await page.locator('#graphCanvas').getAttribute('style')!==panBefore);
 await page.locator('#fitGraph').click();await screenshot(page,'03-file-graph.png');
 check('graph exploration preserves collection references',(await state(page)).items.length===5);
 await page.locator('#scenario').click();await page.locator('[data-action="issues"]').click();await screenshot(page,'04-source-issue.png');
 await page.locator('[data-relocate="brief"]').click();check('source issue can be relinked',(await state(page)).items.every(f=>f.available));
 await page.locator('[data-remove="budget"]').click();check('removing an entry changes only the collection',(await state(page)).items.length===4);
 await page.locator('#undoRemove').click();check('undo restores removed collection item',(await state(page)).items.length===5);
 await page.locator('#bridgeCase').click();await page.locator('#bridgeHelp').click();
 check('shortcut registration is distinguished from bridge readiness',(await page.locator('#modal').innerText()).includes('无需重复安装'));
 await page.locator('[data-action="recheck"]').click();check('connection recovery updates status',!(await state(page)).bridgeMissing);
 await page.locator('#settings').click();await page.locator('[data-action="capture-key"]').click();await page.keyboard.press('Control+Alt+G');await page.locator('[data-action="close"]').first().click();
 await page.locator('[data-folder="desktop"]').click();await page.locator('[data-source="memo"]').click();await page.keyboard.press('Control+Alt+G');
 check('custom shortcut is interactive within the prototype',(await state(page)).items.length===6);
 await page.locator('#pack').click();await page.locator('#archiveName').fill('prototype-test');await page.locator('[data-format="7z"]').click();await page.locator('[data-action="choose-folder"]').click();await page.locator('[data-directory="~/文档"]').click();
 check('pack form preserves name, format and destination',(await state(page)).config.name==='prototype-test'&&(await state(page)).config.format==='7z'&&(await state(page)).config.directory==='~/文档');
 await screenshot(page,'05-pack-review.png');await page.locator('[data-action="start-pack"]').click();await page.locator('#cancelTask').click();
 check('cancelling preserves the full collection',!(await state(page)).task&&(await state(page)).items.length===6);
 await page.locator('#pack').click();await page.locator('[data-action="start-pack"]').click();
 const frozen=(await state(page)).task.ids;await page.locator('[data-folder="downloads"]').click();await page.locator('[data-source="reference"]').click();await page.keyboard.press('Control+Alt+G');
 check('newly collected items are queued for the next pack',(await state(page)).items.length===7&&JSON.stringify((await state(page)).task.ids)===JSON.stringify(frozen));
 await screenshot(page,'06-packing.png');await page.waitForFunction(()=>window.prototypeDemo.getState().result!==null,{timeout:12000});
 check('completed report corresponds to the frozen task',(await state(page)).result.written===8&&(await state(page)).result.output==='prototype-test.7z');
 await page.locator('[data-action="report"]').click();await screenshot(page,'07-result-report.png');await page.locator('[data-action="open-output"]').click();
 check('locate output shows the selected destination and virtual archive',(await page.locator('#folderTitle').innerText())==='~/文档'&&await page.locator('[data-source="output"]').count()===1);
 check('successful packing keeps the collection',(await state(page)).items.length===7);
 await context.close();
 const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const mobilePage=await phone.newPage();mobilePage.on('pageerror',error=>errors.push(String(error)));await mobilePage.goto(url);
 await mobilePage.locator('[data-source="brief"]').tap();await mobilePage.locator('[data-source="assets"]').tap();await mobilePage.locator('#collectSelected').tap();
 check('touch users can collect without drag/drop',(await state(mobilePage)).items.length===2);
 await mobilePage.locator('#pack').tap();await pause(350);const modal=await mobilePage.locator('#modal').boundingBox();
 await screenshot(mobilePage,'08-mobile.png');
 check('mobile dialog stays within the viewport',modal.x>=0&&modal.y>=0&&modal.x+modal.width<=391&&modal.y+modal.height<=845);
 await screenshot(mobilePage,'08-mobile.png');
 check('mobile layout has no horizontal page overflow',await mobilePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await phone.close();check('no browser runtime errors',errors.length===0);
 await writeFile(join(output,'interaction-checks.json'),JSON.stringify({passed:true,scope:'Browser-only design prototype with example data; no native shortcut registration or real compression.',checks,errors},null,2));
 console.log('Prototype verification: '+checks.length+' checks passed. Screenshots: '+output);
 if(!process.argv.includes('--inspect')){
  const recording=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:join(output,'recording'),size:{width:1440,height:900}}});
  const p=await recording.newPage();p.on('pageerror',error=>errors.push(String(error)));await p.goto(url+'?record=1');
  const title=async(a,b)=>{await p.evaluate(([a,b])=>window.prototypeDemo.caption(a,b),[a,b]);await pause(450);};
  await title('01 / 轻量收集','一个小收集点，让文件暂时有个落脚的地方。');await move(p,1000,470);await pause(1500);
  await p.keyboard.down('Control');for(const id of ['brief','assets','budget'])await click(p,'[data-source="'+id+'"]',250);await p.keyboard.up('Control');
  const a=await p.locator('[data-source="brief"]').boundingBox(),b=await p.locator('#orb').boundingBox();
  await move(p,a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await move(p,a.x+a.width/2+15,a.y+a.height/2+8,4,40);await move(p,b.x+b.width/2,b.y+b.height/2,36,28);await pause(500);await p.mouse.up();await pause(1600);
  assert.equal((await state(p)).items.length,3);
  await title('02 / 随手移动','整个图标与宽标题栏都可以拖动；点击和移动各司其职。');await drag(p,'#shelfHandle',-70,25);await click(p,'#collapse');await drag(p,'#orb',-100,125);await pause(500);await click(p,'#orb');await pause(900);
  await title('03 / 跨文件夹收集','选中后按快捷键；重复来源去重，不同来源的同名文件自动编号。');
  await click(p,'[data-folder="downloads"]');await p.keyboard.down('Control');await click(p,'[data-source="brief2"]',250);await click(p,'[data-source="spec"]',250);await p.keyboard.up('Control');await p.keyboard.press('Control+Alt+Shift+E');await pause(1600);
  await title('04 / 文件全景','展开文件夹、查看来源与体积，核对整份打包内容。');await click(p,'#graphView',650);await click(p,'[data-node="assets"]',650);await click(p,'[data-node="assets"]',400);await click(p,'[data-node="palette"]',800);await click(p,'#zoomIn',400);
  const g=await p.locator('#graphViewport').boundingBox();await move(p,g.x+30,g.y+g.height-15);await p.mouse.down();await move(p,g.x+85,g.y+g.height-40);await p.mouse.up();await pause(400);await click(p,'#fitGraph',900);await screenshot(p,'GatherPack-cover.png');
  await title('05 / 问题先处理','路径变化集中提示，重新定位后继续，不让问题藏在打包最后。');await click(p,'#scenario',500);await click(p,'[data-action="issues"]',1100);await click(p,'[data-relocate="brief"]',700);
  await title('06 / 检查并打包','文件名、格式、保存位置与包内目录，在一个地方确认。');await click(p,'#pack',650);await p.locator('#archiveName').fill('秋季项目交付');await pause(350);await click(p,'[data-format="7z"]',500);await click(p,'[data-format="ZIP"]',400);await click(p,'[data-action="choose-folder"]',550);await click(p,'[data-directory="~/文档"]',600);await pause(1200);await click(p,'[data-action="start-pack"]',350);
  await title('07 / 继续收集，不打断当前任务','本次任务使用固定快照，新加入的文件会标记为“下次打包”。');await click(p,'[data-folder="desktop"]');await click(p,'[data-source="memo"]');await p.keyboard.press('Control+Alt+Shift+E');await p.locator('[data-entry="memo"]').scrollIntoViewIfNeeded();await pause(900);
  await p.waitForFunction(()=>window.prototypeDemo.getState().result!==null,{timeout:12000});assert.equal((await state(p)).result.written,7);
  await title('08 / 完成，一路有数','查看写入结果与自动编号，定位压缩包；收集清单继续保留。');await click(p,'[data-action="report"]',1800);await click(p,'[data-action="open-output"]',1200);await pause(1300);
  const video=p.video();await recording.close();await video.saveAs(join(output,'GatherPack-interaction.webm'));
  const binaries=resolve('artifacts/design-tools/imageio_ffmpeg/binaries');
  const ffmpeg=process.env.FFMPEG_PATH||(existsSync(binaries)?join(binaries,(await readdir(binaries)).find(n=>n.startsWith('ffmpeg-'))):'ffmpeg');
  execFileSync(ffmpeg,['-y','-i',join(output,'GatherPack-interaction.webm'),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',join(output,'GatherPack-interaction.mp4')],{stdio:['ignore','ignore','pipe'],maxBuffer:16e6});
  const decoded=execFileSync(ffmpeg,['-v','error','-i',join(output,'GatherPack-interaction.mp4'),'-f','null','-'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.equal(decoded,'');check('exported MP4 decodes completely',true);check('recorded walkthrough has no runtime errors',errors.length===0);
  await writeFile(join(output,'interaction-checks.json'),JSON.stringify({passed:true,scope:'Browser-only design prototype; example files and simulated compression.',checks,errors},null,2));
  console.log('Interaction video exported and decoded: '+join(output,'GatherPack-interaction.mp4'));
 }
}finally{await browser.close();await new Promise(done=>server.close(done));}
