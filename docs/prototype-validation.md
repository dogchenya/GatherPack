# GatherPack 开发与验证记录

当前 GatherPack alpha.4 的名称同步、旧配置兼容与验证进度见 [品牌迁移记录](brand-migration.md)。下文保留 easy_pack alpha.3 的历史环境、安装包名称、原始哈希与运行编号，不将其当作新品牌版本的测试证据。

历史记录日期：2026-10-22。历史候选：**0.1.0-alpha.3**。用户已恢复开发并要求持续完成验证；本文按实际证据记录，不将缺少环境的项目标记通过。

## 当前实现

一期清单、文件夹递归、ZIP/7z/tar.gz、只读目录预览、问题确认、改名映射、冻结任务、后台进度/取消、源文件与输出保护、持久化、报告、桌面快捷键/拖入/托盘/设置均已接入。

本轮补充 Nautilus 进程内实时选择桥接，核对前台 XID/进程及当前映射视图，支持多窗口与多标签页，不缓存选择、不读取剪贴板。桥接独立 MIT 实现；.deb 安装系统扩展，源码/AppImage 首次启动准备用户扩展，提示重新打开 Nautilus，不会自动关闭文件管理器。

补充实际文件句柄类型检查与 Unix O_NOFOLLOW/Windows 重解析点防护，阻止计划目录在打包前被换成链接后越界读取；重新计算跳过问题后的空目录数量。Linux 没有 StatusNotifierWatcher 时禁止隐藏到不可见托盘，保留窗口入口。普通启动读取实际开机启动状态，设置未变时不改写系统配置。

修复 Linux 置顶悬浮窗遮挡原生选择器、GTK 将收起窗口保持为 200×200，以及 AppImage 环境变量污染系统 Python 导致选择桥接无法启动的问题。选择器绑定父窗口，打开期间暂时取消置顶，关闭后恢复；Linux 收起窗口使用固定尺寸约束，实际验证为 104×112。保存路径输入框与选择按钮有独立可访问名称。

## 实际环境

| 环境 | 版本与范围 |
| --- | --- |
| Windows | x64，注册表 Windows 10 Home China / 25H2 / build 26200；产品名称可能保留旧命名，记录原始信息 |
| Windows 工具链 | Rust 1.98.1、Node.js 24.19.0、pnpm 11.25.0、NSIS 3.13 |
| Linux | WSL2 Ubuntu 22.04 宿主中的独立 Ubuntu 24.04 rootfs；内核 6.6.87.2；x86_64；非 root 测试账户 uid 2000 |
| Linux 桌面 | Xvfb 1280×900、X11；Openbox 与 GNOME Shell 46.0-0ubuntu6~24.04.16 分别测试；Nautilus 1:46.4-0ubuntu0.2 |
| Linux WebView | WebKitGTK 2.52.6-0ubuntu0.24.04.1 |
| Linux 工具链 | 官方 Rust 1.98.1；复用锁定 Cargo 下载缓存并离线编译，校验由 Cargo 执行；前端生产资源由 Node.js 24 构建 |
| 远端 macOS | macOS 15.7.9 / 24G830；GitHub Actions macos-15 ARM64 与 macos-15-intel x64；provenance 分别确认 aarch64-apple-darwin 与 x86_64-apple-darwin 原生 host |

GNOME Shell 使用独立 D-Bus 与无 logind 的测试会话，不是物理机完整登录会话。未因此宣称所有 GNOME/Wayland 环境通过。准备环境时，跨 Shell 变量传递错误曾改写 WSL 宿主 sources.list，已立即恢复 Ubuntu 22.04 对应源，未执行宿主发行版升级；后续使用独立脚本明确根目录。宿主仅新增 debootstrap，开发依赖与测试安装均位于独立 rootfs。

## 已通过检查

| 检查 | 实际结果 |
| --- | --- |
| TypeScript/Vite 与 Rust 格式 | 生产构建、cargo fmt --all --check 通过 |
| Windows 核心与持久化 | 核心 5 项、桌面持久化 1 项通过；2 项大文件默认忽略，另行执行 |
| Linux 核心回归 | 7 项通过，包含 Unix 链接/非法名称与目录替换链接防护 |
| 超过 4 GiB | Windows 与 Linux 分别实测 ZIP64、7z、tar.gz 流式写入和解压逐块校验；Linux 最终 2 项组合用时 212.38 秒 |
| 模拟 IPC 界面集成 | Edge headless：收集、拒绝文本/网页拖入、重名预览、问题确认门禁、单次格式覆盖、任务隔离、报告、收起通过，无页面运行错误 |
| Windows 真实 IPC | 安装后的 alpha.3：核心 22 项、重启恢复 5 项通过；真实 Rust 命令与磁盘，使用隔离配置 |
| Linux 真实 IPC | release、安装后的 .deb 程序、最终 AppImage 分别通过核心 22 项与恢复 5 项 |
| Linux 实际桌面 | Openbox 与 GNOME Shell 均通过早期 15 项选择/热键/拖入检查；最终 release、安装后的 .deb、AppImage 在 GNOME Shell 分别通过完整 70 项桌面断言，包含原生文件/文件夹/保存对话框、完整打包报告、实际开机启动注册开关、104×112 收起、移动/展开及菜单退出 |
| Linux 文件系统故障 | uid 2000 下 17 项通过：真实 64 KiB tmpfs 写满（三格式）、chmod 000 输入、只读输出目录、明确跳过、递归/外部链接、非法/大小写/Unicode 冲突及清理 |
| Windows 安装/卸载 | alpha.3 NSIS 静默安装到唯一目录；核对 exe、依赖与 NSIS 声明；安装后执行全部真实 IPC；静默卸载后 exe 与注册项已移除 |
| Linux 安装/卸载 | alpha.3 .deb 安装、依赖、系统桥接与源码一致、声明齐全，原始 Rust 标准库声明匹配；安装后真实 IPC 27 项及桌面 70 项通过；dpkg 移除后 exe 和系统桥接不存在 |
| AppImage | 最终 alpha.3 在非 root 用户下以 extract-and-run 完成真实 IPC 27 项、桌面 70 项及重启；无需提供 FUSE 挂载权限；包内原始 Rust 标准库声明一致 |
| Cargo/npm 授权 | 531 项，missingLicenseText=[]；39 项明确提供 SPDX 完整条款与来源元数据，4 项同版本主包原始声明继承；完整 NSIS COPYING 并入声明 |
| AppImage 系统库 | 原始 copyright 与通用授权覆盖 126 个包，unresolved=[]；98 个确切源码包版本的原始压缩包、.dsc 与 Ubuntu 补丁保留，运行时原始声明及构建源码另附 |
| 最终交付核对 | Windows 安装包、Linux .deb/AppImage 与对应源码共 4 个文件的 SHA256 全部匹配；桌面验证记录绑定最终安装包哈希；对应源码归档逐一核对 2286 个源文件 |
| 远端 Windows / macOS | 构建提交 961a2fc：Windows、Mac ARM64、Mac Intel 的安装包构建、许可证门禁与各 27 项真实 IPC 均通过；下载的 Windows CI 安装包在本机再次完成安装/27 项 IPC/卸载 |
| Mac 最终 DMG | 两种架构在对应原生 runner 上挂载交付 DMG，核对 SHA256、源码提交、包内声明与原始 Rust 通知字节，直接执行包内应用，各通过 22 项核心及 5 项恢复断言，随后成功卸载卷 |
| 四目标 CI | [39734269501](https://github.com/dogchenya/easy_pack/actions/runs/39734269501) 全部通过：前端、格式、核心、ZIP64、Windows/Linux/Mac ARM64/Mac Intel 安装包及原生运行；四目标各 27 项，共 108 项真实 IPC 断言；下载产物 SHA256 与提交均匹配 |
| CI AppImage 声明 | CI 主机的实际打包库覆盖 124 个发行版包，unresolved=[]，对应 97 个确切源码包版本；这些数量与此前独立 rootfs 构建分别记录，不能混用其哈希 |
| CI Linux 安装包复验 | 下载 CI 的 .deb/AppImage 后，在上述独立 GNOME/X11 会话分别通过安装包内真实 IPC 27 项及完整桌面 70 项；.deb 卸载成功；对应源码归档 2283 个文件逐一核对通过。GUI 报告绑定此次 CI 包的确切 SHA256 |

真实 IPC 场景包括三格式、去重/重叠、冻结计划期间清空或追加清单、第二任务拒绝、开始写入后的取消、目标冲突与禁止写进源目录、过期计划拒绝、失效来源与明确跳过、默认设置/上次目录/报告恢复。原生侧另外核对源字节、格式签名、取消无输出、临时文件清理与持久化磁盘记录。

写入数是普通文件临时写入记录，只有 delivered=true 表示输出交付；链接、不可遍历目录及无法判定类型的失效路径保留问题明细，不猜测内部文件数量。报告保留本机，不写入共享包。

Windows 隐藏启动曾观察到 WebView 退出时窗口注销错误 1412，但握手与进程退出正常。Linux 独立桌面记录部分 portal/PipeWire/Tracker 警告；通过项以断言、磁盘校验与退出码为依据。开发中首次直接 cargo release 未启用 custom-protocol，加载开发 URL 失败；已补充发布 feature 与脚本，最终包使用生产资源并通过安装后验证。

## 交付物与证据

- Windows 安装包与 SHA256：artifacts/x86_64-pc-windows-msvc/，选择文件名含 alpha.3 的候选。
- Linux .deb、AppImage、对应源码 tar 与 SHA256：artifacts/x86_64-unknown-linux-gnu/。
- Linux 对应源码归档约 612 MiB，应与 AppImage 一起分发。包内包含 usr/share/doc/easy-pack/bundled-libraries/ 与 appimage-runtime/ 声明。
- Windows 安装报告：artifacts/validation/windows-install-report.json；安装后真实 IPC：artifacts/validation/native-45L89y/。
- Linux 最终桌面报告：artifacts/validation/linux/linux-deb-gui-report.json、linux-appimage-gui-report.json；对应截图为 linux-deb-gui.png、linux-appimage-gui.png。
- 最终包及源码验证：artifacts/validation/release-checks.json、linux/linux-packages-report.json、linux/source-archive-report.json；完整执行日志 linux-final-packages-validation.log。
- Linux 故障/大文件/安装与 AppImage 日志：artifacts/validation/linux-faults.json、linux-large-files.log、linux-install-run.log、linux-appimage-native.log。
- Linux compact 原生证据导出至 artifacts/validation/linux/native-*/，不导出测试源大文件内容。
- UI 截图 artifacts/validation/ui-report.png 使用模拟数据，不能替代原生证据。
- 可公开核对的本地断言与哈希：[local-alpha.3.json](validation/local-alpha.3.json)。原始大体积测试夹具未纳入源码。
- 可公开核对的 CI 产物、安装复验及桌面断言：[ci-alpha.3.json](validation/ci-alpha.3.json)。本地完整复验报告位于 artifacts/ci/39734269501/linux-installed/；脚本 verify-ci-artifacts.mjs 核对四目标的提交、哈希、原生主机、原始声明及安装验证。
- 远端构建与运行：[Actions 39734269501](https://github.com/dogchenya/easy_pack/actions/runs/39734269501)；Mac 交付包验证：[Actions 39735416940](https://github.com/dogchenya/easy_pack/actions/runs/39735416940)。安装包与原生 JSON 报告分别保存在 Actions Artifacts，本地下载于 artifacts/ci/39734269501/。

2026-10-22 用户完成 GitHub CLI 设备授权，确认账号 dogchenya；按已批准的公开源码要求创建 [dogchenya/easy_pack](https://github.com/dogchenya/easy_pack)，源码首次提交 193f251 并推送 master。远端 Actions 已启动，结果以实际运行记录为准。此前本地产物的 provenance 仍保留 uncommitted，不倒填为新提交的构建。凭据保存在系统凭据库，未纳入仓库。

## 尚未完成的目标环境验收

| 项目 | 明确缺口 |
| --- | --- |
| Windows 实际文件管理器操作 | UI 自动化捕获后无法激活窗口，恢复仍返回 failed to activate captured window，已停止使用该助手，未用另一种 Windows UI 自动化绕过。实际 Explorer 多窗口/多标签/桌面、物理热键/拖入、原生选择器及开机启动交互仍需验收 |
| Windows 桌面选择 | 当前适配器对无法唯一匹配的 Explorer 标签页或桌面视图明确拒绝，不列为已通过支持项 |
| macOS ARM64/x64 桌面交互 | 两种架构已在远端原生 Mac 构建并通过包内真实 IPC；Finder 自动化权限、实际热键、拖入、原生对话框及系统启动交互仍需独立桌面验收，IPC 结果不覆盖这些行为 |
| Wayland/其他 Linux 管理器 | 尚未独立验证，不列为已通过兼容承诺 |
| 原生对话框与其他系统设置 | Linux 最终两种发布包已通过文件/文件夹/保存选择器和实际开机启动注册开关；Windows/macOS 对应交互仍需验证，直接 IPC 不能替代系统 UI |
| 性能验收 | 代表性数量、容量与量化阈值仍待补充；4 GiB 一致性不是正式性能承诺 |

这些项目仍属于一期后续验收，不能将当前候选称为“全部三端开发验证完成”。

## 复现

```sh
pnpm install --frozen-lockfile
pnpm build
cargo fmt --all --check
cargo test --locked -p easy-pack-collection
cargo test --locked -p easy-pack
cargo test --locked --release -p easy-pack-collection -- --ignored
pnpm test:ui
pnpm tauri build --bundles nsis -- --locked
node scripts/test-native.mjs
```

Linux 发布依赖、deb-src、声明/对应源码流程见 README 与 scripts/build-linux-release.sh。直接 cargo release 须启用 --features custom-protocol；Tauri CLI 自动启用生产协议。Linux 原生 IPC 可用 xvfb-run -a dbus-run-session -- node scripts/test-native.mjs。独立 rootfs 的 validation- 脚本不是普通用户安装步骤。

CI 已增加许可证门禁、原生宿主真实 IPC、AppImage 原始声明/对应源码归档；跨架构产物明确跳过不匹配宿主的执行，仍需目标机验收。运行时固定为已核对的 fedfad5/SHA256，变更或源码缺失时失败，不自动绕过检查。
