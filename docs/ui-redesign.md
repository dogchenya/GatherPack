# GatherPack alpha.8 界面与交互更新

日期：2026-10-23。依据已确认的 GatherPack /02 原型实现正式桌面界面，真实文件操作继续使用 Rust 后端。

## 本次变化

- 暖白与雾绿的轻量收集面板，统一线条图标。清单默认 440×760，文件全景按需扩展到 900×760；尺寸受屏幕工作区限制。收起仍为 104×112，整块图标和宽标题栏使用原生窗口拖动。
- 清单与文件全景为主要视图；目录与问题、结果报告保留独立入口。文件卡片区分类型、大小、来源、同名自动编号与不可用状态。
- 支持撤销最近一次移除、清空或重新定位。恢复原顺序，保留此后新收集的来源，不更改正在执行的任务；撤销历史只在本次运行保留。
- 失效来源可以通过原生文件/文件夹选择器重新定位。文件夹按顶层整项替换；已在清单中的来源拒绝重复替换。原文件不被移动或改写。
- 置顶按钮控制实际窗口置顶；Linux 原生选择器关闭后恢复用户此前的置顶状态。
- 打包确认展示本次格式、输出路径、可折叠目录树与问题明细。输出路径可修改，也可打开原生保存对话框选择位置和包名。
- 打包开始后返回清单继续整理。进度、取消和最终报告接入真实任务，当前任务继续使用冻结计划；完成后自动显示报告。
- 连接面板分别呈现快捷键注册与文件管理器返回信息。Linux 原有依赖与桥接诊断保留，不将注册成功等同于已经读取文件管理器选择。
- 设置支持直接按组合键填写快捷键。模态框支持 Escape 关闭、Tab 焦点循环与关闭后焦点恢复。

## 验证

本轮浏览器集成覆盖清单、图谱、问题确认、任务隔离、报告、440px 窗口、原生拖动命令、置顶命令、撤销、快捷键录入与模态焦点行为。浏览器测试模拟 IPC，截图使用示例数据。

原生验证另调用实际 Rust 命令并核对磁盘，覆盖三种压缩格式、引用替换及撤销、撤销后新增内容保留、顺序、清单持久化、输出保护与取消清理。安装包与各系统验证结果随发布记录补充；历史版本的证据不代替本次验证。

应用源码提交：`d40899154bc76259316f5be04e41c6cd2cf8cc48`。后续文档及测试脚本提交不改变该构建的应用代码。

| 实际环境 | 本轮结果 |
| --- | --- |
| Windows x64 / WebView2 | 下载的最终 NSIS 安装器：安装、版本、授权资源、运行与卸载 6 项通过；安装后的程序通过 28 项核心 IPC 和 5 项重启恢复 |
| Ubuntu 22.04 / GNOME / X11 / Nautilus | 下载的最终 `.deb`：安装后 119 项桌面检查通过，包括原生选择器、真实快捷键、关系图、重新定位及撤销、打包解压与拖动；原生 IPC 和重启恢复通过，已卸载并核对清理 |
| Ubuntu 24.04 最终 Debian 安装器 | 同一 `.deb` 安装后 119 项桌面检查、28 项核心 IPC 和 5 项重启恢复通过，卸载清理通过 |
| Ubuntu 24.04 / GNOME / X11 / Nautilus | 源码构建：115 项真实桌面检查通过，覆盖拖入、选中项快捷键、原生文件/文件夹/保存/重新定位选择器、取消置顶、撤销、图谱、打包与解压校验、开机启动和窗口移动 |
| Ubuntu 24.04 快捷键恢复 | 22 项通过：首次加载桥接、实际热键读取、双实例冲突、原组合键恢复、重新注册和 Caps Lock |
| Ubuntu 24.04 最终 AppImage | 119 项桌面检查、22 项快捷键恢复、28 项核心 IPC、5 项重启恢复及 3 项普通启动迁移检查通过，报告绑定实际下载包的 SHA256 |
| macOS 15 / Apple Silicon 与 Intel | 两种实际 DMG 均挂载成功，核对 SHA256、来源、版本、包名及授权资源，包内程序通过核心 IPC 和重启恢复，随后卸载镜像 |

桌面检查在独立的 WSL2 Ubuntu rootfs、Xvfb 和非 root 测试账户中运行。可追溯报告：[桌面 115 项](validation/alpha8-gnome-source.json)、[快捷键恢复 22 项](validation/alpha8-shortcut-source.json)。这两份报告验证源码构建程序，最终安装包另做校验。

最终安装器报告：[Windows](validation/alpha8-windows-installer.json)、[Ubuntu 22.04 Debian](validation/alpha8-ubuntu22-deb.json)。包的 SHA256 与实际下载的字节核对一致。[macOS DMG 验证运行](https://github.com/dogchenya/GatherPack/actions/runs/39889134914) 覆盖两种架构。

[Ubuntu 24.04 Debian 报告](validation/alpha8-ubuntu24-deb.json) 验证同一下载包。[最终构建及双 Ubuntu 安装验证](https://github.com/dogchenya/GatherPack/actions/runs/39887952283) 已通过，四个构建目标均完成真实原生 IPC 验证。CI 镜像切换脚本同时支持传统源文件和 Ubuntu runner 的 `apt-mirrors.txt` 间接镜像列表。

最终 [Ubuntu 24.04 AppImage 报告](validation/alpha8-ubuntu24-appimage.json) 同时包含桌面、快捷键恢复与旧配置迁移结果。AppImage 在独立测试环境使用解压运行方式验证；源码包和授权材料由发布流程另外校验。

## GitHub 发布

安装包通过公开的 `Checks and desktop installers` 工作流构建，Linux 包继续基于 Ubuntu 22.04 构建并检查 GLIBC 2.35 基线。macOS 两种架构另通过 `Validate delivered macOS packages` 挂载实际 DMG 验证。

`Prepare verified GitHub release` 接受构建运行编号、源码提交和 macOS 安装验证编号。只有四目标构建、双 Ubuntu 安装以及双 DMG 验证成功，并且来源、版本和 SHA256 一致时，才整理发布草稿。安装包、AppImage 对应源码、校验和及授权说明分别提供。

## 原型与研究参考

设计原型在 [prototypes/gatherpack-v2](../prototypes/gatherpack-v2/README.md)。原型里的文件与系统动作是演示；正式应用不包含模拟桌面、示例文件、自动演示或虚拟打包。

参考 [Dropover](https://dropoverapp.com/) 的浮动收集架、[Yoink](https://apps.apple.com/us/app/yoink/id457622435?mt=12) 的跨窗口暂存，以及 [Dropzone](https://aptonic.com/) 的快捷动作组织。视觉、图标、交互及代码独立实现，未引入上述应用的代码或素材。
