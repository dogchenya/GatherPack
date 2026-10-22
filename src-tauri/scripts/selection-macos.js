ObjC.import('AppKit');
ObjC.import('Foundation');
function run() {
  try {
    if ($.NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier.js !== 'com.apple.finder') {
      throw new Error('请先在 Finder 中选中文件');
    }
    var finder = Application('Finder');
    var selected = finder.selection();
    if (!selected.length) throw new Error('请先选中文件或文件夹');
    var paths = [];
    var rejected = [];
    selected.forEach(function(item) {
      var url = $.NSURL.URLWithString(item.url());
      if (!url.isFileURL) { rejected.push(String(item.name()) + '：非本地项目，未加入'); return; }
      paths.push(url.path.js);
    });
    if ($.NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier.js !== 'com.apple.finder') {
      throw new Error('前台应用变化，请重试');
    }
    return JSON.stringify({ source: 'macos-finder', paths: paths, rejected: rejected, error: null });
  } catch (e) {
    return JSON.stringify({ source: 'macos-finder', paths: [], error: String(e) });
  }
}
