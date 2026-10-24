# 版本、分支与发布约定

- `master`：默认维护主线。功能和修复分支合并后，无独有提交且没有开放 PR 时清理；提交历史保留在主线中。
- 稳定版标签：`vMAJOR.MINOR.PATCH`，从 `v1.0.0` 开始。正式 Release 不标记 Pre-release，最新稳定版设为 Latest。
- 当前公开下载仅提供稳定版；历史 Alpha Release、下载资源和标签已按仓库维护者要求删除。
- 已公开标签不移动、不重写。修复进入新版本；不靠改旧标签来替换用户已下载的包。
- 发布包对应明确源码提交。版本同步更新 package.json、Cargo.toml、Cargo.lock、Tauri 配置和中英文 README；README 描述当前交付行为。
- 四目标构建、Ubuntu 22.04/24.04 兼容性、两架构实际 DMG 挂载运行通过后，验证六份安装包/对应源码的 SHA256 和来源。稳定版额外要求 Windows 原生四边窗口检查 26 项全部通过并绑定源码提交。
- `publish-verified.yml` 是统一发布入口：准备可核对的草稿，区分稳定版与 Alpha。核对实际测试包及公开资源后才发布；稳定版设为 Latest。保留校验材料和平台限制说明。

## 首个稳定版整理

首个稳定版为 `v1.0.0`。整理前默认分支为 `master`，没有开放 PR。以下旧分支均无主线之外的提交，可安全清理引用；提交仍由主线保留：

| 旧分支 | 整理前提交 |
| --- | --- |
| feat/desktop-interaction-graph | 25a7f59e19fa8507a8d16e826ec8a805720535cb |
| fix/ubuntu-2204-compat | 6cf27da9c4ccbc56e17d84cf76d3841addc7478e |
| rebrand/gatherpack | 101d6ae8b1ce8ccdfcfada382b45c33a1f559924 |

2026-10-24 按维护者最新要求完成清理：删除 `v0.1.0-alpha.8` 至 `v0.1.0-alpha.13` 的六个 Release、全部附件和对应标签。仓库仅保留 `master` 分支，以及稳定版 `v1.0.0` 的公开标签、Release 和 19 项附件。中英文 README 聚焦当前产品，移除旧版本和迁移历史说明。

[v1.0.0](https://github.com/dogchenya/GatherPack/releases/tag/v1.0.0) 已公开、设为 Latest，未标记 Pre-release。标签和发布目标固定到安装包源码 `70e2c6c9a6aabcf54caa9c250a4a252353319df8`，后续测试脚本和验证记录在主线补充；不会移动稳定标签。Windows、两架构 Mac、Ubuntu 22.04/24.04 实际 DEB 和 AppImage 验证记录见[界面与交互更新](ui-redesign.md)。

[资源摘要核验](validation/stable1-artifact-verification.json)覆盖 19 项资源及六份包/源码摘要；[Alpha 清理核验](validation/stable1-alpha-cleanup.json)记录当前 Release、标签、Latest 和附件状态。此前的仓库整理报告属于清理前记录。发布页和实际 DEB 链接经匿名访问返回 HTTP 200。
