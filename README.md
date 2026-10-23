<p align="center">
  <img src="app-icon.svg" width="88" alt="GatherPack 图标">
</p>

# GatherPack

**简体中文** | [English](README.en.md)

[![构建状态](https://github.com/dogchenya/GatherPack/actions/workflows/prototype.yml/badge.svg?branch=master)](https://github.com/dogchenya/GatherPack/actions/workflows/prototype.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**把分散的文件收集到一起，一次打包带走。**

GatherPack 是面向 Windows、macOS 和 Linux 的桌面文件收集与打包工具。把不同目录里的文件和文件夹拖进悬浮收集栏，整理好清单后，直接导出 ZIP、7z 或 tar.gz。整个过程在本机完成，无需账号或网络连接。

旧版 easy_pack 用户首次启动时会导入清单、设置和报告；旧记录保留。迁移后如需开机启动，请在设置中重新启用；macOS 请按系统提示授予 Finder 自动化权限。

<img src="docs/assets/shelf-alpha8.png" width="440" alt="GatherPack 新版收集面板">

*alpha.8 正式前端，示例文件截图。当前应用界面使用简体中文。*

新版增加撤销整理、来源重新定位、实际窗口置顶及打包中的持续收集，详见 [界面与交互更新](docs/ui-redesign.md)。

## 功能

- **跨目录收集**：拖入文件、整个文件夹，或通过快捷键收集文件管理器中的选中项。
- **轻量悬浮栏**：整块图标与展开后的标题栏均可拖动，随时展开管理清单。
- **三种压缩格式**：支持 ZIP、7z、tar.gz，保存默认格式，也可为单次任务临时切换。
- **打包前预览**：查看包内目录结构、重名处理结果和不可用来源，确认后再开始。
- **文件关系图**：用发散图查看文件夹和文件，展开分支、缩放、平移，并定位来源。
- **保留原文件**：收集阶段记录路径；移除、清空和取消操作不删除或移动源文件。
- **随时继续整理**：后台打包、进度与取消、结果报告、清单跨重启恢复。

文件夹会保留内部目录结构、隐藏内容和空文件夹。同名项目自动编号；链接等不支持的项目会列为问题，需处理或明确跳过。

## 下载与安装

当前版本：**0.1.0-alpha.8**，处于 Alpha 阶段，安装包在 GitHub Releases 提供。Ubuntu 22.04 请使用此新版；alpha.4 的 Linux 包要求 GLIBC 2.39，不支持 22.04。

打开 [发布与下载](https://github.com/dogchenya/GatherPack/releases/tag/v0.1.0-alpha.8)，在 **Assets** 中下载对应系统的安装包；无需登录 GitHub。GitHub Actions 仍保留按系统与架构分开的构建产物。

| 平台 | 下载项 | 安装方式 |
| --- | --- | --- |
| Windows x64 | [Windows x64 · EXE](https://github.com/dogchenya/GatherPack/releases/download/v0.1.0-alpha.8/gatherpack-0.1.0-alpha.8-x86_64-pc-windows-msvc-GatherPack_0.1.0-alpha.8_x64-setup.exe) | 运行 `.exe` 安装程序 |
| macOS 14+ · Apple Silicon | [Apple Silicon · DMG](https://github.com/dogchenya/GatherPack/releases/download/v0.1.0-alpha.8/gatherpack-0.1.0-alpha.8-aarch64-apple-darwin-GatherPack_0.1.0-alpha.8_aarch64.dmg) | 打开 `.dmg`，将应用拖入 Applications |
| macOS 14+ · Intel | [Intel · DMG](https://github.com/dogchenya/GatherPack/releases/download/v0.1.0-alpha.8/gatherpack-0.1.0-alpha.8-x86_64-apple-darwin-GatherPack_0.1.0-alpha.8_x64.dmg) | 打开 `.dmg`，将应用拖入 Applications |
| Linux x86_64 · Ubuntu 22.04 / 24.04 | [Linux x86_64 · DEB](https://github.com/dogchenya/GatherPack/releases/download/v0.1.0-alpha.8/gatherpack-0.1.0-alpha.8-x86_64-unknown-linux-gnu-GatherPack_0.1.0-alpha.8_amd64.deb) | 安装 `.deb` |
| Linux x86_64 · AppImage | [Linux x86_64 · AppImage](https://github.com/dogchenya/GatherPack/releases/download/v0.1.0-alpha.8/gatherpack-0.1.0-alpha.8-x86_64-unknown-linux-gnu-GatherPack_0.1.0-alpha.8_amd64.AppImage) | 赋予 `.AppImage` 执行权限后运行 |

在 Ubuntu 上升级 GatherPack 前，请先退出旧版应用。若快捷键提示桥接未加载或需要 `python3-nautilus`，请按 [Nautilus 快捷键排查](docs/nautilus-shortcut.md) 安装依赖并退出后台进程后重新打开“文件”。alpha.7 会区分缺少依赖与已安装但尚未加载，不再统一提示重复安装。

Linux 安装包、对应源码和校验材料分别下载，普通安装只需选择 `.deb` 或 AppImage 其中一种。`x64`、`x86_64`、`amd64` 均指 Intel/AMD 64 位架构，目前没有 32 位 x86 包。

对应源码为发布页中独立的 `corresponding-source.tar`，普通安装无需下载。校验和位于 `SHA256SUMS.txt`，构建来源及授权说明分别提供；Actions 中也保留分开的下载项。再分发 AppImage 时，须同时提供**同一版本、同一构建**的对应源码。

安装包尚未签名，macOS 包尚未公证。Linux 快捷键集成以 **GNOME / X11 / Nautilus** 为验证基线；首次启用步骤见 [Linux 集成说明](docs/development.md#linux-integration)。

本轮验证记录见 [界面与交互更新](docs/ui-redesign.md)。Ubuntu GNOME/X11 已覆盖真实拖入、全局快捷键、文件选择、关系图、打包及窗口拖动；Windows/macOS 文件管理器完整桌面交互、Wayland 及其他 Linux 文件管理器仍待验证。历史证据分别保存在 [快捷键排查](docs/nautilus-shortcut.md#alpha7-validation) 与 [兼容性记录](docs/prototype-validation.md)。

## 快速上手

1. **收集**：启动应用，把文件或文件夹拖到悬浮图标上；也可以展开面板，点击“添加文件”或“添加文件夹”。
2. **整理**：继续从其他目录添加，移除不需要的项目，在“目录与问题”中检查输出结构。
3. **打包**：点击“检查并打包”，选择格式、保存位置和包名，处理提示的问题后开始。
4. **查看结果**：完成后查看报告或打开输出目录。原文件和收集清单都会保留。

| 快捷键 | 操作 |
| --- | --- |
| Windows / Linux：`Ctrl + Alt + Shift + E` | 收集前台文件管理器中的选中项 |
| macOS：`Command + Option + Shift + E` | 收集 Finder 中的选中项 |

可在“设置”中修改快捷键、默认格式和开机启动选项。快捷键收集无需先复制文件，不读取剪贴板。

## 从源码运行

技术栈：**Tauri 2 · Rust · React · TypeScript**。

安装 Rust **1.98.1**、Node.js **24**、pnpm **11.25.0** 及[平台依赖](docs/development.md#prerequisites)，然后运行：

```sh
git clone https://github.com/dogchenya/GatherPack.git
cd GatherPack
pnpm install --frozen-lockfile
pnpm desktop:dev
```

测试、安装包构建和 Linux 自行编译步骤见 [开发指南](docs/development.md)。

## 参与贡献

欢迎通过 [Issues](https://github.com/dogchenya/GatherPack/issues) 反馈问题或建议，也欢迎提交 Pull Request。反馈兼容性问题时，请附上系统版本、文件管理器、复现步骤和错误信息。

- [开发指南](docs/development.md)
- [兼容性与验证记录](docs/prototype-validation.md)
- [第三方组件与分发说明](docs/third-party.md)

## 许可证

GatherPack 的原创代码使用 [MIT License](LICENSE)。第三方组件保留各自许可证，详见 [第三方声明](docs/THIRD_PARTY_NOTICES.md)。
