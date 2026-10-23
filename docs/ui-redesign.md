# GatherPack 界面与交互更新

日期：2026-10-23。依据已确认的 GatherPack /02 原型实现正式桌面界面，真实文件操作继续使用 Rust 后端。

## alpha.12 滑动隐藏与实际文件管理器重连

- 置顶状态下，收起图标和展开清单均支持左右贴边滑出；悬停滑回，并恢复原视图、宽度、高度和纵向位置。保留 10×112 的屏内唤回条。动画为 360ms，原生窗口在动画结束后才缩为唤回条，避免内容被提前裁掉；尊重减少动态效果偏好。
- 设置、连接弹窗、菜单、原生文件/文件夹/保存选择器及打包期间暂停自动隐藏。原生对话框使用作用域守卫持有暂停状态，关闭后恢复。
- Linux 连接弹窗新增检查、复制诊断和经确认后的重连。诊断读取实际 Nautilus 的进程、Python 库和加载器、XDG 目录与会话，附应用及系统版本。读取诊断不关闭文件管理器；复制按钮只写入用户主动选择导出的诊断内容。
- 重连必须由用户确认复制、移动已结束。匹配当前文件管理器的 XDG 数据位置，保护独立扩展和符号链接；更新托管桥接后以清理过的 Python/GI 环境正常退出并重新打开 Nautilus，不强制终止未退出的进程。root 或不同桌面总线禁止重连；忽略同一总线地址中不同的 GUID 文本。
- 真实 GNOME/X11 测试使用错误的 `PYTHONPATH/gi.py`，证明 Nautilus 仍可运行但扩展初始化失败。通过应用内检查和确认重连后，真实全局快捷键成功收集测试文件，剪贴板和原文件保持不变；独立扩展保护与确认前不重启也经过验证。此复现不能替代目标机器诊断，其他加载原因需根据实际报告判断。
- 中英文 README 同步更新最新功能的入口与用法、当前版本、语言/贴边设置截图及动效演示。仓库约定要求后续用户可见变化同时更新两份 README。

开发构建预验证：[17 项贴边与语言检查](validation/alpha12-source-edge-language.json)、[受污染的真实 Nautilus 重连检查](validation/alpha12-source-connection.json)、[124 项完整桌面交互](validation/alpha12-source-desktop.json)、[48 次清单/全景位置切换](validation/alpha12-source-position.json)通过；各报告记录实际运行的开发构建程序 SHA256。源码构建的核心 IPC 与重启恢复也通过。录屏逐帧确认滑出和滑回均存在多个中间位置，未将直接缩窄当作动效。

### alpha.12 安装包验证

应用产物源码提交：`00be17199c1494fa467bdf77ba579b645595e8bc`。后续文档和验证脚本改进不改变应用产物。

- 同一 DEB 在 Ubuntu 22.04 / Nautilus 42、Ubuntu 24.04 / Nautilus 46 隔离 GNOME/X11 桌面安装，分别通过 17 项贴边与语言检查、124 项完整交互、48 次视图位置切换、24 项快捷键恢复检查，以及核心 IPC 和重启恢复。两系统均实际复现受污染的 Nautilus，应用内确认重连后通过真实全局快捷键收集原文件；检查诊断和打开确认界面不重启宿主，独立扩展受到保护。测试完成后卸载并核对系统程序及桥接已移除。
- [22.04 新功能](validation/alpha12-ubuntu22-features.json)、[24.04 新功能](validation/alpha12-ubuntu24-features.json)、[22.04 重连](validation/alpha12-ubuntu22-connection.json)、[24.04 重连](validation/alpha12-ubuntu24-connection.json)、[22.04 桌面](validation/alpha12-ubuntu22-desktop.json)、[24.04 桌面](validation/alpha12-ubuntu24-desktop.json)、[22.04 快捷键](validation/alpha12-ubuntu22-shortcuts.json)、[24.04 快捷键](validation/alpha12-ubuntu24-shortcuts.json)。DEB SHA256 均为 `308123242195eabadc76894114c063f21e99d1a22af95210849141ed5d8605cb`，程序 SHA256 均为 `d850b3564485623f9cbaa803e731d7f803b46a50a631190e1b2d6cedb0d0f791`。
- [Windows 实际安装器](validation/alpha12-windows-installer.json)通过安装、资源授权文本、28 项核心 IPC、5 项重启恢复与卸载。两架构 macOS 实际 DMG 通过只读挂载、校验来源与 SHA256、程序运行及卸载镜像：[Apple Silicon](validation/alpha12-macos-install-aarch64-apple-darwin.json)、[Intel](validation/alpha12-macos-install-x86_64-apple-darwin.json)。
- Ubuntu 22.04 WebKit 在视图初始化期间可能使辅助功能树节点失效，测试等待跳过此瞬态节点后继续读取真实界面；修正仅涉及测试脚本。之前已通过的贴边与 IPC 检查保留，继续运行重连与桌面检查。

[四目标构建与双 Ubuntu 兼容性检查](https://github.com/dogchenya/GatherPack/actions/runs/39914923249)、[两种 macOS DMG 挂载运行](https://github.com/dogchenya/GatherPack/actions/runs/39916456070)均已通过。

## alpha.11 贴边隐藏与中英界面

- 收起的悬浮框靠近屏幕工作区左侧或右侧，位置稳定且鼠标移开约 0.8 秒后收为 10 像素宽的窄条；悬停恢复，拖离边缘解除贴边。展开面板、打包中、取消置顶时保持显示。设置中的“贴边隐藏”默认开启，可关闭并保存。
- 窄条保留在屏幕内，兼容 GNOME 对窗口越界移动的限制。GTK 完成尺寸变更后重新定位右侧窄条，避免旧宽度导致的位置约束。支持高 DPI 和工作区坐标。
- 设置增加“界面语言”：简体中文与 English，默认简体中文。选择后即时预览；取消恢复原语言，保存后重启沿用。旧版设置自动使用中文默认值。
- 收集、文件全景、目录、打包与报告、诊断、提示及辅助功能标签均支持中英。原生窗口标题、托盘菜单和文件选择器标题随保存的语言更新；文件名、来源路径和输出位置保留原样。
- 新增浏览器语言覆盖和文件名保护检查，以及真实 GNOME/X11 的左右隐藏、悬停、展开不隐藏、设置预览/取消、保存和重启恢复检查。安装包验证也执行这组检查。

源码构建检查：[14 项贴边与语言断言](validation/alpha11-source-edge-language.json)、[124 项完整桌面交互](validation/alpha11-source-desktop.json)、[48 次视图位置切换](validation/alpha11-source-position.json)通过。桌面交互包含从 Nautilus 实际拖到隐藏窄条、恢复后收集且不重复加入来源；源码程序的 28 项核心 IPC 和 5 项重启恢复也通过。浏览器中英文界面、设置取消还原、文件名/路径保护、图谱及压缩核心回归均通过。

### alpha.11 安装包验证

应用产物源码提交：`de708b5d5223664c8fb5d491d31e376d6ff6cd6b`。后续产物收集与验证脚本修正不改变应用代码。

- 同一实际 DEB 在 Ubuntu 22.04 和 24.04 安装后，分别通过 14 项新功能断言、124 项完整桌面交互、48 次视图位置切换，以及原生 IPC 和重启恢复；系统扩展升级恢复检查通过，随后卸载并确认程序及系统桥接已移除。[22.04 新功能](validation/alpha11-ubuntu22-features.json)、[24.04 新功能](validation/alpha11-ubuntu24-features.json)、[22.04 桌面](validation/alpha11-ubuntu22-desktop.json)、[24.04 桌面](validation/alpha11-ubuntu24-desktop.json)、[22.04 快捷键](validation/alpha11-ubuntu22-shortcuts.json)、[24.04 快捷键](validation/alpha11-ubuntu24-shortcuts.json)。两系统报告记录的程序 SHA256 一致，DEB SHA256 也一致。
- Ubuntu 24.04 的快捷键验证脚本修正异步读取竞争：等待最终桥接诊断稳定后判断，避免把启动提示或“正在读取”中间态当成最终结果。仅重跑受影响的检查，未改应用程序。
- [Windows 实际安装器](validation/alpha11-windows-installer.json)通过安装、授权资源、28 项核心 IPC、5 项重启恢复以及卸载清理。
- Ubuntu 24.04 的实际 AppImage 通过[14 项新功能检查](validation/alpha11-appimage-features.json)、[22 项快捷键恢复](validation/alpha11-appimage-shortcuts.json)、28 项核心 IPC 和 5 项重启恢复；报告绑定实际下载的 AppImage SHA256。AppImage 使用独立桌面中的解压运行方式验证。
- macOS DMG 打包重试可能留下包含当前版本号的临时磁盘镜像。收集器只接收当前版本和架构的最终文件名，并拒绝缺失或重复的最终包；新增四平台收集测试覆盖临时镜像、旧版、其他架构、缺失和重复包。上传前的完整数量、SHA256 和来源校验继续保留。

[四目标构建与双 Ubuntu 安装检查](https://github.com/dogchenya/GatherPack/actions/runs/39899575054)和[双架构实际 DMG 挂载运行](https://github.com/dogchenya/GatherPack/actions/runs/39901228152)均已成功。Intel DMG 在干净构建重试后通过最终文件数量校验。

[发布资源校验运行](https://github.com/dogchenya/GatherPack/actions/runs/39902527067)成功，18 项资源已完整上传。发布流程核对已存在标签的提交，再使用该标签创建发布，避免 Actions 令牌重复创建历史提交标签时的权限限制；不降低安装包来源和 SHA256 检查。

[v0.1.0-alpha.11 已公开发布](https://github.com/dogchenya/GatherPack/releases/tag/v0.1.0-alpha.11)。标签和发布目标均为上述应用产物提交。六份安装包及对应源码的 GitHub 资产摘要与发布校验和逐项一致，其中 Windows、DEB 和 AppImage 的摘要与实际下载测试包一致。发布页与 DEB 匿名访问均返回 HTTP 200，无需 GitHub 登录。

## alpha.10 窗口位置修正

- 在 Ubuntu 22.04 上用 alpha.9 的实际 deb 程序复现：从清单切到全景一次，窗口顶端从 80 变成 43，见[修复前记录](validation/alpha10-reproduction-alpha9.json)。
- 切换视图不再复用完整展开流程，只调整窗口宽度；保留当前纵向位置和用户手动调整的高度。变宽且超出工作区右侧时仅调整横坐标，缩回清单不再重写窗口位置。
- 无边框 GTK 窗口使用客户端位置计算必要移动，避免把包含隐藏装饰偏移的框架坐标反复写回。完整展开、收起时也只在位置确实需要约束时移动。
- 原生 GNOME/X11 回归覆盖 48 次视图切换：普通位置、右侧边界、窗口下移、手动调整为 600 高度四种状态；逐次核对宽度、高度和坐标。`layout` 验证模式单独执行圆角与位置检查，完整 `gnome` 模式继续执行原有桌面交互检查。

### alpha.10 交付验证

应用产物源码：`b2d49ebd21ec2370e83b43cf9426e2a1f22c5e29`。后续记录和验证脚本元数据更新不改变安装包。

- [四目标构建与 Ubuntu 22.04 / 24.04 安装检查](https://github.com/dogchenya/GatherPack/actions/runs/39895137974)、[两种架构实际 DMG 挂载与运行](https://github.com/dogchenya/GatherPack/actions/runs/39896470947) 全部成功。
- 同一份实际 deb 在 Ubuntu 22.04 / Nautilus 42 和 Ubuntu 24.04 / Nautilus 46 隔离 GNOME/X11 桌面安装，分别通过 48 次位置、宽度和高度断言，随后卸载：[22.04 位置记录](validation/alpha10-ubuntu22-position.json)、[24.04 位置记录](validation/alpha10-ubuntu24-position.json)。两系统[圆角检查](validation/alpha10-ubuntu22-corners.json)和[旧托管扩展清理检查](validation/alpha10-ubuntu24-corners.json)继续通过。
- 实际 AppImage 通过[48 次位置检查](validation/alpha10-appimage-position.json)和[圆角检查](validation/alpha10-appimage-corners.json)。Windows 实际安装包通过[安装、核心场景、重启恢复与卸载](validation/alpha10-windows-installer.json)。
- 补丁候选程序在打包前通过[48 次位置检查](validation/alpha10-candidate-position.json)及[119 项桌面交互回归](validation/alpha10-candidate-gnome.json)。候选程序记录与上述交付包记录分别保留。
- [工件核对记录](validation/alpha10-artifact-verification.json)从实际 deb 解出程序，对照四份安装后记录的程序 SHA256；AppImage、Windows 安装包和上传资源的 SHA256 也一致。[发布校验运行](https://github.com/dogchenya/GatherPack/actions/runs/39896548758)成功，18 项资源已上传。

[v0.1.0-alpha.10 已公开发布](https://github.com/dogchenya/GatherPack/releases/tag/v0.1.0-alpha.10)。

## alpha.9 修正

- 清除新主题对根背景的覆盖；三个平台均启用透明原生窗口，圆角外显示窗口后方内容。收起图标保持外侧留白，面板与弹窗共用圆角裁切。
- 使用 GNOME/X11 合成器像素验证：紫色测试窗口位于程序后方，104×112 收起窗口与 440×760 面板的四角均应显示紫色，面板内部保持不透明。测试脚本为 `scripts/test-window-corners-linux.py`，接入原有 GNOME 原生桌面验证入口。
- 修复 deb 更新后旧用户桥接优先加载的问题；按宿主已加载的 Nautilus/GTK 版本选择 GI 命名空间，并增加实际扩展导入诊断，参见 [快捷键连接说明](nautilus-shortcut.md)。
- 这些修正覆盖已复现的兼容路径，不能仅凭“依赖已安装”断定用户设备上的扩展已经成功加载。

### alpha.9 交付验证

应用产物源码为 `016f23bf5c0ffbc8dbc45eccc38a01f334c857a1`。后续验证脚本和记录更新不改变应用产物。

- [四目标构建与双 Ubuntu 安装验证](https://github.com/dogchenya/GatherPack/actions/runs/39892565133)：全部成功，Linux 构建仍以 GLIBC 2.35 为上限。
- [Apple Silicon / Intel 实际 DMG 挂载验证](https://github.com/dogchenya/GatherPack/actions/runs/39893439954)：两项成功，各自运行原生核心与重启恢复场景。
- Windows 下载的实际 EXE：[安装与卸载](validation/alpha9-windows-installer.json) 成功，安装后的程序通过 28 项核心及 5 项恢复断言。
- 同一个 deb 在 Ubuntu 22.04 / Nautilus 42 与 Ubuntu 24.04 / Nautilus 46 的隔离 GNOME/X11 桌面中安装运行：[22.04 桌面 119 项](validation/alpha9-ubuntu22-deb.json)、[24.04 桌面 119 项](validation/alpha9-ubuntu24-deb.json) 全部通过，验证后卸载成功。
- 两系统均检查收起与展开窗口的四角合成像素，并在启动前植入旧托管用户扩展，验证实际程序清理覆盖文件：[22.04 圆角](validation/alpha9-ubuntu22-corners.json)、[24.04 圆角](validation/alpha9-ubuntu24-corners.json)。
- 两系统均让实际 Nautilus 先导入一个不提供选择服务的旧用户模块，确认 D-Bus 服务缺失；启动新版应用后确认旧模块已移除，重启测试创建的 Nautilus，再通过实际快捷键收集原文件。此后继续验证快捷键冲突恢复、重新注册和 Caps Lock：[22.04 升级 24 项](validation/alpha9-ubuntu22-upgrade.json)、[24.04 升级 24 项](validation/alpha9-ubuntu24-upgrade.json) 全部通过。这项测试覆盖已导入旧模块被 Python 缓存后遮住系统模块的情况。
- [无系统扩展时首次安装与恢复 22 项](validation/alpha9-shortcut-source.json) 通过。Python 3.10 / 当前系统 Python 的 9 项依赖和宿主版本诊断测试通过。
- Ubuntu 24.04 上直接运行交付的 AppImage：[119 项桌面检查](validation/alpha9-ubuntu24-appimage.json) 与[收起、展开四角像素检查](validation/alpha9-appimage-corners.json) 通过。报告中的可执行文件 SHA256 对应最终 AppImage 包。

[alpha.9 发布校验](https://github.com/dogchenya/GatherPack/actions/runs/39894081592) 已通过，18 项安装包、源码、校验与授权材料完整上传，实际测试包的 SHA256 与上传资源一致。

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

原生验证另调用实际 Rust 命令并核对磁盘，覆盖三种压缩格式、引用替换及撤销、撤销后新增内容保留、顺序、清单持久化、输出保护与取消清理。安装包与各系统验证结果见下表；历史版本的证据不代替本次验证。

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

安装包在主分支推送或手动触发时构建；发布标签复用已验证的产物，不再自动触发重复构建。仍可手动指定标签运行构建工作流。图谱缩放回归在节点详情引起的画布重排完成后采集坐标，避免将正常重排误判为缩放失败。

[v0.1.0-alpha.8 已公开发布](https://github.com/dogchenya/GatherPack/releases/tag/v0.1.0-alpha.8)。[发布校验运行](https://github.com/dogchenya/GatherPack/actions/runs/39890473333) 已通过，18 项资源完整上传，版本标签指向上述已验证的应用源码提交。

## 原型与研究参考

设计原型在 [prototypes/gatherpack-v2](../prototypes/gatherpack-v2/README.md)。原型里的文件与系统动作是演示；正式应用不包含模拟桌面、示例文件、自动演示或虚拟打包。

参考 [Dropover](https://dropoverapp.com/) 的浮动收集架、[Yoink](https://apps.apple.com/us/app/yoink/id457622435?mt=12) 的跨窗口暂存，以及 [Dropzone](https://aptonic.com/) 的快捷动作组织。视觉、图标、交互及代码独立实现，未引入上述应用的代码或素材。
