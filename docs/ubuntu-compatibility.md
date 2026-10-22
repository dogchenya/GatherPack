# Ubuntu 22.04 / 24.04 安装包兼容性

已验证修复版本：**0.1.0-alpha.5**。[下载最终安装包](https://github.com/dogchenya/GatherPack/actions/runs/39768713022)。

alpha.4 的 Linux 程序由 Ubuntu 24.04 构建，ELF 实际要求 GLIBC 2.39；Ubuntu 22.04 提供 GLIBC 2.35，因此不能在 22.04 运行。这是二进制构建基线问题，不能通过仅修改 Debian 依赖声明修复，也不要求用户升级系统 glibc。

本次修改：

- 在 Ubuntu 22.04 构建 Linux `.deb` 与 AppImage，保留 WebKitGTK 4.1 依赖。
- 用 `scripts/check-glibc-linux.py` 核对主程序及 AppImage 中所有 ELF 的实际 glibc 版本要求，拒绝超过 2.35 的构建；旧 alpha.4 包已用于确认此门禁能捕获 GLIBC 2.39。
- 同一个 `.deb` 分别在 Ubuntu 22.04 与 24.04 安装，核对动态库解析，执行真实 IPC、普通启动迁移和卸载，保存独立 CI 证据。
- Nautilus 桥接按系统选择 GTK3 / GTK4。GTK3 路径读取 Nautilus 42 文件视图的实时 GObject `selection` 属性，以 GLib 与 FileInfo 的公开 C API 处理其非 introspectable 指针，并释放所有返回记录；不缓存路径、不读写剪贴板、不依赖私有结构偏移。
- Linux 下载继续按 `.deb`、AppImage、对应源码和校验/授权材料拆分。

构建最旧支持系统的原则及依赖要求见 [Tauri Debian 分发说明](https://v2.tauri.app/distribute/debian/)。GTK3 选择属性的行为已对照 GNOME 官方 Nautilus 42.6 源码中的 `nautilus-view.c` 和 `nautilus-files-view.c`，实现为独立 API 调用，未复制其 GPL 实现。

## 最终验证

- 四目标安装包构建：[39762982550](https://github.com/dogchenya/GatherPack/actions/runs/39762982550)，构建提交 `6fe951e142d29c8aa819e39f5429053133d0b248`。其中四个安装包任务与检查任务全部通过。
- Ubuntu 双系统安装运行及最终下载：[39768713022](https://github.com/dogchenya/GatherPack/actions/runs/39768713022)，全部任务通过；安装包重新上传前已核对原始 SHA256、版本与构建提交，保留原始字节。
- 两种 Mac 架构的实际 DMG 包内运行：[39764428170](https://github.com/dogchenya/GatherPack/actions/runs/39764428170)。
- 同一个 Debian 包 SHA256：`f31f000ff8de3a10432ebc92171ef37e709bece42319e8a86e0b089c027fc2d2`；安装程序的最高 GLIBC 需求为 2.34，低于或等于 2.35。
- Ubuntu 22.04 与 24.04 分别通过已安装程序 27 项真实 IPC、3 项普通启动迁移；卸载后程序移除。
- 两套独立 GNOME/X11 桌面均对最终 .deb / AppImage 完成各 70 项桌面断言；GTK3 的图标与列表视图、GTK4 视图另通过实时选择测试。
- AppImage 共 179 个 ELF 通过 glibc 上限检查；对应源码归档 2265 个文件校验通过。

初次构建附带的普通启动迁移测试错误地要求用户目录桥接文件，而 Debian 已提供同版本系统桥接，因此该用例在 22.04 未通过，另一旧用例在新版双系统复验通过后停止。修正后的用例同时检查系统或用户桥接、迁移状态及普通启动窗口；新版双系统复验使用相同安装包，全部通过。原始失败记录保留，不将其标成成功。

完整哈希、逐系统结果及验证范围见 [ci-alpha.5.json](validation/ci-alpha.5.json)。Linux 桌面测试适用于独立 GNOME/X11 会话，不将其等同于 Wayland 验收。Windows/macOS 完整文件管理器桌面验收仍按原记录保留缺口。
