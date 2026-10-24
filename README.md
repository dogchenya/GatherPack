<p align="center">
  <img src="app-icon.svg" width="88" alt="GatherPack 图标">
</p>

# GatherPack

**简体中文** | [English](README.en.md)

**把分散的文件收集到一起，一次打包带走。**

适用于 Windows、macOS 和 Linux 的桌面文件收集与打包工具。跨目录收集文件和文件夹，在文件画布中整理，导出 ZIP、7z 或 tar.gz。全程本地运行，无需账号，原文件保留原处。

## 操作演示

![GatherPack 完整操作演示](docs/assets/product-demo-v1.0.0.gif)

*当前稳定版在 Ubuntu 24.04 / GNOME X11 下的真实操作录屏，使用示例文件：添加文件和文件夹 → 文件画布 → 移除与撤销 → 检查打包 → 查看结果。*

[查看清晰视频（MP4）](docs/assets/product-demo-v1.0.0.mp4)

## 下载与安装

当前稳定版：**1.0.0** · [发布页与全部下载](https://github.com/dogchenya/GatherPack/releases/latest)

| 平台 | 下载项 | 安装方式 |
| --- | --- | --- |
| Windows x64 | [Windows x64 · EXE](https://github.com/dogchenya/GatherPack/releases/download/v1.0.0/gatherpack-1.0.0-x86_64-pc-windows-msvc-GatherPack_1.0.0_x64-setup.exe) | 运行 `.exe` 安装程序 |
| macOS 14+ · Apple Silicon | [Apple Silicon · DMG](https://github.com/dogchenya/GatherPack/releases/download/v1.0.0/gatherpack-1.0.0-aarch64-apple-darwin-GatherPack_1.0.0_aarch64.dmg) | 打开 `.dmg`，将应用拖入 Applications |
| macOS 14+ · Intel | [Intel · DMG](https://github.com/dogchenya/GatherPack/releases/download/v1.0.0/gatherpack-1.0.0-x86_64-apple-darwin-GatherPack_1.0.0_x64.dmg) | 打开 `.dmg`，将应用拖入 Applications |
| Linux x86_64 · Ubuntu 22.04 / 24.04 | [Linux x86_64 · DEB](https://github.com/dogchenya/GatherPack/releases/download/v1.0.0/gatherpack-1.0.0-x86_64-unknown-linux-gnu-GatherPack_1.0.0_amd64.deb) | 安装 `.deb` |
| Linux x86_64 · AppImage | [Linux x86_64 · AppImage](https://github.com/dogchenya/GatherPack/releases/download/v1.0.0/gatherpack-1.0.0-x86_64-unknown-linux-gnu-GatherPack_1.0.0_amd64.AppImage) | 赋予 `.AppImage` 执行权限后运行 |

安装前请先退出正在运行的 GatherPack。Linux 选择 DEB 或 AppImage 即可，`x86_64` / `amd64` 均为 Intel/AMD 64 位架构。安装包尚未签名，macOS 尚未公证。

Linux 的校验和、授权材料及 `corresponding-source.tar` 单独提供，安装无需下载源码；再分发 AppImage 时须同时提供同一版本、同一构建的对应源码。

## 开始使用

1. **收集**：拖入文件或文件夹，或点击“添加文件”“添加文件夹”。
2. **整理**：在清单或文件画布中查看、移除项目，需要时撤销。
3. **打包**：点击“检查并打包”，选择格式和保存位置，完成后查看结果。

设置中可切换简体中文 / English、修改快捷键及默认压缩格式。Windows / Linux 使用 `Ctrl + Alt + Shift + E`，macOS 使用 `Command + Option + Shift + E` 收集文件管理器选中项。

Linux 快捷键以 GNOME / X11 / Nautilus 为验证基线。提示未连接时，使用应用内“本地收集”的连接检查与重连；详见 [Linux 集成](docs/development.md#linux-integration) 与 [快捷键排查](docs/nautilus-shortcut.md)。

## 开发与反馈

- [开发指南](docs/development.md)：源码运行、测试与构建。
- [反馈问题或建议](https://github.com/dogchenya/GatherPack/issues)：请附系统版本与复现步骤。
- [第三方组件与分发说明](docs/third-party.md)。

## 许可证

原创代码使用 [MIT License](LICENSE)，第三方组件保留各自许可证，详见 [第三方声明](docs/THIRD_PARTY_NOTICES.md)。
