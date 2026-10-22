# easy_pack

跨平台文件收集与迁移打包助手，原创代码按 MIT 许可证交付。Tauri 2 + Rust + React + TypeScript，本地离线处理，无账号。

当前为 **0.1.0-alpha.3 一期候选实现**。Windows 与 Linux 的真实 IPC、重启恢复及三种压缩格式已通过验证；Linux X11 的直接收集快捷键与原生拖入已实测。三端验收尚未全部完成，详见 [开发与验证记录](docs/prototype-validation.md)。

## 使用

1. 启动后显示小悬浮图标。拖入文件/文件夹，或点击图标展开后使用“添加文件”“添加文件夹”。
2. 从不同目录继续追加。快捷键默认 Windows/Linux 为 Ctrl+Alt+Shift+E，macOS 为 Command+Option+Shift+E；直接读取前台文件管理器选择，不读取剪贴板。
3. 在“目录与问题”查看最终包内路径、重命名及问题；先修正，或在打包确认页明确跳过已列出的问题。
4. 点击“检查并打包”，选择本次格式与保存位置。默认包名带本地日期时间；已有文件一律拒绝覆盖。
5. 查看进度和本机报告。取消通过独立入口执行；公共清单在打包期间可以继续收集、移除和清空，变更供下次任务使用。
6. 面板“收起”回到小图标；菜单或托盘可显隐、退出。任务执行中先取消并等待清理，再退出。

ZIP、7z、tar.gz 均为真实压缩格式，使用内置标准等级，流式读写。文件夹包含隐藏项、.git 和空文件夹，不提供内部排除；不跟随链接/目录联接。独立文件位于包根目录，文件夹保留内部结构；跨平台非法名称、大小写和 Unicode 规范化冲突自动改名，并可预览。

清单、默认格式、快捷键、上次输出目录与开机启动设置保存于系统应用数据目录；最新报告为 last-report.json，历史报告位于 reports/。源文件路径仅用于本机记录，不写入共享包。清单不保存文件内容；源文件变化时使用打包时可读取的内容。

## 开发与源码构建

需要 Rust **1.98.1**（rust-toolchain.toml）、Node.js **24**、pnpm **11.25.0**。先安装对应平台的原生工具链：

- Windows：Visual Studio C++ Build Tools、Windows SDK、WebView2。
- macOS 14+：Xcode Command Line Tools；Finder 选择读取需授予自动化权限。
- Ubuntu 24.04：以下公开系统依赖。其他发行版可按包名适配自行编译，不默认宣称兼容。

```sh
sudo apt-get update
sudo apt-get install -y build-essential file libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev libfuse2t64 python3-gi python3-nautilus python3-pyatspi gir1.2-gtk-4.0 x11-utils
```

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
```

pnpm dev 仅用于浏览器界面预览；系统选择和打包必须使用桌面程序。

```sh
pnpm build
cargo fmt --all --check
cargo test --locked -p easy-pack-collection
cargo test --locked -p easy-pack
cargo check --locked -p easy-pack
# 按需执行：实际读取并校验超过 4 GiB 的文件
cargo test --locked --release -p easy-pack-collection -- --ignored
```

界面集成测试使用可复现的模拟 IPC，不代表真实桌面验收。Windows 默认使用已安装的 Edge；其他平台先运行 pnpm exec playwright install chromium，再执行 pnpm test:ui。

生产程序构建后，运行 node scripts/test-native.mjs 可用独立临时配置和自动生成的测试源验证真实 Rust IPC、三种输出、取消、报告与重启恢复。该测试不会修改普通用户配置。Linux 无头环境可用 xvfb-run -a dbus-run-session -- node scripts/test-native.mjs。

生成安装包：

```sh
# Windows x64
pnpm tauri build --bundles nsis -- --locked
# macOS ARM64 或 x64（使用对应 target）
pnpm tauri build --target aarch64-apple-darwin --bundles dmg -- --locked
pnpm tauri build --target x86_64-apple-darwin --bundles dmg -- --locked
# Linux x64
bash scripts/build-linux-release.sh
```

本机安装包位于 target/release/bundle/，程序为 target/release/easy-pack（Windows 添加 .exe）。未使用发布证书签名或 macOS 公证。

## 文件管理器与桌面边界

| 环境 | 实现方式 | 实测状态 |
| --- | --- | --- |
| Windows 11 x64 / Explorer | 前台句柄 + 隐藏 STA PowerShell + Shell COM | 编译通过；多窗口、多标签页、桌面选择及真实热键操作仍需验收 |
| macOS 14+ ARM64/x64 / Finder | 前台应用检查 + JXA Finder selection | 尚未在 Mac 构建实测 |
| Ubuntu 24.04 x64 / GNOME Shell 46.0 或 Openbox / X11 / Nautilus 46.4 | 进程内 MIT Python 桥接，按实际前台 XID 读取当前映射文件视图的实时选择 | 独立 rootfs + Xvfb 中两种窗口管理器均通过：多窗口、多标签、混选、空选、实际全局键、不抢焦点、剪贴板保持和原生拖入；GNOME 使用无 logind 的独立测试会话，不冒充物理机登录验证 |
| Linux Wayland | 尝试全局快捷键后端并反馈注册结果 | 原生全局键、置顶及 AT-SPI 行为均未验收 |

Linux 的 .deb 安装上述运行依赖和 Nautilus 桥接；源码运行或 AppImage 首次启动会在当前用户数据目录准备桥接，需安装依赖并重新打开 Nautilus 才能加载。应用不会自动关闭文件管理器。桥接不缓存选择、不拼接猜测路径，也不读取剪贴板。其他文件管理器使用保守的 AT-SPI URI 读取，尚未逐个验收。没有系统托盘时保留窗口入口。快捷键不可用或冲突时显示原因；系统选择读取有 12 秒超时。

最终 alpha.3 的 .deb 与 AppImage 在上述 GNOME/X11 测试会话各通过 70 项桌面断言，覆盖原生文件/文件夹/保存选择器、完整打包、开机启动注册开关及悬浮栏收起/移动/展开/退出。Windows 安装包通过安装后的 27 项真实 IPC 与卸载验证。证据及仍缺少的三端验收见 [验证记录](docs/prototype-validation.md)，最终包校验见 artifacts/validation/release-checks.json。

## CI、产物与源码追溯

[GitHub Actions](.github/workflows/prototype.yml) 包含 Linux 核心测试、ZIP64 实测及四目标安装包。推送 main/master、手动执行或推送版本标签生成安装产物；版本标签创建草稿 Release。没有配置远端仓库时，工作流只存在于本地，不能宣称远端执行通过。

| runner | Rust 目标 | 安装格式 | 构建关系 |
| --- | --- | --- | --- |
| windows-2025 | x86_64-pc-windows-msvc | NSIS .exe | 原生 |
| macos-15 | aarch64-apple-darwin | .dmg | ARM64 原生，执行前核对实际 host |
| macos-15-intel | x86_64-apple-darwin | .dmg | Intel 原生，执行前核对实际 host |
| ubuntu-24.04 | x86_64-unknown-linux-gnu | .deb / AppImage | 原生 |

macOS 两个 target 分别使用 ARM64 和 Intel runner；执行前仍核对 rustc -vV 的实际 host，若不匹配则明确跳过目标程序执行。保留 --target 构建与对应工具链配置，不把不同系统分别原生构建称为跨操作系统交叉编译。本期未承诺 Linux ARM64 安装包。runner 标签依据 [GitHub 官方参考](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

Actions 运行页的 Artifacts 可以下载对应目标安装包、SHA256SUMS、源码提交/工具链 provenance 及许可证声明；安装包文件名包含版本、目标系统及 CPU 架构。Release 保持草稿，待目标环境安装与核心流程验收后再发布。

AppImage 额外包含系统库的原始 copyright、完整通用授权及运行时声明；其对应的 source.tar 与 AppImage 一起交付和分发。本地候选的对应源码约 612 MiB。Linux 发布脚本还需要启用匹配的 deb-src 并运行 apt-get update；Ubuntu 24.04 的 /etc/apt/sources.list.d/ubuntu.sources 可将 Types: deb 改为 Types: deb deb-src。运行时固定验证为 fedfad5 及 SHA256；遇到变更或缺少确切源码时会失败，需要核对后更新，不能跳过声明检查直接分发原始 AppImage。

## 文档与许可证

- [一期产品需求](docs/requirements.md)
- [开发与验证记录](docs/prototype-validation.md)
- [第三方组件说明](docs/third-party.md)
- [依赖许可证及随包声明](docs/THIRD_PARTY_NOTICES.md)
- [依赖声明审计](docs/license-audit.json)
- [技术建议](docs/technical-recommendations.md)
- [MIT LICENSE](LICENSE)

公开源码仓库：[dogchenya/easy_pack](https://github.com/dogchenya/easy_pack)。531 个依赖条目均已提供适用授权全文；39 个条目明确使用 SPDX 完整标准条款及来源元数据，4 个平台包继承同版本主包的原始声明，审计完整记录其来源。NSIS 原始 COPYING 也已并入交付材料。第三方许可证不因应用采用 MIT 而改变。

