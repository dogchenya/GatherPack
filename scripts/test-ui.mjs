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
    window.__testState = state;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback(fn) { const id = ++callbackId; callbacks.set(id, fn); return id; },
      async invoke(command, args) {
        switch (command) {
          case 'plugin:event|listen': { const list = events.get(args.event) ?? []; list.push(args.handler); events.set(args.event, list); return args.handler; }
          case 'plugin:event|unlisten': return;
          case 'snapshot': return structuredClone(state);
          case 'frontend_ready': return;
          case 'set_expanded': state.expanded = args.expanded; break;
          case 'pick_entries': state.entries = plan.sources.map((path, i) => ({ path, name: path.split('/').pop(), isDirectory: false, size: i === 2 ? null : [5, 7][i], status: i === 2 ? '不可用' : '可用' })); break;
          case 'clear_entries': state.entries = []; break;
          case 'prepare': return state.entries.length ? structuredClone(plan) : { ...plan, sources: [], entries: [], issues: [], renames: [], files: 0, totalBytes: 0 };
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
  await page.getByRole('button', { name: '目录与问题' }).click();
  await page.locator('.tree').getByText('report (2).txt').waitFor();
  await page.getByRole('button', { name: '检查并打包 →' }).click();
  const dialog = page.getByRole('dialog', { name: '确认打包' });
  await dialog.getByRole('combobox').selectOption('SevenZip');
  await dialog.getByRole('button', { name: '选择保存位置' }).click();
  assert.equal(await dialog.getByRole('button', { name: '开始打包', exact: true }).isDisabled(), true, 'issues require acknowledgement');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '开始打包', exact: true }).click();
  await dialog.getByRole('button', { name: '后台运行' }).click();
  await page.getByRole('button', { name: '收集清单', exact: true }).click();
  await page.getByRole('button', { name: '清空清单', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__started.expectedPlan.entries.length), 2, 'active plan is isolated');
  assert.equal(await page.evaluate(() => window.__testState.task.running), true, 'collection clear does not cancel');
  await page.evaluate(() => window.__finishPack());
  await page.getByRole('heading', { name: '压缩包已生成' }).waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: '应用设置' }).getByRole('combobox').inputValue(), 'Zip', 'task override must not change default');
  await page.getByRole('dialog', { name: '应用设置' }).getByRole('button', { name: '取消', exact: true }).click();
  await mkdir('artifacts/validation', { recursive: true });
  await page.screenshot({ path: 'artifacts/validation/ui-report.png', fullPage: true });
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: '收起面板' }).click();
  await page.locator('.orb').waitFor();
  console.log('UI integration passed: collect, preview, collision map, issue acknowledgement, format override, background task isolation, report, collapse; no page errors.');
} finally { await browser.close(); server.close(); }

