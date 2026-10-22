# Ubuntu 22.04 / 24.04 安装包兼容性

目标修复版本：**0.1.0-alpha.5**。最终下载入口在两套系统验证通过后更新。

alpha.4 的 Linux 程序由 Ubuntu 24.04 构建，ELF 实际要求 GLIBC 2.39；Ubuntu 22.04 提供 GLIBC 2.35，因此不能在 22.04 运行。这是二进制构建基线问题，不能通过仅修改 Debian 依赖声明修复，也不要求用户升级系统 glibc。

本次修改：

- 在 Ubuntu 22.04 构建 Linux `.deb` 与 AppImage，保留 WebKitGTK 4.1 依赖。
- 用 `scripts/check-glibc-linux.py` 核对主程序及 AppImage 中所有 ELF 的实际 glibc 版本要求，拒绝超过 2.35 的构建；旧 alpha.4 包已用于确认此门禁能捕获 GLIBC 2.39。
- 同一个 `.deb` 分别在 Ubuntu 22.04 与 24.04 安装，核对动态库解析，执行真实 IPC、普通启动迁移和卸载，保存独立 CI 证据。
- Nautilus 桥接按系统选择 GTK3 / GTK4。GTK3 路径读取 Nautilus 42 文件视图的实时 GObject `selection` 属性，以 GLib 与 FileInfo 的公开 C API 处理其非 introspectable 指针，并释放所有返回记录；不缓存路径、不读写剪贴板、不依赖私有结构偏移。
- Linux 下载继续按 `.deb`、AppImage、对应源码和校验/授权材料拆分。

构建最旧支持系统的原则及依赖要求见 [Tauri Debian 分发说明](https://v2.tauri.app/distribute/debian/)。GTK3 选择属性的行为已对照 GNOME 官方 Nautilus 42.6 源码中的 `nautilus-view.c` 和 `nautilus-files-view.c`，实现为独立 API 调用，未复制其 GPL 实现。

本文件在最终包验证后补充运行编号、哈希及实测范围；在此之前不将新包标为通过。
