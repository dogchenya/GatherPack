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
- **Ubuntu 22.04 / 24.04 x64**：安装下面的系统包。发布兼容两者的安装包时，必须使用 **22.04** 构建；在 24.04 上开发和自行编译仅保证当前系统运行。其他发行版需自行适配依赖。

```sh
sudo apt-get update
. /etc/os-release
runtime_packages=(libcurl4 libcurl3-gnutls libfuse2)
if [ "$VERSION_ID" = 24.04 ]; then
  runtime_packages=(libcurl4t64 libcurl3t64-gnutls libfuse2t64)
fi
sudo apt-get install -y build-essential file curl "${runtime_packages[@]}" libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev python3-gi python3-nautilus python3-pyatspi gir1.2-gtk-3.0 gir1.2-gtk-4.0 x11-utils
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
cargo test --locked -p gatherpack-collection
cargo test --locked -p gatherpack
cargo check --locked -p gatherpack
```

界面集成测试：

```sh
# Windows 默认使用已安装的 Edge；其他平台先安装 Chromium
pnpm exec playwright install chromium
pnpm test:ui
node scripts/test-graph.mjs
```

界面测试使用模拟 IPC。生产程序构建后，可通过真实 Rust IPC 验证打包、取消、报告和重启恢复：

```sh
node scripts/test-native.mjs path/to/gatherpack
# Windows 的程序名为 gatherpack.exe
# Linux 无头环境：xvfb-run -a dbus-run-session -- node scripts/test-native.mjs path/to/gatherpack
```

真实 IPC 测试生成隔离配置和测试源，不修改普通用户配置。原生对话框、文件管理器和实际快捷键交互另行验证。

文件关系图的模型测试覆盖目录层级、重命名来源、空目录、问题项、大小汇总与只读隔离；界面测试另检查展开、分批显示、缩放、平移与拖动/点击区分。最终 Linux 包在专用隔离 GNOME/X11 会话运行 `scripts/test-linux-selection.py` 和 `scripts/test-shortcut-recovery-linux.py`，不在个人桌面执行这些会操作 Nautilus 的测试；实际范围见 [桌面交互记录](desktop-interaction.md)。普通启动迁移测试依赖 `xdotool`，无头环境使用已安装的 UTF-8 locale（例如 `LC_ALL=C.UTF-8`）。

按需执行大文件测试；该测试会创建并读取超过 4 GiB 的临时文件：

```sh
cargo test --locked --release -p gatherpack-collection -- --ignored
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

# Ubuntu 22.04 x64：先按下一节启用 deb-src
bash scripts/build-linux-release.sh
```

默认安装包目录是 `target/release/bundle/`；显式使用 `--target` 时是 `target/<target>/release/bundle/`。程序名为 `gatherpack`，Windows 添加 `.exe`。自定义 `CARGO_TARGET_DIR` 时以该目录为准。

Tauri CLI 自动使用生产协议。直接通过 Cargo 构建发布程序时，需要 `--features custom-protocol` 才会加载打包后的前端资源。

### Linux AppImage 与对应源码

发布脚本需要匹配的源码索引。Ubuntu 22.04 可将 `/etc/apt/sources.list` 中的 `# deb-src ...` 取消注释；如果没有这些行，复制当前生效的 `deb ...` 条目并将前缀改为 `deb-src ...`，保存为 `/etc/apt/sources.list.d/gatherpack-sources.list`。使用 Deb822 配置的系统，可在 `/etc/apt/sources.list.d/ubuntu.sources` 中将 `Types: deb` 改为 `Types: deb deb-src`。之后运行 `sudo apt-get update`。

使用较旧的 CI 镜像时，可在更新源码索引后运行 `sudo python3 scripts/refresh-runtime-libraries-linux.py --apply`。它同步已安装但确切源码版本已退出索引的运行库，不降级较新的第三方包；不加参数时只读检查。

`scripts/build-linux-release.sh` 会验证固定的 AppImage 运行时，构建 `.deb` 和 AppImage，补齐系统库原始声明，下载确切版本的对应源码，并收集安装包、校验和与构建来源到 `artifacts/x86_64-unknown-linux-gnu/`。

发布脚本与 CI 都检查程序及 AppImage 内 ELF 的实际 glibc 要求，上限为 2.35；不能通过仅降低 Debian 依赖声明来兼容旧系统。问题原因与双系统验证见 [Ubuntu 兼容性记录](ubuntu-compatibility.md)。

分发 AppImage 时，同时提供生成的 `corresponding-source.tar`。运行时版本或源码校验失败时，需要核对来源并更新固定版本，不跳过声明和源码归档步骤。授权材料说明见 [第三方组件与分发说明](third-party.md)。

<a id="linux-integration"></a>

## Linux 文件管理器集成

直接收集选中项使用 GNOME / X11 / Nautilus：22.04 的 Nautilus 42 使用 GTK3 实时选择属性，24.04 的 Nautilus 使用 GTK4 文件选择模型。运行依赖包括：

```sh
sudo apt-get install -y python3-gi python3-nautilus python3-pyatspi gir1.2-gtk-3.0 gir1.2-gtk-4.0 x11-utils
```

`.deb` 会安装系统扩展及依赖；源码运行或 AppImage 首次启动会在用户数据目录准备 Nautilus 扩展。安装后退出并重新启动 Nautilus，以加载扩展。应用不会自动关闭文件管理器。

桥接仅读取前台窗口当前视图中的选择，不缓存历史选中项，也不读取剪贴板。Wayland 和其他文件管理器的状态见 [验证记录](prototype-validation.md)。

## CI 与产物

| Runner | Rust 目标 | 安装包 |
| --- | --- | --- |
| `windows-2025` | `x86_64-pc-windows-msvc` | NSIS `.exe` |
| `macos-15` | `aarch64-apple-darwin` | `.dmg` |
| `macos-15-intel` | `x86_64-apple-darwin` | `.dmg` |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `.deb` / AppImage |

[构建工作流](../.github/workflows/prototype.yml) 在 main/master 推送、Pull Request 或手动触发时执行检查；安装包任务在非 Pull Request 运行中执行。`v*` 版本标签还会创建草稿 Release。

Linux `.deb` 另在 `ubuntu-22.04` 和 `ubuntu-24.04` 两个 runner 上安装并运行真实 IPC、普通启动迁移及卸载；两者使用同一个已上传的安装包。

工作流记录实际 Rust host 和请求 target；只有架构匹配时才执行原生 IPC。四目标原生构建不等于跨操作系统或 Linux ARM64 交叉编译验证。独立的 [Mac 包验证工作流](../.github/workflows/macos-package-validation.yml) 可下载指定构建产物，挂载 DMG 并验证包内程序。

Windows/macOS Artifacts 包含安装包、`SHA256SUMS.txt`、源码提交/工具链来源记录和第三方声明。Linux 分为 `gatherpack-linux-x64-deb`、`gatherpack-linux-x64-appimage`、`gatherpack-linux-x64-corresponding-source` 和 `gatherpack-linux-x64-checksums-and-licenses` 四个下载项，分别只含对应格式或元数据。安装包内部的授权声明保留。将四项解压至同一目录，可恢复原始收集目录并用 `sha256sum -c SHA256SUMS.txt` 校验全部文件。

[下载整理工作流](../.github/workflows/redistribute.yml) 接受提供独立 Linux 下载项的原始构建编号和完整源码提交，要求四个安装包任务与检查任务成功；然后对同一 Debian 包完成 Ubuntu 22.04 / 24.04 安装运行复验。两者通过后，校验原始文件哈希与构建来源，重新上传各平台下载项；不重新编译，不修改包内容，也不将验证提交冒充原始构建提交。正常构建共用同一个 [上传动作](../.github/actions/upload-installers/action.yml)。完整证据见 [Ubuntu 兼容性记录](ubuntu-compatibility.md)；旧版本记录保留在 [验证记录](prototype-validation.md) 和 [品牌迁移记录](brand-migration.md)。
