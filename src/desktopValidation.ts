import { invoke } from '@tauri-apps/api/core';

// Explicit CLI-only, isolated profile. Exercise the same edge worker as the app.
export async function runDesktopValidation() {
  window.addEventListener('keydown', event => {
    if (!event.altKey) return;
    const action = ({ l:'place-left',r:'place-right',t:'place-top',b:'place-bottom',c:'place-center',s:'inspect' } as Record<string,string>)[event.key.toLowerCase()];
    if (action) { event.preventDefault(); void invoke('validation_desktop_action', { action }); }
  });
  const samples: any[] = [];
  const checks: { name: string; passed: boolean }[] = [];
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const sample = async (phase: string, action = 'inspect') => {
    const native = await invoke('validation_desktop_action', { action });
    samples.push({ phase, native, web: { width: innerWidth, height: innerHeight, dpi: devicePixelRatio, rootBackground: getComputedStyle(document.documentElement).backgroundColor } });
    await invoke('validation_desktop_report', { result: { samples, checks, passed: checks.every(c => c.passed) } });
    return native as any;
  };
  const check = (name: string, passed: boolean) => { checks.push({ name, passed }); };
  await pause(1000);
  const center = await sample('center', 'place-center');
  check('compact viewport is exactly 104 logical pixels', Math.abs(center.innerSize.width / center.scale - 104) < 1);
  check('native frame and client dimensions match', JSON.stringify(center.innerSize) === JSON.stringify(center.outerSize));
  await pause(1000);
  for (const side of ['left', 'right', 'top', 'bottom']) {
    await sample(`${side}-placed`, `place-${side}`);
    for (let i = 0; i < 15; i++) { await pause(200); await sample(`${side}-${i}`); }
    const hidden = samples.at(-1).native;
    const vertical = side === 'left' || side === 'right';
    check(`${side} becomes a 10 logical pixel wake tab`, hidden.snapshot.dockHidden === side && Math.abs((vertical ? hidden.innerSize.width : hidden.innerSize.height) / hidden.scale - 10) < 1);
    check(`${side} wake tab stays fully inside the work area`, hidden.outerOrigin.x >= hidden.monitor.workPosition.x && hidden.outerOrigin.x + hidden.outerSize.width <= hidden.monitor.workPosition.x + hidden.monitor.workSize.width && hidden.outerOrigin.y >= hidden.monitor.workPosition.y && hidden.outerOrigin.y + hidden.outerSize.height <= hidden.monitor.workPosition.y + hidden.monitor.workSize.height);
    await invoke('reveal_dock');
    await pause(600);
    const restored = await sample(`${side}-restored`);
    check(`${side} restores compact width without growth`, Math.abs(restored.innerSize.width / restored.scale - 104) < 1);
    await sample(`${side}-crossed`, `place-${side}-over`);
    await pause(2000);
    check(`${side} still hides after crossing the screen edge`, (await sample(`${side}-crossed-hidden`)).snapshot.dockHidden === side);
    await invoke('reveal_dock');
    await pause(500);
  }
  await invoke('set_expanded', { expanded: true });
  await pause(300);
  document.querySelector<HTMLButtonElement>('.connection-strip button')!.click();
  await pause(300);
  check('visible dialog pauses native edge hiding', (await sample('dialog-open')).edge.blocked === true);
  await invoke('set_expanded', { expanded: false });
  await pause(300);
  check('collapsed dialog releases native edge hiding', (await sample('dialog-collapsed')).edge.blocked === false);
  await invoke('set_expanded', { expanded: true });
  await pause(300);
  document.querySelector<HTMLButtonElement>('.dialog .dialog-actions button')!.click();
  await pause(300);
  await invoke('validation_desktop_action', {action:'fit-panel'});
  await pause(300);
  const expanded = await sample('expanded');
  for (const side of ['left','top','bottom']) {
    await sample(`expanded-${side}-placed`, `place-${side}`);
    await pause(2000);
    check(`expanded panel hides at ${side}`, (await sample(`expanded-${side}-hidden`)).snapshot.dockHidden === side);
    await invoke('reveal_dock');
    await pause(500);
    const expandedAgain = await sample(`expanded-${side}-restored`);
    check(`expanded ${side} preserves size`, JSON.stringify(expanded.innerSize) === JSON.stringify(expandedAgain.innerSize));
  }
  await invoke('set_expanded', { expanded: false });
  await pause(300);
  await sample('finished', 'place-center');
}
