export type GraphPlan = {
  entries: { source: string; destination: string; directory: boolean; size: number }[];
  issues: { source: string; message: string; blocking: boolean }[];
};
export type GraphNode = { id: string; name: string; source: string; destination: string; directory: boolean; bytes: number; issue?: string; children: GraphNode[] };
export const ROOT = 'collection';
export function buildGraph(plan: GraphPlan) {
  const root: GraphNode = { id: ROOT, name: '收集清单', source: '', destination: '', directory: true, bytes: 0, children: [] };
  const nodes = new Map<string, GraphNode>([['', root]]);
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
  const depth = (node: GraphNode) => node.destination ? node.destination.split('/').length : 0;
  for (const node of [...nodes.values()].sort((a, b) => depth(b) - depth(a))) {
    if (node.directory) node.bytes = node.children.reduce((sum, child) => sum + child.bytes, 0);
  }
  const issues = plan.issues.filter(issue => issue.blocking);
  if (issues.length) root.children.push({ id: 'issues', name: `待处理项 (${issues.length})`, source: '', destination: '', directory: true, bytes: 0, children: issues.map((issue, i) => ({ id: `issue:${i}`, name: issue.source.split(/[\\/]/).pop() || issue.source, source: issue.source, destination: '', directory: false, bytes: 0, issue: issue.message, children: [] })) });
  return { root, count: nodes.size - 1 + (issues.length ? issues.length + 1 : 0) };
}

