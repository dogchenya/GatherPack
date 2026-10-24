# 版本、分支与发布约定

- `master`：默认维护主线。功能和修复分支合并后，无独有提交且没有开放 PR 时清理；提交历史保留在主线中。
- 稳定版标签：`vMAJOR.MINOR.PATCH`，从 `v1.0.0` 开始。正式 Release 不标记 Pre-release，最新稳定版设为 Latest。
- 预发布标签：`vMAJOR.MINOR.PATCH-alpha.N`。历史 Alpha 标签和下载资源保留，Release 保持 Pre-release，说明中指向当前稳定版。
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

历史 `v0.1.0-alpha.8` 至 `v0.1.0-alpha.13` 保留，避免破坏已有下载链接；这些版本均属于预发布，不代表本次稳定交付。
