# 开发指南

**简体中文** | [English](development.en.md) · [返回项目首页](../README.md)

本指南面向源码开发、自行编译和安装包维护。使用方法和下载入口见 [README](../README.md)，环境实测结果见 [验证记录](prototype-validation.md)。

<a id="prerequisites"></a>

## 环境准备

| 工具 | 版本 |
| --- | --- |
| Rust | 1.98.1，由 `rust-toolchain.toml` 固定 |
| Node.js | 24 |
| pnpm | 11.25.0，由 `package.json` 固定 |

平台依赖：

- **Windows**：Visual Studio C++ Build Tools、Windows SDK、WebView2。
- **macOS 14+**：Xcode Command Line Tools；Finder 选择读取需要自动化权限。
- **Ubuntu 24.04 x64**：安装下面的系统包。其他发行版需自行适配依赖。

```sh
sudo apt-get update
sudo apt-get install -y build-essential file libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev libfuse2t64 python3-gi python3-nautilus python3-pyatspi gir1.2-gtk-4.0 x11-utils
```

## 本地开发

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
```

`pnpm dev` 只启动浏览器界面预览。文件管理器选择读取、全局快捷键和打包功能需要 Tauri 桌面程序。

## 检查与测试

```sh
pnpm build
cargo fmt --all --check
cargo test --locked -p easy-pack-collection
cargo test --locked -p easy-pack
cargo check --locked -p easy-pack
```

界面集成测试：

```sh
# Windows 默认使用已安装的 Edge；其他平台先安装 Chromium
pnpm exec playwright install chromium
pnpm test:ui
```

界面测试使用模拟 IPC。生产程序构建后，可通过真实 Rust IPC 验证打包、取消、报告和重启恢复：

```sh
node scripts/test-native.mjs path/to/easy-pack
# Windows 的程序名为 easy-pack.exe
# Linux 无头环境：xvfb-run -a dbus-run-session -- node scripts/test-native.mjs path/to/easy-pack
```

真实 IPC 测试生成隔离配置和测试源，不修改普通用户配置。原生对话框、文件管理器和实际快捷键交互另行验证。

按需执行大文件测试；该测试会创建并读取超过 4 GiB 的临时文件：

```sh
cargo test --locked --release -p easy-pack-collection -- --ignored
```

## 构建安装包

更新依赖后，先重新生成完整声明；构建环境需要锁定依赖的源码缓存：

```sh
cargo fetch --locked
node scripts/license-notices.mjs
```

在对应操作系统上执行：

```sh
# Windows x64
pnpm tauri build --bundles nsis -- --locked

# macOS Apple Silicon
pnpm tauri build --target aarch64-apple-darwin --bundles dmg -- --locked

# macOS Intel
pnpm tauri build --target x86_64-apple-darwin --bundles dmg -- --locked

# Ubuntu 24.04 x64：先按下一节启用 deb-src
bash scripts/build-linux-release.sh
```

默认安装包目录是 `target/release/bundle/`；显式使用 `--target` 时是 `target/<target>/release/bundle/`。程序名为 `easy-pack`，Windows 添加 `.exe`。自定义 `CARGO_TARGET_DIR` 时以该目录为准。

Tauri CLI 自动使用生产协议。直接通过 Cargo 构建发布程序时，需要 `--features custom-protocol` 才会加载打包后的前端资源。

### Linux AppImage 与对应源码

发布脚本需要匹配的源码索引。在 Ubuntu 24.04 的 `/etc/apt/sources.list.d/ubuntu.sources` 中，将 `Types: deb` 改为 `Types: deb deb-src`，然后运行 `sudo apt-get update`。

`scripts/build-linux-release.sh` 会验证固定的 AppImage 运行时，构建 `.deb` 和 AppImage，补齐系统库原始声明，下载确切版本的对应源码，并收集安装包、校验和与构建来源到 `artifacts/x86_64-unknown-linux-gnu/`。

分发 AppImage 时，同时提供生成的 `corresponding-source.tar`。运行时版本或源码校验失败时，需要核对来源并更新固定版本，不跳过声明和源码归档步骤。授权材料说明见 [第三方组件与分发说明](third-party.md)。

<a id="linux-integration"></a>

## Linux 文件管理器集成

直接收集选中项的验证基线为 Ubuntu 24.04、GNOME / X11、Nautilus。运行依赖包括：

```sh
sudo apt-get install -y python3-gi python3-nautilus python3-pyatspi gir1.2-gtk-4.0 x11-utils
```

`.deb` 会安装系统扩展及依赖；源码运行或 AppImage 首次启动会在用户数据目录准备 Nautilus 扩展。安装后退出并重新启动 Nautilus，以加载扩展。应用不会自动关闭文件管理器。

桥接仅读取前台窗口当前视图中的选择，不缓存历史选中项，也不读取剪贴板。Wayland 和其他文件管理器的状态见 [验证记录](prototype-validation.md)。

## CI 与产物

| Runner | Rust 目标 | 安装包 |
| --- | --- | --- |
| `windows-2025` | `x86_64-pc-windows-msvc` | NSIS `.exe` |
| `macos-15` | `aarch64-apple-darwin` | `.dmg` |
| `macos-15-intel` | `x86_64-apple-darwin` | `.dmg` |
| `ubuntu-24.04` | `x86_64-unknown-linux-gnu` | `.deb` / AppImage |

[构建工作流](../.github/workflows/prototype.yml) 在 main/master 推送、Pull Request 或手动触发时执行检查；安装包任务在非 Pull Request 运行中执行。`v*` 版本标签还会创建草稿 Release。

工作流记录实际 Rust host 和请求 target；只有架构匹配时才执行原生 IPC。四目标原生构建不等于跨操作系统或 Linux ARM64 交叉编译验证。独立的 [Mac 包验证工作流](../.github/workflows/macos-package-validation.yml) 可下载指定构建产物，挂载 DMG 并验证包内程序。

Artifacts 包含安装包、`SHA256SUMS.txt`、源码提交/工具链来源记录和第三方声明。完整的本地与远端验证证据见 [验证记录](prototype-validation.md) 和 [CI 摘要](validation/ci-alpha.3.json)。
