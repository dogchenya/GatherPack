const paths: Record<string, string> = {
  box: 'm3 7 9-4 9 4v11l-9 4-9-4Z M3 7l9 4 9-4 M12 11v11 M8 5l9 4',
  file: 'M6 3h8l4 4v14H6Z M14 3v5h4 M9 12h6 M9 16h6',
  folder: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z',
  plus: 'M12 5v14 M5 12h14', close: 'm6 6 12 12 M18 6 6 18',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M15 9v6 M9 15v6',
  collapse: 'M5 12h14', arrow: 'M4 12h15 m-6-6 6 6-6 6',
  pin: 'm9 3 9 3-3 5 2 5-6-1-4 5-2-1 4-6-3-4Z',
  list: 'M8 6h12 M8 12h12 M8 18h12 M3 6h.1 M3 12h.1 M3 18h.1',
  graph: 'M9 9h6v6H9Z M12 9V4H4v4 M15 12h6v7h-5 M9 12H3v7h5',
  check: 'm5 12 4 4L19 6', alert: 'm12 3 10 18H2Z M12 9v5 M12 17h.01',
  undo: 'm8 4-5 5 5 5 M3 9h10a6 6 0 0 1 0 12',
  locate: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6 M9 12h6 M12 9v6',
};
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <svg className={'icon ' + className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.file} /></svg>;
}
