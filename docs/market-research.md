# 文件收集与打包助手竞品调研

调研日期：2026-10-22

市场上已有与 GatherPack（原工作名 easy_pack）相似的文件暂存架及拖拽助手。Dropover 在 macOS 上已覆盖收集、快捷键与 ZIP 打包；DropPoint 已提供三大平台的拖拽暂存能力。因此，悬浮收集和跨平台本身都不能单独作为独有卖点。值得进一步验证的是：三端一致的跨目录持续收集与迁移打包体验。

本次依据产品官网、官方文档及维护者仓库开展桌面调研，未安装实测。“未确认”表示查阅资料未提供明确证据，不表示产品一定不支持；平台支持为官方声明，具体桌面环境兼容性仍需实测。本次不构成完整市场穷举。

## GitHub 直接同类补充

2026-10-22 用户要求回到需求讨论后补充检索。前一轮主要关注通用桌面框架，本节改为直接核验产品仓库的功能说明。尚未安装或全面审计源码，README 功能声明不代表本项目已经实测通过。

| 仓库 | 本次页面星数约 | 平台与许可证 | 与本项目直接重叠的能力 | 需要区分的边界 |
| --- | --- | --- | --- | --- |
| [DropPoint](https://github.com/GameGodS3/DropPoint) | 1.1k | Windows、macOS、Linux；GPL v3 | 拖拽文件与文件夹暂存，再统一拖出；全局键唤出窗口 | 未确认内置压缩；唤出窗口不等于直接收集选中项 |
| [ShakePin](https://github.com/foamify/shakepin) | 419 | README 介绍 macOS 源码，也包含 Windows 目录；MIT | 拖拽、文件固定、快速 ZIP 打包，另有图片视频压缩 | Windows 目录存在不等于已验证 Windows 支持；未确认 Linux 支持与三端直接收集 |
| [Wedge](https://github.com/Regncreative/Wedge) | 84 | Windows；MIT | 屏幕边缘收集架、跨目录收集、失效路径提示、ZIP 动作和整架拖出为 ZIP | 全局键用于打开收集架；未确认三端能力或直接读取 Explorer 选中项 |
| [Traydex](https://github.com/ipavlin98/traydex) | 1 | Windows；MIT；alpha | 拖拽暂存、ZIP 打包动作、批量拖出、预览和可配置快捷键 | README 明确没有 Mac/Linux 版；解压 7z/RAR 等不等于支持创建这些格式 |
| [FileShelf](https://github.com/lartpang/FileShelf) | 10 | Windows；MIT | 置顶悬浮图标、文件及文件夹路径暂存、分组、缺失提示、批量拖出 | README 明确不读取文件内容、不注册全局键；侧重路径暂存，不能作为已确认的压缩方案 |
| [PyDrop](https://github.com/Roshan-R/PyDrop) | 36 | Linux、GTK/Python；GPL v3 | 自称 Dropover 开源替代，提供 beta 及源码构建说明，可作为 Linux 路线参考 | README 功能说明较少，未确认压缩、选中即收集及当前 Wayland 兼容性 |

直接同类的产品参考优先级：Wedge 用于观察收集到 ZIP 的完整交互；ShakePin 用于观察文件暂存与快速压缩；DropPoint 用于比较三端覆盖；Traydex 为低星 alpha 补充样本。功能相关性不等于成熟度，不能只按星数选基础项目。

星数复核：同日查询仍以 DropPoint 约 1.1k 最多，其余均少于 500。该样本的关注度不能直接证明市场需求强弱，也不能把前文 Tauri、Electron 等框架的高星数归到这些直接竞品上。

补充结论：不仅商业产品，MIT 开源仓库也已有“收集架加 ZIP”组合，不能将其当作独有卖点。Wedge 还采用 Tauri 2、Rust、React、TypeScript，与我们选定的技术组合相近，但本轮只作需求对比，不继续开发、不引入其代码。

三端一致的选中即收集、可配置多格式、解压目录预览、打包问题检查与结果报告应作为组合体验去验证；本次未证实它们在市场上独有，也未确认上述任一仓库满足全部一期需求。

## 对比范围

对照当前已确认需求：Linux、Windows、macOS；跨文件夹收集；悬浮栏拖拽；快捷键；统一打包。

快捷键需要分别考察：唤出收集栏、收集剪贴板文件、直接收集文件管理器当前选中文件。三者不能等同。

## 产品对比

| 产品 | 桌面平台 | 收集与快捷键 | 内置打包 | 与 GatherPack 的关系 |
| --- | --- | --- | --- | --- |
| Dropover | macOS | 临时悬浮架；支持剪贴板快捷键；可通过 macOS Shortcuts 将 Finder 选中文件加入架子 | 明确提供 Create ZIP Archive 动作 | 功能流程最接近，是主要体验参考 |
| DropPoint | Windows、macOS、Linux | 拖入文件或文件夹后再拖出；全局快捷键创建窗口，未确认直接收集选中文件 | 本次查阅资料未确认 | 平台范围最接近，跨平台不能视为独有优势 |
| Yoink | macOS；另有移动端产品 | 屏幕边缘暂存架；快捷键显隐、恢复项目、收集剪贴板内容 | 本次查阅资料未确认 | 可参考边缘出现、预览和恢复交互 |
| Dropshelf（williamckha） | Windows | 摇动鼠标唤出架子；支持保存架子；发布记录列出剪贴板收集快捷键 | 本次查阅资料未确认 | Windows 原生体验参考 |
| DropIt | Windows | 拖入悬浮图标后按预设规则处理文件 | 官方提供 ZIP、7Z 等压缩动作 | 更偏规则自动化，不能直接等同于持续收集后再统一打包 |
| dragon（mwh/dragon） | Linux 桌面相关，README 描述 X 或 Wayland | 命令行唤出拖拽窗口；target 与 keep 模式可暂存拖入的项目 | 本次查阅资料未确认 | 更偏技术用户的轻量工具，非完整迁移助手 |

## 官方来源与核验要点

### Dropover

- [官网](https://dropoverapp.com/)：收集到临时架子后，统一移动、分享或处理。
- [使用技巧](https://dropoverapp.com/tips)：剪贴板快捷键；Finder 选中文件可借助 macOS Shortcuts 收集，需要配置工作流。
- [动作文档](https://dropoverapp.com/kb/instant-actions)：明确列出 Create ZIP Archive。该文档中的图片 Compress 与通用 ZIP 打包是不同动作。

### DropPoint

- [官网](https://droppoint.netlify.app/)：明确声明支持 Windows、macOS、Linux；快捷键用于启动实例。
- [维护者仓库](https://github.com/GameGodS3/DropPoint)：提供三端安装说明，核心操作是拖入文件或文件夹，再拖到目标位置。

### Yoink

- [官网](https://eternalstorms.at/yoink/mac/)：拖拽时显示边缘架子；快捷键支持显隐、恢复已移出项目及收集剪贴板；提供系统服务和 Quick Action 集成。

### Dropshelf Windows

- [维护者仓库](https://github.com/williamckha/dropshelf-repo)：明确是 Windows 拖拽助手，支持暂存可拖拽内容。
- [发布记录](https://github.com/williamckha/dropshelf-repo/releases)：包括从文件资源管理器右键加入新架子等能力；历史快捷键条目需结合具体版本核验。
- [Microsoft Store](https://apps.microsoft.com/store/detail/9mzpc6p14l7n)：产品商店入口。

注意：此产品与 Pilotmoon 的 macOS Dropshelf 是不同产品。此 GitHub 仓库为问题反馈仓库，不能据此将 Windows 产品称为开源。

### DropIt

- [官网](https://www.dropitproject.com/index.php)：悬浮图标和规则处理，动作包含压缩；官网列出的最新版本为 v8.5.1，日期为 2018 年，当前系统适配需另行核验。
- [压缩教程](https://www.dropitproject.com/dokuwiki/doku.php?id=howto%3Acompress_your_files)：配置 Archiver 后拖入压缩，支持向现有压缩包合并文件。

### dragon

- [维护者仓库](https://github.com/mwh/dragon)：轻量拖拽源和目标窗口；target 加 keep 模式保留拖入项目供再次拖出。具体 X11、Wayland 环境体验待实测。

## 开源状态核验

核验日期：2026-10-22。公开下载、收费与否、使用开源组件，以及拥有 GitHub 页面，均不能单独证明产品本身开源。

| 产品 | 核验结论 | 许可证或依据 |
| --- | --- | --- |
| DropPoint | 已确认开源 | [源码及 GPL v3 许可证](https://github.com/GameGodS3/DropPoint/blob/main/LICENSE) |
| DropIt | 已确认开源 | 官网声明 Open Source；[官方 SourceForge 项目](https://sourceforge.net/projects/dropit/)标注 GPLv2，并提供 Code 入口 |
| dragon | 已确认开源 | [维护者源码仓库](https://github.com/mwh/dragon)标注 GPL v3 |
| Dropover | 未找到产品完整源码及开源许可证，不能作为已确认开源项目 | [官方致谢页](https://dropoverapp.com/acknowledgements)列的是使用的开源组件，并非产品整体开源声明 |
| Yoink（Eternal Storms） | 未找到产品完整源码及开源许可证，不能作为已确认开源项目 | [官网](https://eternalstorms.at/yoink/mac/)提供商业购买；作者公开的部分示例代码不等于 Yoink 完整产品源码 |
| Dropshelf（williamckha） | 公开仓库仅用于问题反馈，未确认产品开源 | [仓库](https://github.com/williamckha/dropshelf-repo)明确标注 issue-only，无完整应用源码 |

若下一步考虑基于现有源码开发，DropPoint 在平台覆盖上最贴近一期需求，可优先评估其代码结构、维护情况和打包扩展成本。此为候选路线，尚未确定技术方案或引入任何竞品代码。

## 对产品定位的判断

以下定位与产品方向已于 2026-10-22 获用户批准；具体一期功能以 [一期需求](requirements.md)为准，竞争优势仍需实测验证：

1. 将定位聚焦为“跨平台文件迁移打包助手”，突出从零散文件到可交付包的完整流程。
2. 在 Linux、Windows、macOS 上提供一致的收集清单和打包规则；分别验证拖拽与快捷键的系统适配。
3. 优先解决迁移中的实际问题：重名文件、目录结构保留、失效路径、重复收集、大文件进度和失败恢复。
4. 区分快捷键唤出和快捷键收集；用户已确认直接读取文件管理器当前选中文件，无需先复制，具体兼容环境仍需验证。
5. 清单跨重启保留、本地处理与保护原文件已获批准并进入一期范围。

本次尚未确认某个产品同时满足“三端、拖拽悬浮栏、直接快捷键收集、跨目录持续积累、统一打包”的全部条件。这是有限调研的结果，不能据此断言市场没有同类完整方案。

## 候选亮点与验证标准

2026-10-22 补充。当前尚无完成的应用及对比实测，因此以下是可争取的差异，不能表述为已经实现的性能或体验优势。Dropover 已有悬浮收集、ZIP 和快捷键；DropPoint 已支持三端且开源。因此，悬浮栏、ZIP、跨平台、开源分别都不是独有功能。来源见 [Dropover 官网](https://dropoverapp.com/)、[DropPoint 官网](https://droppoint.netlify.app/)及前文许可证核验。

已批准定位：开源的跨平台文件迁移打包助手，围绕跨目录收集到压缩包交付提供一致体验。

| 候选亮点 | 用户获得的价值 | 范围状态 | 验证标准 |
| --- | --- | --- | --- |
| 三端选中即收集 | 浏览文件时按键即可加入，不必先复制或自行配置外部工作流 | 能力已确认，需验证兼容边界 | 约定三端环境中，单选、多选、混选准确收集到同一清单，剪贴板旧内容不干扰 |
| 打包前目录预览 | 先看到解压后的结构与同名改名结果，减少拿到包后重新整理 | 已批准，一期 EP-13 | 预览中的路径及命名与实际解压结果一致；变更清单后预览同步更新 |
| 打包前问题检查 | 提前发现失效路径、权限问题和重复来源，减少漏文件 | 已批准，一期 EP-14 | 问题列表可定位到项目；问题未处理或未明确跳过前，不显示完整成功 |
| 打包结果报告 | 知道哪些文件进入包、哪些跳过、哪些改名，便于迁移后核对 | 已批准，一期简版 EP-15 | 显示写入、跳过、失败数量及路径映射；报告默认保留本机，不自动把绝对源路径写入共享包 |
| 可验证的完整性检查 | 对重要迁移内容提供额外核对依据 | 后续候选，建议不纳入一期必做 | 明确源数据版本及校验方式后，检查解压内容一致性，并展示额外耗时 |

用户已批准一期优先将“选中即收集、目录预览、问题检查”打磨成核心体验，结果报告提供简版。可选完整性检查留待后续，不作为一期交付功能。

这些功能是否形成优势，要通过同一任务与竞品对比操作数、设置步骤、完成耗时及遗漏情况；在实测前不宣称市场唯一、速度更快或资源占用更低。

## 后续体验验证

优先验证 Dropover 的收集到 ZIP 流程，以及 DropPoint 的三端拖拽体验。使用同一组任务：从三个目录分批加入文件，加入同名文件与文件夹，尝试快捷键收集，最后统一输出。记录重复处理、原文件行为、清单保留和失败提示；安装与实测尚未执行。
