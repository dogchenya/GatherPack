import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = playwrightModule.includes(':') ? await import(pathToFileURL(playwrightModule).href) : await import(playwrightModule);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = join(resolve('dist'), pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(resolve('dist'))) { res.writeHead(403).end(); return; }
  try { const bytes = await readFile(file); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(bytes); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true;
    const callbacks = new Map(); const events = new Map(); let callbackId = 0;
    const settings = { format: 'Zip', shortcut: 'Control+Alt+Shift+E', lastDirectory: null, autostart: false };
    const state = { entries: [], message: '', shortcutStatus: '快捷键已注册', settings, platform: 'windows', task: { running: false, phase: '', bytes: 0, totalBytes: 0, report: null }, expanded: false, trayAvailable: true };
    const plan = { sources: ['C:/one/report.txt', 'C:/two/report.txt', 'C:/missing.txt'], entries: [{ source: 'C:/one/report.txt', destination: 'report.txt', directory: false, size: 5 }, { source: 'C:/two/report.txt', destination: 'report (2).txt', directory: false, size: 7 }], issues: [{ source: 'C:/missing.txt', message: '不可用：文件不存在', blocking: true, file: false }], renames: [{ source: 'C:/two/report.txt', destination: 'report (2).txt' }], totalBytes: 12, files: 2, emptyDirectories: 0 };
    function emit(event, payload) { for (const id of events.get(event) ?? []) callbacks.get(id)?.({ event, payload: structuredClone(payload) }); }
    window.__emitTestState = () => emit('collection-changed', state);
    window.__testState = state;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback(fn) { const id = ++callbackId; callbacks.set(id, fn); return id; },
      async invoke(command, args) {
        switch (command) {
          case 'plugin:event|listen': { const list = events.get(args.event) ?? []; list.push(args.handler); events.set(args.event, list); return args.handler; }
          case 'plugin:event|unlisten': return;
          case 'snapshot': return structuredClone(state);
          case 'frontend_ready': return;
          case 'set_expanded': state.expanded = args.expanded; break;
          case 'pick_entries': state.entries = plan.sources.map((path, i) => ({ path, name: path.split('/').pop(), isDirectory: false, size: i === 2 ? null : [5, 7][i], status: i === 2 ? '不可用' : '可用' })); break;
          case 'remove_entry': window.__undoEntries = structuredClone(state.entries); state.entries = state.entries.filter(e => e.path !== args.path); break;
          case 'clear_entries': window.__undoEntries = structuredClone(state.entries); state.entries = []; break;
          case 'undo_collection': state.entries = [...window.__undoEntries, ...state.entries.filter(e => !window.__undoEntries.some(old => old.path === e.path))]; break;
          case 'set_pinned': window.__pinned = args.pinned; return;
          case 'set_panel_wide': window.__wide = args.wide; return;
          case 'prepare': return state.entries.length ? structuredClone(window.__previewPlan ?? plan) : { ...plan, sources: [], entries: [], issues: [], renames: [], files: 0, totalBytes: 0 };
          case 'plugin:window|start_dragging': window.__dragCount = (window.__dragCount ?? 0) + 1; return;
          case 'retry_shortcut': window.__shortcutRetries = (window.__shortcutRetries ?? 0) + 1; state.shortcutStatus = '快捷键已注册'; break;
          case 'reveal_dock': state.dockHidden = null; break;
          case 'reveal': window.__revealedPath = args.path; return;
          case 'choose_output': return 'C:/out/archive.' + ({ Zip: 'zip', SevenZip: '7z', TarGz: 'tar.gz' })[args.format];
          case 'start_pack':
            window.__started = args;
            state.task = { running: true, phase: '打包中', bytes: 5, totalBytes: 12, report: null }; emit('collection-changed', state);
            return new Promise(resolve => {
              window.__finishPack = () => {
                state.task = { running: false, phase: 'success', bytes: 12, totalBytes: 12, report: { status: 'success', output: args.output, written: plan.entries.map(e => e.source), skipped: [], failed: [], pending: [], emptyDirectories: 0, renames: plan.renames, error: null, delivered: true, issues: plan.issues } };
                emit('collection-changed', state); resolve();
              };
            });
          case 'save_settings': Object.assign(state.settings, args); break;
          default: return;
        }
        emit('collection-changed', state);
      }
    };
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('.orb').click();
  await page.locator('main').dispatchEvent('drop', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await page.getByRole('alert').getByText('仅支持本地真实文件和文件夹', { exact: false }).waitFor();
  await page.getByRole('button', { name: '添加文件', exact: true }).click();
  await page.locator('.connection-strip button').click();
  await page.getByRole('button', { name: '重新注册', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__shortcutRetries), 1);
  await page.setViewportSize({ width: 440, height: 760 });
  await page.locator('.rename-badge').waitFor();
  await page.screenshot({ path: 'artifacts/validation/ui-shelf.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: '置顶窗口' }).click();
  assert.equal(await page.evaluate(() => window.__pinned), false);
  await page.getByRole('button', { name: '移除 report.txt', exact: true }).first().click();
  await page.getByRole('button', { name: '撤销', exact: true }).first().click();
  assert.equal(await page.evaluate(() => window.__testState.entries.length), 3, 'undo restores removed reference');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settingsDialog = page.getByRole('dialog', { name: '应用设置' });
  await settingsDialog.getByRole('textbox').press('Control+Alt+K');
  assert.equal(await settingsDialog.getByRole('textbox').inputValue(), 'Control+Alt+K');
  await settingsDialog.getByRole('button', { name: '保存设置' }).focus();
  await page.keyboard.press('Tab');
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /关闭应用设置/);
  await page.keyboard.press('Escape');
  await settingsDialog.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 900, height: 760 });
  await page.getByRole('button', { name: '文件关系图', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__wide), true);
  await page.getByRole('button', { name: '文件：report (2).txt', exact: true }).click();
  await page.locator('.graph-detail').getByText('C:/two/report.txt', { exact: true }).waitFor();
  await page.getByRole('button', { name: '定位来源', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__revealedPath), 'C:/two/report.txt');
  await page.getByRole('button', { name: '文件夹：待处理项 (1)', exact: true }).click();
  await page.getByRole('button', { name: '文件：missing.txt', exact: true }).press('Enter');
  await page.locator('.graph-detail').getByText('不可用：文件不存在', { exact: true }).waitFor();
  const graph = page.locator('.file-graph svg');
  // Selecting a node can grow its detail card and resize the canvas. Wait for
  // the native ResizeObserver layout before recording a fit/zoom baseline.
  await graph.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForFunction(() => {
    const element = document.querySelector('.file-graph svg'), bounds = element.getBoundingClientRect();
    return Math.abs(element.viewBox.baseVal.height - bounds.height) <= 1 && Math.abs(element.viewBox.baseVal.width - bounds.width) <= 1;
  });
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  const transform = await graph.locator(':scope > g').getAttribute('transform');
  await page.getByRole('button', { name: '放大关系图', exact: true }).click();
  assert.notEqual(await graph.locator(':scope > g').getAttribute('transform'), transform);
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  assert.equal(await graph.locator(':scope > g').getAttribute('transform'), transform);
  const originals = await page.evaluate(() => structuredClone(window.__testState.entries));
  await page.evaluate(() => {
    const entries = [{ source: '/work/项目', destination: '项目', directory: true, size: 0 }, { source: '/work/项目/文档', destination: '项目/文档', directory: true, size: 0 }, { source: '/work/项目/空目录', destination: '项目/空目录', directory: true, size: 0 }, ...Array.from({ length: 24 }, (_, i) => ({ source: `/work/项目/文档/资料-${i}.txt`, destination: `项目/文档/资料-${i}.txt`, directory: false, size: 256 + i }))];
    window.__previewPlan = { sources: ['/work/项目'], entries, issues: [], renames: [], totalBytes: 6400, files: 24, emptyDirectories: 1 };
    window.__testState.entries = [{ path: '/work/项目', name: '项目', isDirectory: true, size: null, status: '可用' }]; window.__emitTestState();
  });
  await page.getByRole('button', { name: '文件夹：项目', exact: true }).click();
  await page.getByRole('button', { name: '文件夹：文档', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '文件：资料-15.txt', exact: true }).count(), 0);
  await page.getByRole('button', { name: '显示更多：还有 16 项', exact: true }).click();
  await page.getByRole('button', { name: '文件：资料-15.txt', exact: true }).press('Enter');
  await page.locator('.graph-detail').getByText('/work/项目/文档/资料-15.txt', { exact: true }).waitFor();
  const graphBox = await graph.boundingBox();
  await page.mouse.move(graphBox.x + 12, graphBox.y + 12);
  const beforePan = await graph.locator(':scope > g').getAttribute('transform');
  await page.mouse.down(); await page.mouse.move(graphBox.x + 62, graphBox.y + 42, { steps: 6 }); await page.mouse.up();
  assert.notEqual(await graph.locator(':scope > g').getAttribute('transform'), beforePan);
  const beforeWheel = await graph.locator(':scope > g').getAttribute('transform');
  await page.mouse.wheel(0, -150);
  await page.waitForFunction(previous => document.querySelector('.file-graph svg > g').getAttribute('transform') !== previous, beforeWheel);
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/validation/ui-graph.png', fullPage: true });
  await page.getByRole('button', { name: '文件夹：文档', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '文件：资料-15.txt', exact: true }).count(), 0, 'collapsing a folder hides only its graph descendants');
  await page.evaluate(entries => { delete window.__previewPlan; window.__testState.entries = entries; window.__emitTestState(); }, originals);
  await page.getByRole('button', { name: '文件：report (2).txt', exact: true }).waitFor();
  // Check broad header movement without accidentally turning settings into a drag.
  await page.locator('header').scrollIntoViewIfNeeded();
  const header = await page.locator('header').boundingBox();
  await page.mouse.move(header.x + header.width * .55, header.y + 9);
  await page.mouse.down(); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__dragCount), 1);
  await page.getByRole('button', { name: '目录与问题' }).click();
  await page.locator('.tree').getByText('report (2).txt').waitFor();
  await page.getByRole('button', { name: '检查并打包 →' }).click();
  const dialog = page.getByRole('dialog', { name: '确认打包' });
  await page.setViewportSize({ width: 440, height: 760 });
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 440 && bounds.y >= 0 && bounds.y + bounds.height <= 760, 'pack dialog stays within compact shelf viewport');
  await page.screenshot({ path: 'artifacts/validation/ui-pack-review.png' });
  await dialog.getByRole('combobox').selectOption('SevenZip');
  await dialog.getByRole('button', { name: '选择保存位置' }).click();
  assert.equal(await dialog.getByRole('button', { name: '开始打包', exact: true }).isDisabled(), true, 'issues require acknowledgement');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '开始打包', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '收集清单', exact: true }).click();
  await page.getByRole('button', { name: '清空清单', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__started.expectedPlan.entries.length), 2, 'active plan is isolated');
  assert.equal(await page.evaluate(() => window.__testState.task.running), true, 'collection clear does not cancel');
  await page.evaluate(() => window.__finishPack());
  await page.getByRole('heading', { name: '压缩包已生成' }).waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: '应用设置' }).getByRole('combobox', { name: '压缩格式' }).inputValue(), 'Zip', 'task override must not change default');
  await page.getByRole('dialog', { name: '应用设置' }).getByRole('button', { name: '取消', exact: true }).click();
  await mkdir('artifacts/validation', { recursive: true });
  await page.screenshot({ path: 'artifacts/validation/ui-report.png', fullPage: true });
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: '收起面板' }).click();
  await page.locator('.orb').waitFor();
  const orb = await page.locator('.orb').boundingBox();
  await page.mouse.move(orb.x + 30, orb.y + 30);
  await page.mouse.down(); await page.mouse.move(orb.x + 45, orb.y + 40, { steps: 5 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__dragCount), 2, 'the whole compact icon starts native movement');
  await page.locator('.orb').waitFor();
  assert.equal(await page.locator('main').count(), 0, 'dragging must not expand the icon');
  await page.locator('.orb').click();
  await page.locator('main').waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__dragCount), 2, 'interactive header buttons never start dragging');
  await page.getByRole('dialog', { name: '应用设置' }).getByRole('button', { name: '取消', exact: true }).click();
  const fixtureBeforeLanguage = await page.evaluate(() => structuredClone({ state: window.__testState, plan: window.__previewPlan }));
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('combobox', { name: '界面语言' }).selectOption('en');
  await page.getByRole('heading', { name: 'App settings' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN', 'cancel reverts the language preview');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('combobox', { name: '界面语言' }).selectOption('en');
  await page.getByRole('checkbox', { name: 'Auto-hide at screen edges' }).uncheck();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__testState.settings.language), 'en');
  assert.equal(await page.evaluate(() => window.__testState.settings.edgeHide), false);
  await page.evaluate(() => {
    const path = 'C:/测试/收集清单';
    window.__testState.entries = [{path,name:'收集清单',isDirectory:false,size:10,status:'可用'}];
    window.__testState.message='';
    window.__previewPlan={sources:[path],entries:[{source:path,destination:'收集清单',directory:false,size:10}],issues:[],renames:[],totalBytes:10,files:1,emptyDirectories:0};
    window.__emitTestState();
  });
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  await page.locator('.file-info strong').getByText('收集清单', {exact:true}).waitFor();
  assert.equal(await page.locator('.file-info span').textContent(), 'C:/测试/收集清单');
  await page.getByRole('button', { name: 'File graph', exact: true }).click();
  await page.getByRole('button', { name: 'File: 收集清单', exact: true }).click();
  assert.equal(await page.locator('.graph-detail strong').textContent(), '收集清单');
  assert.equal(await page.locator('.graph-path').textContent(), 'C:/测试/收集清单');
  await page.getByRole('button', { name: 'Review and pack →', exact: true }).click();
  await page.getByRole('heading', { name: 'Review this archive' }).waitFor();
  await page.getByRole('textbox', { name: 'Output path' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const englishSettings=await page.getByRole('dialog', {name:'App settings'}).innerText();
  assert.equal(/\p{Script=Han}/u.test(englishSettings.replaceAll('简体中文','')),false,'English settings have no untranslated app text');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__testState.message='准备失败：不能覆盖源文件'; window.__emitTestState(); });
  await page.getByRole('status').filter({hasText:'Preparation failed: Source files cannot be overwritten'}).waitFor();
  await page.mouse.move(-20,-20);
  await page.evaluate(() => { window.__testState.expanded=false; window.__testState.dockHidden='left'; window.__emitTestState(); });
  await page.getByRole('button', {name:'Show floating icon'}).dispatchEvent('mouseover');
  await page.getByRole('button', {name:'Open collection panel'}).waitFor();
  assert.equal(await page.locator('main').count(),0,'revealing an edge handle restores the compact icon');
  await page.getByRole('button', {name:'Open collection panel'}).click();
  await page.evaluate(data => { Object.assign(window.__testState,data.state); window.__previewPlan=data.plan; window.__emitTestState(); },fixtureBeforeLanguage);
  await page.getByRole('button', {name:'设置',exact:true}).waitFor();
  if (process.env.CAPTURE_UI === '1') {
    await page.setViewportSize({ width: 440, height: 760 });
    await page.getByRole('button', { name: '收集清单', exact: true }).click();
    await page.evaluate(() => {
      const roots = [
        ['/home/chen/Documents/项目交付/项目说明.pdf', '项目说明.pdf', false, 2516582],
        ['/home/chen/Documents/项目交付/设计素材', '设计素材', true, null],
        ['/home/chen/Documents/项目交付/预算表.xlsx', '预算表.xlsx', false, 88064],
        ['/home/chen/Downloads/项目说明.pdf', '项目说明.pdf', false, 1153433],
        ['/home/chen/Downloads/补充说明.docx', '补充说明.docx', false, 839680],
      ];
      const entries = roots.map(([source, name, directory, bytes], i) => ({ source, destination: i === 3 ? '项目说明 (2).pdf' : name, directory, size: bytes || 0 }));
      for (const [name, bytes] of [['封面.png', 12582912], ['配色.png', 10485760], ['布局.png', 12582912]]) entries.push({ source: roots[1][0] + '/' + name, destination: '设计素材/' + name, directory: false, size: bytes });
      window.__previewPlan = { sources: roots.map(r => r[0]), entries, issues: [], renames: [{ source: roots[3][0], destination: '项目说明 (2).pdf' }], totalBytes: entries.reduce((n,e) => n + e.size,0), files: 7, emptyDirectories: 0 };
      window.__testState.entries = roots.map(([path,name,isDirectory,size]) => ({ path,name,isDirectory,size,status:'可用' }));
      window.__testState.message = ''; window.__testState.task.report = null; window.__emitTestState();
    });
    await page.locator('.collection-summary').getByText('7 个文件', { exact: false }).waitFor();
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await mkdir('docs/assets', { recursive: true });
    await page.screenshot({ path: 'docs/assets/shelf-alpha8.png' });
    await page.setViewportSize({ width: 900, height: 760 });
    await page.getByRole('button', { name: '文件关系图', exact: true }).click();
    await page.getByRole('button', { name: '文件夹：设计素材', exact: true }).click();
    await page.getByRole('button', { name: '适应画布', exact: true }).click();
    await page.screenshot({ path: 'docs/assets/graph-alpha8.png' });
  }
  console.log('UI integration passed (including 440px shelf/modal bounds, undo, native pin, graph width, keyboard capture/focus trap/Escape): collect, graph selection/issues/zoom/reveal, shortcut retry, full-header and compact-icon drag/click separation, preview, packing isolation and report; no page errors.');
} finally { await browser.close(); server.close(); }

