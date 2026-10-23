import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

export type GraphPlan = {
  entries: { source: string; destination: string; directory: boolean; size: number }[];
  issues: { source: string; message: string; blocking: boolean }[];
};
type Node = { id: string; name: string; source: string; destination: string; directory: boolean; bytes: number; issue?: string; children: Node[] };
type Positioned = { node: Node; x: number; y: number; parent?: Positioned; more?: string };
const ROOT = 'collection';
const PAGE = 8;
const MAX_NODES = 240;
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
function label(name: string) {
  let width = 0, result = '';
  for (const character of name) { width += character.charCodeAt(0) < 256 ? 7 : 14; if (width > 105) return result + '…'; result += character; }
  return result;
}

export function buildGraph(plan: GraphPlan) {
  const root: Node = { id: ROOT, name: '收集清单', source: '', destination: '', directory: true, bytes: 0, children: [] };
  const nodes = new Map<string, Node>([['', root]]);
  for (const entry of plan.entries) {
    let parent = root;
    const parts = entry.destination.split('/');
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let node = nodes.get(path);
      if (!node) {
        node = { id: `entry:${path}`, name: parts[i], source: '', destination: path, directory: true, bytes: 0, children: [] };
        parent.children.push(node); nodes.set(path, node);
      }
      if (i === parts.length - 1) Object.assign(node, { source: entry.source, directory: entry.directory, bytes: entry.directory ? 0 : entry.size });
      parent = node;
    }
  }
  // Reverse depth order also handles a plan whose entries arrive child-first.
  const depth = (node: Node) => node.destination ? node.destination.split('/').length : 0;
  for (const node of [...nodes.values()].sort((a, b) => depth(b) - depth(a))) {
    if (node.directory) node.bytes = node.children.reduce((sum, child) => sum + child.bytes, 0);
  }
  const issues = plan.issues.filter(issue => issue.blocking);
  if (issues.length) root.children.push({ id: 'issues', name: `待处理项 (${issues.length})`, source: '', destination: '', directory: true, bytes: 0, children: issues.map((issue, i) => ({ id: `issue:${i}`, name: issue.source.split(/[\\/]/).pop() || issue.source, source: issue.source, destination: '', directory: false, bytes: 0, issue: issue.message, children: [] })) });
  return { root, count: nodes.size - 1 + (issues.length ? issues.length + 1 : 0) };
}

export function FileGraph({ plan, reveal }: { plan: GraphPlan; reveal: (path: string) => void }) {
  const model = useMemo(() => buildGraph(plan), [plan]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Node | null>(null);
  const [view, setView] = useState({ x: 500, y: 260, zoom: 1 });
  const svg = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 1000, height: 520 });
  useEffect(() => {
    const element = svg.current!;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      if (rect.width && rect.height) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const gesture = useRef<{ id: number; x: number; y: number; originX: number; originY: number } | null>(null);
  useEffect(() => { setSelected(null); setExpanded(new Set()); setLimits({}); }, [model]);
  const layout = useMemo(() => {
    const positions: Positioned[] = [];
    const root: Positioned = { node: model.root, x: 0, y: 0 };
    let remaining = MAX_NODES - 2;
    type Branch = { node: Node; children: Branch[]; height: number; more?: string };
    function branch(node: Node, depth: number): Branch {
      remaining--;
      const children: Branch[] = [];
      if (expanded.has(node.id) && depth < 24) {
        const count = Math.min(node.children.length, limits[node.id] ?? PAGE);
        for (const child of node.children.slice(0, count)) { if (remaining <= 1) break; children.push(branch(child, depth + 1)); }
        if (children.length < node.children.length && remaining > 0) {
          remaining--;
          children.push({ node: { ...node, id: `more:${node.id}`, name: `还有 ${node.children.length - children.length} 项`, children: [] }, children: [], height: 64, more: node.id });
        }
      }
      return { node, children, height: Math.max(64, children.reduce((sum, child) => sum + child.height, 0)) };
    }
    const roots: Branch[] = [];
    for (const node of model.root.children.slice(0, limits[ROOT] ?? PAGE)) { if (remaining <= 1) break; roots.push(branch(node, 1)); }
    if (roots.length < model.root.children.length) roots.push({ node: { ...model.root, id: 'more:collection', name: `还有 ${model.root.children.length - roots.length} 项`, children: [] }, children: [], height: 64, more: ROOT });
    function place(item: Branch, parent: Positioned, side: number, depth: number, top: number) {
      const point: Positioned = { node: item.node, x: side * depth * 230, y: top + item.height / 2, parent, more: item.more };
      positions.push(point);
      let cursor = top;
      for (const child of item.children) { place(child, point, side, depth + 1, cursor); cursor += child.height; }
    }
    for (const side of [-1, 1]) {
      const group = roots.filter((_, index) => index % 2 === (side === -1 ? 0 : 1));
      let top = -group.reduce((sum, item) => sum + item.height, 0) / 2;
      for (const item of group) { place(item, root, side, 1, top); top += item.height; }
    }
    const xs = [0, ...positions.map(point => point.x)], ys = [0, ...positions.map(point => point.y)];
    return { positions, minX: Math.min(...xs) - 105, maxX: Math.max(...xs) + 105, minY: Math.min(...ys) - 45, maxY: Math.max(...ys) + 45 };
  }, [model, expanded, limits]);
  function fit() {
    const zoom = Math.min(1.25, (viewport.width - 55) / (layout.maxX - layout.minX), (viewport.height - 45) / (layout.maxY - layout.minY));
    setView({ x: viewport.width / 2 - (layout.minX + layout.maxX) / 2 * zoom, y: viewport.height / 2 - (layout.minY + layout.maxY) / 2 * zoom, zoom });
  }
  useEffect(fit, [layout, viewport]);
  const changeZoom = (factor: number) => setView(current => {
    const zoom = Math.max(.08, Math.min(3, current.zoom * factor)), ratio = zoom / current.zoom;
    return { x: viewport.width / 2 + (current.x - viewport.width / 2) * ratio, y: viewport.height / 2 + (current.y - viewport.height / 2) * ratio, zoom };
  });
  useEffect(() => {
    const element = svg.current;
    const wheel = (event: WheelEvent) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12); };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => element?.removeEventListener('wheel', wheel);
  }, [viewport]);
  function toggle(node: Node) { setExpanded(current => { const next = new Set(current); next.has(node.id) ? next.delete(node.id) : next.add(node.id); return next; }); }
  function select(point: Positioned) {
    if (point.more) { setLimits(current => ({ ...current, [point.more!]: (current[point.more!] ?? PAGE) + PAGE })); return; }
    setSelected(point.node); if (point.node.children.length) toggle(point.node);
  }
  function pan(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // meet alignment leaves horizontal or vertical gutters; use the common scale.
    const scale = Math.min(rect.width / viewport.width, rect.height / viewport.height);
    setView(view => ({ ...view, x: current.originX + (event.clientX - current.x) / scale, y: current.originY + (event.clientY - current.y) / scale }));
  }
  return <section className="file-graph" aria-label="文件关系图">
    <div className="graph-toolbar"><div><strong>把要带走的内容，一眼看全</strong><p>点击文件夹展开 · 拖动画布 · 滚轮缩放</p></div><div className="graph-controls"><button aria-label="缩小关系图" onClick={() => changeZoom(1 / 1.25)}>−</button><button onClick={fit}>适应画布</button><button aria-label="放大关系图" onClick={() => changeZoom(1.25)}>＋</button></div></div>
    <svg ref={svg} viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-label="收集文件发散图" onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }; }} onPointerMove={pan} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
      <defs><pattern id="graph-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d4e0d9" /></pattern></defs>
      <rect width="100%" height="100%" fill="url(#graph-dots)" />
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {layout.positions.map(point => { const side = Math.sign(point.x), startX = point.parent!.x + side * (point.parent!.node.id === ROOT ? 39 : 88), endX = point.x - side * 88, mid = (startX + endX) / 2; return <path key={'edge:' + point.node.id} d={`M${startX},${point.parent!.y} C${mid},${point.parent!.y} ${mid},${point.y} ${endX},${point.y}`} className={point.node.issue || point.node.id === 'issues' ? 'graph-edge graph-issue-edge' : 'graph-edge'} />; })}
        <circle r="39" className="graph-root" /><text textAnchor="middle" y="-3" className="graph-root-label">收集清单</text><text textAnchor="middle" y="15" className="graph-root-count">{plan.entries.filter(entry => !entry.directory).length} 个文件</text>
        {layout.positions.map(point => <g key={point.node.id} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0} aria-label={(point.more ? '显示更多：' : point.node.directory ? '文件夹：' : '文件：') + point.node.name} aria-expanded={point.node.children.length ? expanded.has(point.node.id) : undefined} className={'graph-node' + (selected?.id === point.node.id ? ' selected' : '') + (point.node.issue || point.node.id === 'issues' ? ' has-issue' : '')} onPointerDown={event => event.stopPropagation()} onClick={() => select(point)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(point); } }}>
          <title>{point.node.source || point.node.name}{point.node.issue ? '\n' + point.node.issue : ''}</title><rect x="-88" y="-24" width="176" height="48" rx="12" /><text x="-74" y="5" className="graph-node-icon">{point.more ? '···' : point.node.issue ? '!' : point.node.directory ? '▣' : '▤'}</text><text x="-50" y="-3" className="graph-node-name">{label(point.node.name)}</text><text x="-50" y="14" className="graph-node-meta">{point.more ? '点击继续显示' : point.node.issue ? '打包前需处理' : point.node.directory ? `${point.node.children.length} 项 · ${size(point.node.bytes)}` : size(point.node.bytes)}</text>{!!point.node.children.length && <text x="72" y="5" className="graph-node-fold">{expanded.has(point.node.id) ? '−' : '+'}</text>}
        </g>)}
      </g>
    </svg>
    <div className="graph-caption"><span>共 {model.count} 个节点 · 当前显示 {layout.positions.length} 个</span><span>只读查看，不改变收集清单</span></div>
    {layout.positions.length >= MAX_NODES - 2 && <p className="graph-limit">已达到单屏节点上限，请收起其他分支后继续展开。完整内容仍可在目录预览中查看。</p>}
    {selected ? <div className="graph-detail"><div><strong>{selected.name}</strong><p>{selected.issue || (selected.directory ? '文件夹' : size(selected.bytes))}</p><p className="graph-path">{selected.source || '待处理项汇总'}</p>{selected.destination && <p className="hint">打包路径：{selected.destination}</p>}</div>{selected.source && <button onClick={() => reveal(selected.source)}>定位来源</button>}</div> : <div className="graph-detail graph-detail-empty">选择一个节点，查看完整路径、大小和打包位置。</div>}
  </section>;
}
