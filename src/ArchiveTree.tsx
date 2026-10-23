import { useMemo, useState } from 'react';
import { Icon } from './Icon';
type Item = { source: string; destination: string; directory: boolean; size: number };
export function ArchiveTree({ entries }: { entries: Item[] }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(300);
  const visible = useMemo(() => entries.filter(entry => {
    const parts = entry.destination.split('/');
    return !parts.slice(0, -1).some((_, i) => closed.has(parts.slice(0, i + 1).join('/')));
  }), [entries, closed]);
  return <><div className="tree" aria-label="压缩包目录树">{visible.slice(0, limit).map(entry => <div key={entry.destination} style={{ paddingLeft: 12 + 16 * (entry.destination.split('/').length - 1) }} title={entry.source}>
    {entry.directory ? <button className="tree-folder" aria-expanded={!closed.has(entry.destination)} onClick={() => setClosed(old => { const next = new Set(old); if (next.has(entry.destination)) next.delete(entry.destination); else next.add(entry.destination); return next; })}><span>{closed.has(entry.destination) ? '›' : '⌄'}</span><Icon name="folder" />{entry.destination.split('/').pop()}</button> : <><Icon name="file" />{entry.destination.split('/').pop()}<small>{entry.size < 1024 ? entry.size + ' B' : (entry.size / 1024).toFixed(1) + ' KB'}</small></>}
  </div>)}</div>{visible.length > limit && <button onClick={() => setLimit(n => n + 300)}>继续显示（剩余 {visible.length - limit} 项）</button>}</>;
}
