'use strict';
const $ = id => document.getElementById(id);
const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MB = 1048576;
const files = [
 {id:'brief',name:'项目说明.pdf',kind:'pdf',size:2.4*MB,folder:'project',path:'~/文档/项目交付/项目说明.pdf'},
 {id:'assets',name:'设计素材',kind:'folder',size:34*MB,folder:'project',path:'~/文档/项目交付/设计素材',children:[{id:'cover',name:'封面.png',kind:'image',size:14*MB},{id:'poster',name:'海报.jpg',kind:'image',size:18*MB},{id:'palette',name:'配色.svg',kind:'image',size:2*MB}]},
 {id:'budget',name:'预算表.xlsx',kind:'sheet',size:86*1024,folder:'project',path:'~/文档/项目交付/预算表.xlsx'},
 {id:'notes',name:'交付说明.md',kind:'doc',size:12*1024,folder:'project',path:'~/文档/项目交付/交付说明.md'},
 {id:'preview',name:'效果预览.png',kind:'image',size:4.8*MB,folder:'project',path:'~/文档/项目交付/效果预览.png'},
 {id:'schedule',name:'排期表.xlsx',kind:'sheet',size:64*1024,folder:'project',path:'~/文档/项目交付/排期表.xlsx'},
 {id:'brief2',name:'项目说明.pdf',kind:'pdf',size:1.1*MB,folder:'downloads',path:'~/下载/项目说明.pdf'},
 {id:'spec',name:'补充说明.docx',kind:'doc',size:820*1024,folder:'downloads',path:'~/下载/补充说明.docx'},
 {id:'reference',name:'参考截图.png',kind:'image',size:3.2*MB,folder:'downloads',path:'~/下载/参考截图.png'},
 {id:'memo',name:'备忘录.md',kind:'doc',size:8*1024,folder:'desktop',path:'~/桌面/备忘录.md'},
 {id:'draft',name:'最终确认.pdf',kind:'pdf',size:1.6*MB,folder:'desktop',path:'~/桌面/最终确认.pdf'}
];
const folderNames = {project:'项目交付',downloads:'下载',desktop:'桌面',output:'输出目录'};
let collection = [], selected = new Set(), folder = 'project', view = 'list', expanded = false;
let task = null, result = null, taskTimer, toastTimer, undoItem = null, skipIds = new Set();
let graphSelected = null, graphExpanded = true, graphZoom = 1, graphPan = {x:0,y:0};
let bridgeMissing = false, pinned = true, autostart = false, capturing = false, modalView = '';
let config = {format:'ZIP',directory:'~/下载',name:'GatherPack_20261022_142600'};
const packFolders=new Set();
let shortcut = {key:'e',ctrl:true,alt:true,shift:true,meta:false,label:'Ctrl Alt Shift E'};
let tourToken = 0, lastFocus = null;
const mobile = () => matchMedia('(max-width:700px)').matches;
const pretty = bytes => bytes >= MB ? (bytes/MB).toFixed(1)+' MB' : Math.round(bytes/1024)+' KB';
const fileIcon = file => '<span class="file-icon '+file.kind+'">'+icon(file.kind==='folder'?'folder':'file')+'</span>';
const getFile = id => files.find(f=>f.id===id);
const extension = () => ({ZIP:'zip','7z':'7z','tar.gz':'tar.gz'}[config.format]);
const fileCount = entries => entries.reduce((n,f)=>n+(f.children?f.children.length:1),0);
const totalSize = entries => entries.reduce((n,f)=>n+f.size,0);
const unavailable = () => collection.filter(f=>f.available===false&&!skipIds.has(f.id));
function outputNames(entries=collection) {
 const names=new Set(), map=new Map();
 for(const file of entries) {
  let name=file.name, n=2, dot=file.kind==='folder'?-1:name.lastIndexOf('.');
  const stem=dot>0?name.slice(0,dot):name, suffix=dot>0?name.slice(dot):'';
  while(names.has(name)) name=stem+' ('+n+++')'+suffix;
  names.add(name); map.set(file.id,name);
 }
 return map;
}
function caption(title,text) {
 $('caption').innerHTML='<b>'+esc(title)+'</b><span>'+esc(text)+'</span>';
}
function toast(message,undo=false) {
 clearTimeout(toastTimer);
 $('toast').innerHTML=icon('check')+'<span>'+esc(message)+'</span>'+(undo?'<button id="undoRemove">'+icon('undo')+'撤销</button>':'');
 $('toast').hidden=false;
 if(undo) $('undoRemove').onclick=()=>{ if(undoItem&&!collection.some(f=>f.id===undoItem.file.id)){collection.splice(undoItem.index,0,undoItem.file);render();toast('已恢复到收集清单');} undoItem=null;};
 toastTimer=setTimeout(()=>$('toast').hidden=true,4500);
}
function renderSources() {
 $('folderTitle').textContent=folder==='output'&&result?result.directory:folderNames[folder]; $('breadcrumb').textContent=folderNames[folder];
 document.querySelectorAll('[data-folder]').forEach(b=>b.classList.toggle('active',b.dataset.folder===folder));
 $('sourceGrid').innerHTML=files.filter(f=>f.folder===folder).map(f=>'<div class="source-card '+(selected.has(f.id)?'selected':'')+'" draggable="true" role="button" tabindex="0" data-source="'+f.id+'" aria-label="'+f.name+'" aria-pressed="'+selected.has(f.id)+'">'+fileIcon(f)+'<b>'+f.name+'</b><small>'+(f.children?'文件夹 · '+f.children.length+' 个文件':pretty(f.size))+'</small>'+(collection.some(c=>c.id===f.id)?'<span class="collected">'+icon('check')+'</span>':'')+'</div>').join('');
 $('selectedCount').textContent=selected.size?'已选中 '+selected.size+' 项':'选择需要带走的文件';
 $('collectSelected').disabled=!selected.size;
}
function addFiles(ids,origin='收集') {
 const added=[]; for(const id of ids){ const file=getFile(id); if(file&&!collection.some(f=>f.id===id)){const next=structuredClone(file); next.available=true;collection.push(next);added.push(next);} }
 if(!added.length){toast('这些文件已经在收集清单中');return;}
 render();
 toast('已'+origin+' '+added.length+' 项'+(task?' · 将用于下次打包':''));
}
function ensureSample() { if(!collection.length) addFiles(['brief','assets','budget','brief2','spec']); }
function showShelf(show=true) {
 expanded=show; $('shelf').hidden=!show; $('orbDock').hidden=show;
 if(show){render(); requestAnimationFrame(fitPosition);}
}
function fitPosition() {
 const panel=$('shelf'), stage=$('desktop');
 if(mobile()){ panel.style.left='12px';panel.style.right='auto';panel.style.top='345px';panel.style.width=(stage.clientWidth-24)+'px';return; }
 const width=view==='graph'?680:380;
 panel.style.width=Math.min(width,stage.clientWidth-32)+'px';
 const current=parseFloat(panel.style.left);
 if(Number.isFinite(current)) panel.style.left=Math.max(16,Math.min(current,stage.clientWidth-panel.offsetWidth-16))+'px';
 const y=Number.isFinite(parseFloat(panel.style.top))?parseFloat(panel.style.top):85;
 panel.style.top=Math.max(43,Math.min(y,stage.clientHeight-panel.offsetHeight-15))+'px';
}
function setView(next) {
 const panel=$('shelf'), stage=$('desktop'), oldWidth=panel.offsetWidth||380;
 const oldLeft=panel.offsetLeft, right=stage.clientWidth-oldLeft-oldWidth;
 view=next;
 panel.classList.toggle('graph-wide',next==='graph');
 if(!mobile()){panel.style.width=(next==='graph'?680:380)+'px';panel.style.left=Math.max(16,stage.clientWidth-(next==='graph'?680:380)-right)+'px';panel.style.right='auto';}
 render(); if(next==='graph') fitGraph(); requestAnimationFrame(fitPosition);
}
function render() {
 renderSources(); const names=outputNames();
 $('orbCount').hidden=!collection.length; $('orbCount').textContent=collection.length;
 $('shelfSummary').textContent=collection.length?collection.length+' 项来源 · '+pretty(totalSize(collection)):'还没有文件，先放进来一些';
 $('fileStats').textContent=fileCount(collection)+' 个文件 · '+pretty(totalSize(collection));
 $('clear').disabled=!collection.length; $('pack').disabled=!collection.length||!!task;
 $('pack').querySelector('span').textContent=task?'本次任务正在打包':'检查并打包';
 $('listView').classList.toggle('selected',view==='list');$('graphView').classList.toggle('selected',view==='graph');
 $('listContent').hidden=view!=='list';$('graphContent').hidden=view!=='graph';
 const issues=unavailable();
 $('listContent').innerHTML=(issues.length?'<button class="issue-strip" data-action="issues">'+icon('alert')+'<span>'+issues.length+' 项来源需要处理</span>'+icon('chevron')+'</button>':'')+(collection.length?collection.map(f=>'<div class="entry '+(f.available===false?'unavailable':'')+'" data-entry="'+f.id+'" role="button" tabindex="0" aria-label="查看 '+esc(f.name)+'">'+fileIcon(f)+'<div class="entry-name"><b>'+esc(f.name)+(task&&!task.ids.includes(f.id)?' <span class="queued-tag">下次打包</span>':'')+'</b><small>'+(f.available===false?(skipIds.has(f.id)?'本次将跳过':'原路径已变化，请重新定位'):esc(f.path.replace('/'+f.name,'')))+'</small></div>'+(names.get(f.id)!==f.name?'<span class="rename-tag">自动编号</span>':'<span class="entry-size">'+pretty(f.size)+'</span>')+'<button class="remove" data-remove="'+f.id+'" aria-label="移除 '+esc(f.name)+'">'+icon('close')+'</button></div>').join(''):'<div class="empty"><span class="empty-icon">'+icon('box')+'</span><b>先把需要的文件放进来</b><small>跨文件夹拖入，或用快捷键直接收集<br>整理好后，一次打包带走</small></div>');
 $('bridgeBanner').hidden=!bridgeMissing; $('statusDot').classList.toggle('warn',bridgeMissing);
 $('connectionStatus').textContent=bridgeMissing?'文件管理器待连接':'本地收集 · 已连接';
 $('shortcutLabel').textContent=shortcut.label;
 $('pin').classList.toggle('active',pinned);$('pin').setAttribute('aria-pressed',String(pinned));
 renderTask(); renderResult(); if(view==='graph') renderGraph(); requestAnimationFrame(fitPosition);
}
function renderGraph() {
 if(!collection.length){$('graphCanvas').innerHTML='<div class="empty-graph">先收集一些文件，再查看文件全景</div>';$('graphDetail').innerHTML='只读全景 · 点击节点查看来源';return;}
 const folderEntry=collection.find(f=>f.children);
 const other=collection.filter(f=>f!==folderEntry);
 const nodes=[], paths=[];
 nodes.push('<button class="graph-node root" style="left:298px;top:140px;width:112px" data-node="root"><span>'+icon('box')+'<small>'+collection.length+' 项 · '+fileCount(collection)+' 个文件</small></span></button>');
 if(folderEntry) {
  nodes.push('<button class="graph-node folder '+(graphSelected===folderEntry.id?'selected':'')+'" data-node="'+folderEntry.id+'" style="left:148px;top:148px;width:116px">'+icon('folder')+'<span>'+esc(folderEntry.name)+'<small>'+folderEntry.children.length+' 个文件 · '+(graphExpanded?'收起':'展开')+'</small></span></button>');
  paths.push('M298 171 C280 171 282 171 264 171');
  if(graphExpanded) folderEntry.children.forEach((f,i)=>{
   const y=35+i*103;
   nodes.push('<button class="graph-node image '+(graphSelected===f.id?'selected':'')+'" data-node="'+f.id+'" style="left:12px;top:'+y+'px;width:116px">'+icon('file')+'<span>'+esc(f.name)+'<small>'+pretty(f.size)+'</small></span></button>');
   paths.push('M148 171 C135 171 143 '+(y+22)+' 128 '+(y+22));
  });
 }
 other.slice(0,5).forEach((f,i)=>{
  const y=other.length===1?148:20+i*(270/Math.max(1,other.length-1));
  nodes.push('<button class="graph-node '+(graphSelected===f.id?'selected':'')+'" data-node="'+f.id+'" style="left:462px;top:'+y+'px;width:163px">'+icon('file')+'<span>'+esc(outputNames().get(f.id))+'<small>'+pretty(f.size)+'</small></span></button>');
  paths.push('M410 171 C438 171 430 '+(y+22)+' 462 '+(y+22));
 });
 $('graphCanvas').innerHTML='<svg class="graph-lines" viewBox="0 0 640 335">'+paths.map(d=>'<path d="'+d+'"/>').join('')+'</svg>'+nodes.join('');
 const chosen=collection.find(f=>f.id===graphSelected)||(folderEntry&&folderEntry.children.find(f=>f.id===graphSelected));
 $('graphDetail').innerHTML=chosen?'<div><b>'+esc(chosen.name)+' · '+pretty(chosen.size)+'</b><small>'+esc(chosen.path||folderEntry.path+'/'+chosen.name)+'</small></div><button data-reveal="'+chosen.id+'">定位来源 '+icon('arrow')+'</button>':'<div><b>文件全景</b><small>只读 · 展开文件夹，核对文件与最终打包路径</small></div>';
 $('graphViewport').style.height=(mobile()?295:Math.max(170,Math.min(335,$('desktop').clientHeight-390-(task?85:result?65:0))))+'px';
 applyGraphTransform();
}
function applyGraphTransform() {
 $('graphCanvas').style.transform='translate('+graphPan.x+'px,'+graphPan.y+'px) scale('+graphZoom+')';
 $('zoomLevel').textContent=Math.round(graphZoom*100)+'%';
}
function fitGraph() {
 graphZoom=Math.min(1,($('graphViewport').clientWidth-20)/640,($('graphViewport').clientHeight-20)/335);
 graphPan={x:($('graphViewport').clientWidth-640*graphZoom)/2,y:($('graphViewport').clientHeight-335*graphZoom)/2};applyGraphTransform();
}
function zoomGraph(delta) {
 const before=graphZoom, after=Math.min(1.7,Math.max(.35,before+delta));
 const cx=$('graphViewport').clientWidth/2, cy=$('graphViewport').clientHeight/2;
 graphPan={x:cx-(cx-graphPan.x)*after/before,y:cy-(cy-graphPan.y)*after/before};graphZoom=after;applyGraphTransform();
}
function openModal(type,fileId) {
 if($('modalLayer').hidden)lastFocus=document.activeElement;
 modalView=type;const close='<button class="icon-button" data-action="close" aria-label="关闭对话框">'+icon('close')+'</button>';
 let content='';
 if(type==='pack') {
  if(unavailable().length){openModal('issues');return;}
  const included=collection.filter(f=>f.available!==false), names=outputNames(included);
  content='<div class="modal-heading"><div><h2>打包，准备出发。</h2><p class="subtitle">'+included.length+' 项来源 · '+fileCount(included)+' 个文件 · '+pretty(totalSize(included))+'</p></div>'+close+'</div><label for="archiveName">压缩包名称</label><div class="field-row"><input id="archiveName" value="'+esc(config.name)+'" autocomplete="off"><span>.'+extension()+'</span></div><label>保存到</label><div class="field-row"><button data-action="choose-folder">'+icon('folder')+'<span>'+esc(config.directory)+'</span>'+icon('chevron')+'</button></div><label>压缩格式</label><div class="format-options">'+['ZIP','7z','tar.gz'].map(f=>'<button data-format="'+f+'" class="'+(config.format===f?'chosen':'')+'">'+f+'<small>'+({ZIP:'通用，方便分享','7z':'更紧凑的体积','tar.gz':'适合 Linux'}[f])+'</small></button>').join('')+'</div><label>包内目录预览</label><div class="output-tree">'+included.map(f=>'<span>'+ (f.children?'▸ ':'　')+esc(names.get(f.id))+(f.children?'/　· '+f.children.length+' 个文件':'')+'</span>').join('')+'</div><span class="hint">原文件保留在原位置'+(skipIds.size?' · 本次跳过 '+skipIds.size+' 项不可用来源':'')+'</span><div class="modal-actions"><button class="quiet" data-action="close">再整理一下</button><button class="primary" data-action="start-pack">'+icon('box')+'开始打包</button></div>';
 } else if(type==='folder') {
  content='<div class="modal-heading"><h2>保存到哪里？</h2>'+close+'</div><p class="subtitle">选择演示中的输出位置</p><div class="folder-choices">'+['下载','桌面','文档'].map(n=>'<button data-directory="~/'+n+'">'+icon('folder')+n+'</button>').join('')+'</div><button class="quiet" data-action="back-pack">返回打包设置</button>';
 } else if(type==='issues') {
  content='<div class="modal-heading"><div><h2>先处理这 '+unavailable().length+' 项</h2><p class="subtitle">来源位置发生变化，重新定位后即可继续。</p></div>'+close+'</div>'+unavailable().map(f=>'<div class="issue-item"><b>'+esc(f.name)+'</b><p>原路径已不可用<br>'+esc(f.path)+'</p><button data-relocate="'+f.id+'">'+icon('folder')+'重新定位</button> <button data-skip="'+f.id+'">本次跳过</button></div>').join('')+'<div class="modal-actions"><button class="quiet" data-action="close">返回收集清单</button></div>';
 } else if(type==='settings') {
  content='<div class="modal-heading"><div><h2>让它顺手一点</h2><p class="subtitle">少量设置，保持轻盈。</p></div>'+close+'</div><div class="settings-row"><div><b>收集选中文件</b><small>在文件管理器中选中，再按快捷键</small></div><button class="small-button" data-action="capture-key" id="keyCapture">'+esc(shortcut.label)+'</button></div><div class="settings-row"><div><b>登录后启动</b><small>默认关闭，按需开启</small></div><button role="switch" aria-label="登录后启动" aria-checked="'+autostart+'" class="toggle" data-action="autostart"></button></div><div class="settings-row"><div><b>悬浮面板置顶</b><small>收集时保持在手边</small></div><button role="switch" aria-label="悬浮面板置顶" aria-checked="'+pinned+'" class="toggle" data-action="pin-setting"></button></div><div class="status-line">'+icon(bridgeMissing?'alert':'check')+(bridgeMissing?'文件管理器连接待刷新':'快捷键已注册 · 文件管理器已连接')+'</div><button class="text-button" data-action="bridge">查看连接状态 '+icon('arrow')+'</button><div class="modal-actions"><button class="primary" data-action="close">完成</button></div>';
 } else if(type==='bridge') {
  content='<div class="modal-heading"><div><h2>快捷键已经收到</h2><p class="subtitle">还差一步：让文件管理器加载收集桥接。</p></div>'+close+'</div><div class="status-line">'+icon('check')+'快捷键：已注册</div><div class="issue-item"><b>文件管理器：尚未连接</b><p>如果 python3-nautilus 已安装，无需重复安装。等待文件操作结束后退出 Nautilus 后台进程，再重新打开“文件”。</p><pre>nautilus -q</pre></div><p class="hint">本页是连接流程演示，不会执行系统命令。</p><div class="modal-actions"><button class="quiet" data-action="close">稍后处理</button><button class="primary" data-action="recheck">'+icon('check')+'模拟重新连接</button></div>';
  if(!bridgeMissing)content='<div class="modal-heading"><div><h2>连接已经就绪</h2><p class="subtitle">在左侧演示文件窗口选择文件，再按收集快捷键。</p></div>'+close+'</div><div class="status-line">'+icon('check')+'快捷键已注册 · 文件管理器已连接</div><div class="modal-actions"><button class="primary" data-action="close">完成</button></div>';
 } else if(type==='clear') {
  content='<div class="modal-heading"><h2>清空收集清单？</h2>'+close+'</div><p class="subtitle">仅移除本次收集记录，原文件保留在原位置。</p><div class="modal-actions"><button class="quiet" data-action="close">保留</button><button class="primary" data-action="confirm-clear">清空清单</button></div>';
 } else if(type==='report'&&result) {
  const renamed=result.entries.filter(f=>result.names.get(f.id)!==f.name);
  content='<div class="modal-heading"><div><h2>这次，全部带上了。</h2><p class="subtitle">'+esc(result.output)+'</p></div>'+close+'</div><div class="report-stats"><div><strong>'+fileCount(result.entries)+'</strong><small>已写入</small></div><div><strong>'+result.skipped+'</strong><small>已跳过</small></div><div><strong>0</strong><small>失败</small></div></div><label>输出位置</label><div class="status-line">'+icon('folder')+esc(result.directory)+'</div>'+(renamed.length?'<label>同名文件已自动编号</label><div class="output-tree">'+renamed.map(f=>'<span>'+esc(f.name)+' → '+esc(result.names.get(f.id))+'</span>').join('')+'</div>':'')+'<div class="modal-actions"><button class="quiet" data-action="close">完成</button><button class="primary" data-action="open-output">'+icon('folder')+'打开所在文件夹</button></div>';
 } else if(type==='preview') {
  const f=collection.find(f=>f.id===fileId);if(!f)return;
  content='<div class="modal-heading"><div><h2>'+esc(f.name)+'</h2><p class="subtitle">'+(f.children?'文件夹 · '+f.children.length+' 个文件':pretty(f.size))+'</p></div>'+close+'</div><div class="preview-art"></div><div class="detail-table"><div><b>来源</b>'+esc(f.path)+'</div><div><b>打包路径</b>'+esc(outputNames().get(f.id))+(f.children?'/':'')+'</div></div>'+(f.children?'<div class="output-tree">'+f.children.map(c=>'<span>'+esc(c.name)+'　'+pretty(c.size)+'</span>').join('')+'</div>':'')+'<div class="modal-actions"><button class="quiet" data-action="close">关闭</button><button class="primary" data-reveal="'+f.id+'">'+icon('folder')+'定位来源</button></div>';
 }
 $('modal').innerHTML=content;$('modalLayer').hidden=false;
 if(type==='pack'){
  const names=outputNames(),tree=$('modal').querySelector('.output-tree');
  tree.innerHTML=collection.filter(f=>f.available!==false).map(f=>f.children?'<button class="tree-folder" data-tree="'+f.id+'" aria-expanded="'+packFolders.has(f.id)+'">'+(packFolders.has(f.id)?'▾ ':'▸ ')+esc(names.get(f.id))+'/ · '+f.children.length+' 个文件</button>'+(packFolders.has(f.id)?f.children.map(c=>'<span class="tree-child">'+esc(c.name)+'</span>').join(''):''):'<span>　'+esc(names.get(f.id))+'</span>').join('');
 }
 const field=$('archiveName');if(field)field.oninput=()=>config.name=field.value;
 requestAnimationFrame(()=>($('modal').querySelector('input,button')||$('modal')).focus());
}
function closeModal() { $('modalLayer').hidden=true; modalView='';capturing=false; if(lastFocus&&document.contains(lastFocus))lastFocus.focus(); }
function startPack() {
 if(!config.name.trim()){toast('请先填写压缩包名称');$('archiveName').focus();return;}
 const entries=structuredClone(collection.filter(f=>f.available!==false));
 if(!entries.length)return;
 closeModal();setView('list');result=null;
 task={entries,names:outputNames(entries),ids:entries.map(f=>f.id),progress:0,output:config.name+'.'+extension(),directory:config.directory,skipped:skipIds.size};
 render();caption('03 / 一次打包','打包使用本次快照；继续收集的文件，会留给下一次。');
 taskTimer=setInterval(()=>{
  if(!task)return;
  task.progress=Math.min(100,task.progress+4);renderTask();
  if(task.progress>=100){clearInterval(taskTimer);result=task;task=null;skipIds.clear();const output={id:'output',name:result.output,folder:'output',kind:'archive',size:totalSize(result.entries)*.72,path:result.directory+'/'+result.output};const previous=files.findIndex(f=>f.id==='output');if(previous>=0)files.splice(previous,1,output);else files.push(output);render();toast('打包完成 · 收集清单已保留');}
 },280);
}
function renderTask() {
 $('taskCard').hidden=!task;
 if(task)$('taskCard').innerHTML='<div class="task-top"><span>'+icon('box')+'正在打包 '+task.progress+'%</span><button id="cancelTask">取消本次</button></div><div class="progress-track"><i style="width:'+task.progress+'%"></i></div><small>'+fileCount(task.entries)+' 个文件 · 新收集内容用于下次任务</small>';
 if($('cancelTask'))$('cancelTask').onclick=()=>{clearInterval(taskTimer);task=null;render();toast('已取消本次打包，收集清单已保留');};
}
function renderResult() {
 $('resultCard').hidden=!result||!!task;
 if(result&&!task)$('resultCard').innerHTML='<span class="success-mark">'+icon('check')+'</span><div><strong>打包完成</strong><small>'+esc(result.output)+' · '+fileCount(result.entries)+' 个文件</small></div><button data-action="report">查看报告 '+icon('arrow')+'</button>';
}
function reset() {
 tourToken++;clearInterval(taskTimer);clearTimeout(toastTimer);task=null;result=null;collection=[];selected.clear();skipIds.clear();folder='project';bridgeMissing=false;graphSelected=null;graphExpanded=true;view='list';config={format:'ZIP',directory:'~/下载',name:'GatherPack_20261022_142600'};pinned=true;autostart=false;closeModal();$('toast').hidden=true;const outputIndex=files.findIndex(f=>f.id==='output');if(outputIndex>=0)files.splice(outputIndex,1);
 $('shelf').removeAttribute('style');$('shelf').classList.remove('graph-wide');$('orbDock').removeAttribute('style');showShelf(false);render();
 shortcut={key:'e',ctrl:true,alt:true,shift:true,meta:false,label:'Ctrl Alt Shift E'};packFolders.clear();render();
 caption('01 / 轻量收集','选择左侧文件，拖入收集点；手机上也可以点击“收集选中项”。');
 document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('active',b.dataset.scene==='collect'));
}
function markIssue() {ensureSample();const first=collection.find(f=>!f.children);first.available=false;skipIds.delete(first.id);showShelf();setView('list');render();toast('演示场景：一项来源路径已变化');}
function locate(id) {
 const file=collection.find(f=>f.id===id)||files.find(f=>f.children&&f.children.some(c=>c.id===id));
 if(file){folder=file.folder;selected=new Set([file.id]);renderSources();}
 closeModal();toast('已在演示文件窗口中定位来源');
}
document.querySelectorAll('[data-folder]').forEach(button=>button.onclick=()=>{folder=button.dataset.folder;selected.clear();renderSources();});
$('sourceGrid').onclick=event=>{
 const card=event.target.closest('[data-source]');if(!card)return;
 const id=card.dataset.source;
 if(!(event.ctrlKey||event.metaKey||mobile()))selected=new Set([id]);else selected.has(id)?selected.delete(id):selected.add(id);
 renderSources();
};
$('sourceGrid').onkeydown=event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();event.target.click();}};
$('selectAll').onclick=()=>{const visible=files.filter(f=>f.folder===folder);selected=new Set(visible.every(f=>selected.has(f.id))?[]:visible.map(f=>f.id));renderSources();};
$('collectSelected').onclick=()=>{addFiles([...selected]);showShelf();};
$('addSample').onclick=()=>{const next=files.find(f=>!collection.some(c=>c.id===f.id));if(next)addFiles([next.id],'添加');else toast('全部示例文件已加入');};
$('listView').onclick=()=>setView('list');$('graphView').onclick=()=>setView('graph');
$('collapse').onclick=()=>showShelf(false);$('settings').onclick=()=>openModal('settings');
$('pin').onclick=()=>{pinned=!pinned;render();toast(pinned?'演示：面板保持置顶':'演示：取消面板置顶');};
$('clear').onclick=()=>openModal('clear');$('pack').onclick=()=>openModal('pack');
$('bridgeHelp').onclick=()=>openModal('bridge');
$('scenario').onclick=()=>markIssue();$('reset').onclick=reset;
$('bridgeCase').onclick=()=>{bridgeMissing=true;showShelf();render();toast('演示场景：快捷键已注册，文件管理器尚未连接');};
$('shelf').addEventListener('click',event=>{
 const remove=event.target.closest('[data-remove]');
 if(remove){const index=collection.findIndex(f=>f.id===remove.dataset.remove);undoItem={file:collection[index],index};collection.splice(index,1);render();toast('已从清单移除，原文件保留',true);return;}
 const action=event.target.closest('[data-action]');
 if(action){if(action.dataset.action==='issues')openModal('issues');if(action.dataset.action==='report')openModal('report');return;}
 const node=event.target.closest('[data-node]');
 if(node){graphSelected=node.dataset.node;if(collection.some(f=>f.id===graphSelected&&f.children))graphExpanded=!graphExpanded;renderGraph();return;}
 const reveal=event.target.closest('[data-reveal]');if(reveal){locate(reveal.dataset.reveal);return;}
 const entry=event.target.closest('[data-entry]');if(entry)openModal('preview',entry.dataset.entry);
});
$('shelf').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-entry]')){event.preventDefault();openModal('preview',event.target.dataset.entry);}});
$('modal').onclick=event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.tree){packFolders.has(button.dataset.tree)?packFolders.delete(button.dataset.tree):packFolders.add(button.dataset.tree);openModal('pack');return;}
 if(button.dataset.format){config.format=button.dataset.format;openModal('pack');return;}
 if(button.dataset.directory){config.directory=button.dataset.directory;openModal('pack');return;}
 if(button.dataset.relocate){const f=collection.find(f=>f.id===button.dataset.relocate);f.available=true;f.path='~/文档/项目交付/归档/'+f.name;closeModal();render();toast('来源已重新定位，可以继续打包');return;}
 if(button.dataset.skip){skipIds.add(button.dataset.skip);closeModal();render();toast('本次将跳过该来源，收集记录保留');return;}
 if(button.dataset.reveal){locate(button.dataset.reveal);return;}
 switch(button.dataset.action){
  case 'close':closeModal();break;
  case 'choose-folder':openModal('folder');break;
  case 'back-pack':openModal('pack');break;
  case 'start-pack':startPack();break;
  case 'confirm-clear':collection=[];skipIds.clear();closeModal();render();toast('收集清单已清空');break;
  case 'capture-key':capturing=true;button.textContent='按下新的组合键…';break;
  case 'autostart':autostart=!autostart;openModal('settings');break;
  case 'pin-setting':pinned=!pinned;render();openModal('settings');break;
  case 'bridge':openModal('bridge');break;
  case 'recheck':bridgeMissing=false;closeModal();render();toast('演示：文件管理器已连接');break;
  case 'open-output':folder='output';selected=new Set(['output']);renderSources();closeModal();toast('演示：已打开输出所在文件夹');break;
 }
};
$('modalLayer').onclick=event=>{if(event.target===$('modalLayer'))closeModal();};
window.addEventListener('keydown',event=>{
 if(capturing){
  event.preventDefault();
  if(event.key==='Escape'){capturing=false;openModal('settings');return;}
  if(event.key.length===1&&(event.ctrlKey||event.altKey||event.metaKey)){
   shortcut={key:event.key.toLowerCase(),ctrl:event.ctrlKey,alt:event.altKey,shift:event.shiftKey,meta:event.metaKey,label:[event.ctrlKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',event.metaKey?'Meta':'',event.key.toUpperCase()].filter(Boolean).join(' ')};capturing=false;render();openModal('settings');
  }return;
 }
 if(event.key==='Escape'){if(!$('modalLayer').hidden)closeModal();else showShelf(false);return;}
 if(!$('modalLayer').hidden&&event.key==='Tab'){
  const fields=[...$('modal').querySelectorAll('button,input')].filter(f=>!f.disabled), first=fields[0],last=fields.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;
 }
 if(!$('modalLayer').hidden)return;
 if(event.key.toLowerCase()===shortcut.key&&event.ctrlKey===shortcut.ctrl&&event.altKey===shortcut.alt&&event.shiftKey===shortcut.shift&&event.metaKey===shortcut.meta){
  event.preventDefault();if(bridgeMissing){showShelf();toast('已收到快捷键 · 文件管理器连接待刷新');return;}addFiles([...selected]);return;
 }
 if(event.code==='Space'&&selected.size===1&&!event.target.matches('input,button')){event.preventDefault();const id=[...selected][0];if(collection.some(f=>f.id===id))openModal('preview',id);}
});
$('zoomIn').onclick=()=>zoomGraph(.15);$('zoomOut').onclick=()=>zoomGraph(-.15);$('fitGraph').onclick=fitGraph;
$('graphViewport').addEventListener('wheel',event=>{event.preventDefault();zoomGraph(event.deltaY<0?.08:-.08);},{passive:false});
let graphDrag=null;
$('graphViewport').addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;graphDrag={x:event.clientX,y:event.clientY,pan:{...graphPan}};event.currentTarget.setPointerCapture(event.pointerId);});
$('graphViewport').addEventListener('pointermove',event=>{if(!graphDrag)return;graphPan={x:graphDrag.pan.x+event.clientX-graphDrag.x,y:graphDrag.pan.y+event.clientY-graphDrag.y};applyGraphTransform();});
$('graphViewport').addEventListener('pointerup',()=>graphDrag=null);
function makeDraggable(handle,element,click) {
 let start=null,moved=false,ignoreClick=false;
 handle.addEventListener('pointerdown',event=>{if(event.target.closest('button')&&event.target.closest('button')!==handle)return;if(event.button!==0)return;start={x:event.clientX,y:event.clientY,left:element.offsetLeft,top:element.offsetTop};moved=false;handle.setPointerCapture(event.pointerId);});
 handle.addEventListener('pointermove',event=>{
  if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(Math.hypot(dx,dy)>5)moved=true;if(!moved)return;
  element.classList.add('dragging');element.style.right='auto';
  element.style.left=Math.max(8,Math.min(start.left+dx,$('desktop').clientWidth-element.offsetWidth-8))+'px';
  element.style.top=Math.max(38,Math.min(start.top+dy,$('desktop').clientHeight-element.offsetHeight-10))+'px';
 });
 handle.addEventListener('pointerup',()=>{ignoreClick=moved;start=null;element.classList.remove('dragging');setTimeout(()=>ignoreClick=false,0);});
 handle.addEventListener('pointercancel',()=>{start=null;element.classList.remove('dragging');});
 if(click)handle.onclick=()=>{if(!ignoreClick)click();};
}
makeDraggable($('shelfHandle'),$('shelf'));makeDraggable($('orb'),$('orbDock'),()=>showShelf());
$('sourceGrid').addEventListener('dragstart',event=>{
 const card=event.target.closest('[data-source]');if(!card)return;
 const ids=selected.has(card.dataset.source)?[...selected]:[card.dataset.source];
 event.dataTransfer.setData('application/x-gatherpack',JSON.stringify(ids));event.dataTransfer.effectAllowed='copy';
 $('dragGhost').textContent=ids.length+' 项 · 收集到 GatherPack';$('dragGhost').hidden=false;
 const blank=new Image();blank.src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';event.dataTransfer.setDragImage(blank,0,0);
});
document.addEventListener('dragover',event=>{
 $('dragGhost').style.left=event.clientX+'px';$('dragGhost').style.top=event.clientY+'px';
 if(!$('dragGhost').hidden){$('orbDock').classList.add('drop-ready');moveCursor(event);}
});
function stopDrag(){ $('dragGhost').hidden=true;$('orbDock').classList.remove('drop-ready'); }
document.addEventListener('dragend',stopDrag);document.addEventListener('drop',stopDrag);
for(const target of [$('orbDock'),$('shelf')]){
 target.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});
 target.addEventListener('drop',event=>{event.preventDefault();try{addFiles(JSON.parse(event.dataTransfer.getData('application/x-gatherpack')));showShelf();}catch{toast('在左侧演示文件窗口中选择文件再拖入');}stopDrag();});
}
function moveCursor(event){$('demoCursor').style.left=event.clientX+'px';$('demoCursor').style.top=event.clientY+'px';}
if(new URLSearchParams(location.search).has('record')){document.body.classList.add('recording');$('demoCursor').hidden=false;document.addEventListener('pointermove',moveCursor);document.addEventListener('pointerdown',()=>{$('demoCursor').classList.remove('click');void $('demoCursor').offsetWidth;$('demoCursor').classList.add('click');});}
document.querySelectorAll('[data-scene]').forEach(button=>button.onclick=()=>{
 tourToken++;document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('active',b===button));
 ensureSample();showShelf();
 if(button.dataset.scene==='graph'){setView('graph');caption('02 / 文件全景','展开文件夹、核对来源，让打包内容一眼可见。');}
 else if(button.dataset.scene==='pack'){setView('list');openModal('pack');caption('03 / 一次打包','先检查目录，再选择格式与保存位置。');}
 else {setView('list');caption('01 / 轻量收集','拖入或使用快捷键，把分散的文件收在一起。');}
});
$('tour').onclick=async()=>{
 reset();const token=tourToken, wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 caption('01 / 轻量收集','演示：来自不同文件夹的内容，持续加入一个收集清单。');
 selected=new Set(['brief','assets','budget']);renderSources();await wait(1000);if(token!==tourToken)return;
 addFiles([...selected]);showShelf();await wait(2200);if(token!==tourToken)return;
 folder='downloads';selected=new Set(['brief2','spec']);renderSources();await wait(900);if(token!==tourToken)return;
 addFiles([...selected]);await wait(1400);if(token!==tourToken)return;
 setView('graph');caption('02 / 文件全景','点击节点检查路径，滚轮缩放、拖动画布。');await wait(2600);if(token!==tourToken)return;
 graphSelected='brief2';renderGraph();await wait(1300);if(token!==tourToken)return;
 setView('list');openModal('pack');caption('03 / 一次打包','目录和同名处理提前可见，确认后再开始。');await wait(2600);if(token!==tourToken)return;
 startPack();await wait(7600);if(token!==tourToken)return;openModal('report');caption('完成 / 原文件与收集清单保留','这是交互原型，所有文件与打包结果均为示例。');
};
window.addEventListener('resize',()=>{fitPosition();if(view==='graph')fitGraph();});
window.prototypeDemo={caption,reset,getState:()=>({items:structuredClone(collection),selected:[...selected],view,expanded,task:task?{progress:task.progress,ids:[...task.ids]}:null,result:result?{written:fileCount(result.entries),output:result.output,skipped:result.skipped}:null,bridgeMissing,config:{...config}})};
render();
