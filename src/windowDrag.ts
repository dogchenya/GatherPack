import { useRef, type MouseEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Native window movement keeps the compositor in charge of motion and DPI.
// Only the compact icon needs a threshold to preserve an ordinary click.
export function useWindowDrag(error: (message: string) => void) {
  const pending = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  function start() {
    dragged.current = true;
    if (isTauri()) void getCurrentWindow().startDragging().catch(reason => error(String(reason)));
  }
  function down(event: MouseEvent<HTMLElement>, immediate = false) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, select, a, [role="button"]') && !target.closest('[data-drag-click]')) return;
    dragged.current = false;
    if (immediate || !target.closest('[data-drag-click]')) { event.preventDefault(); start(); return; }
    // GTK window-manager grabs can interrupt WebKit's PointerEvent stream.
    // Mouse events remain balanced across consecutive native window drags.
    pending.current = { x: event.clientX, y: event.clientY };
  }
  function move(event: MouseEvent<HTMLElement>) {
    const origin = pending.current;
    if (!origin || !(event.buttons & 1) || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 4) return;
    pending.current = null;
    event.preventDefault(); start();
  }
  return { down, move, end: () => { pending.current = null; }, wasDragged: () => dragged.current };
}
