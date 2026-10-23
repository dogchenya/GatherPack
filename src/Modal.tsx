import { useI18n } from './i18n';
import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ label, close, children }: { label: string; close: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const onClose = useRef(close); onClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length);
    (focusable()[0] || dialog).focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last!.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', handler);
    return () => { dialog.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  return <div className="overlay"><section ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}><button className="dialog-close icon-button" aria-label={t('关闭') + label} onClick={close}>×</button>{children}</section></div>;
}
