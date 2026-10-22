# easy_pack 一期技术与交付建议

调研日期：2026-10-22。
状态：用户已于 2026-10-22 采纳本方案并同意最小原型验证。已开始实现；真实兼容声明以 [原型验证记录](prototype-validation.md)为准。

建议采用 Tauri 2 与 Rust 处理桌面外壳及文件任务，TypeScript 与 React 实现界面；项目独立实现并按 MIT 交付。先验证三端读取选中项与 Linux 悬浮行为，再展开完整界面开发。系统、架构和包格式采用下方有限矩阵，不承诺 Linux 自编译即可获得全部桌面集成功能。

## 参考仓库

星数为本次查看 GitHub 页面显示的近似值，不作为性能或兼容性的证明。

| 仓库 | 星数约 | 本项目参考点 |
| --- | --- | --- |
| [Tauri](https://github.com/tauri-apps/tauri) | 112k | 跨平台桌面外壳、系统 WebView、Rust 后端与官方发布流水线 |
| [Electron](https://github.com/electron/electron) | 123k | 备选桌面框架；全局快捷键和 Wayland portal 支持有官方说明 |
| [LocalSend](https://github.com/localsend/localsend) | 95.1k | 按平台与格式拆分构建任务，再汇总发布产物 |
| [Czkawka](https://github.com/qarmin/czkawka) | 34.4k | 文件处理核心与不同 UI 前端分离、源码构建与桌面发布 |
| [CopyQ](https://github.com/hluk/CopyQ) | 12.5k | 快捷键设置、托盘入口及桌面环境限制说明 |

参考仓库的设计不等于直接复制源码；拟引入的具体依赖、版本和许可证需另行核对。尤其不直接将现有 GPL 产品整体 fork 后改标 MIT。

## 技术框架与代码组织

推荐 Tauri 2、Rust、TypeScript、React、Vite。Rust 负责路径模型、递归扫描、去重、输出命名、压缩、取消及本地持久化；界面负责悬浮栏、清单、预览、设置和报告。

这是根据本项目小型常驻助手形态作出的工程判断，不是性能实测结论。Tauri 使用系统 WebView，Linux 需准备 WebKitGTK 等依赖，不能宣称安装包完全无系统依赖。来源：[Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)。

参考 Czkawka 的核心库与 UI 分离方式，将业务核心、系统选择适配器及 UI 分开。这样可以独立测试压缩与目录规则，也可以先做最小桌面原型。参考：[Czkawka 仓库](https://github.com/qarmin/czkawka)。

不建议因为 DropPoint 已具备三端外壳就直接作为基础改标 MIT；本项目先独立实现。React 只是界面组织选择，不是三端读取选中文件的解决方案。

Electron 为备选：如 Tauri 的 WebView 或 Linux 窗口行为在目标环境出现难以接受的问题，再对比 Electron。Electron 官方已有 Wayland GlobalShortcuts portal 路径，但它同样不提供“任意文件管理器当前选择”的统一读取接口。换框架不能替代系统选择适配验证。来源：[Electron 快捷键文档](https://www.electronjs.org/docs/latest/api/global-shortcut/)。

## 建议兼容矩阵

以下是建议的验收下限，不是已完成兼容声明。系统版本范围是产品取舍，未直接照搬框架支持范围。

| 系统 | 一期正式目标建议 | 文件管理器 | 验收重点 |
| --- | --- | --- | --- |
| Windows | Windows 11 x64 | 系统文件资源管理器 | 当前窗口与当前标签页、单选多选混选、焦点保持 |
| macOS | macOS 14 及以上，Apple Silicon 与 Intel 分别提供产物 | Finder | 当前前台选择、自动化权限允许及拒绝、多窗口 |
| Linux | Ubuntu 24.04 LTS x64、GNOME 与 Nautilus，X11 会话先作为完整流程基线 | Nautilus | 热键、当前选择、拖入、悬浮置顶与位置、依赖及安装 |

Linux Wayland 不能被忽略：GNOME Wayland 作为一期必须先验证的环境；验证后决定是否扩为正式支持。若计划仅承诺 X11 完整体验，需要在发布范围中明确并由用户接受，不能静默把三端快捷键要求降级成 Linux 只有拖拽。

其他 Linux 发行版、KDE Dolphin、Nemo、Thunar，以及 ARM64 初期列为源码适配或实验目标；提供依赖说明与适配接口。源码编译成功、窗口启动和核心快捷键通过是三项不同结果，分别记录。

正式支持应记录实际测试的具体版本，而不把“macOS 14 及以上”等范围当作已全量测试。Windows 桌面和 macOS 桌面的文件选择先列入验证，未验证前不对外承诺。

## 直接收集选中项

共用选择适配器接口：返回来源窗口标识、当前选中项的本地路径，或明确的未选中、不支持、权限失败状态；先取得来源，再显示反馈，避免悬浮栏抢焦点后读错窗口。

| 平台 | 推荐验证路线 | 不能忽略的边界 |
| --- | --- | --- |
| Windows | 原生 Shell/COM 选择接口，关联前台资源管理器视图 | 不能遍历所有后台窗口混合收集；需验证 Windows 11 多标签页 |
| macOS | Finder Apple Events/AppleScript 选择查询 | 前台必须是 Finder；首次授权与拒绝时有明确提示；不读取后台 Finder 的旧选择 |
| Linux Nautilus | 研究配套适配模块传递选择及视图状态，以本机 IPC 通知助手 | 需识别当前来源与选择是否仍有效；不只缓存最后一次选择；必须验证扩展 API 在目标版本上的时机 |

Windows 的 SelectedItems API 明确提供视图选中项：[Microsoft 文档](https://learn.microsoft.com/en-us/windows/win32/shell/shellfolderview-selecteditems)。

Nautilus 的扩展 API 暴露选中文件列表，但这不等于外部应用天然拥有随时查询选择的通用接口；桥接与焦点关联仍属于原型验证工作：[Nautilus API](https://gnome.pages.gitlab.gnome.org/nautilus/vfunc.MenuProvider.get_file_items.html)。查阅页面展示的是开发版 API，必须在目标 Ubuntu 所带版本上复核。

macOS 自动化用途说明参考：[NSAppleEventsUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsappleeventsusagedescription)。具体 Finder 查询代码及所需权限在原型中确认，不预先承诺无需权限。

Linux 配套模块若成为实现所必需，应作为产品安装组成部分，提供安装、启用、卸载说明；它不必对用户暴露右键菜单。若实现需要新增右键功能，则另行处理范围，不自行加入一期。

不采用要求用户先复制的替代流程，也不默认以模拟 Ctrl+C 改写剪贴板作为选中项获取实现。它们不能代替已批准的直接收集验收。

## Linux 快捷键与悬浮行为

不能只依赖 Tauri 的 global-hotkey 后端来承诺 Wayland：本次核验该库仍列 Linux X11 Only。来源：[维护者仓库](https://github.com/tauri-apps/global-hotkey)。

建议 X11 使用框架快捷键能力；Wayland 单独验证 XDG GlobalShortcuts portal，或桌面系统快捷键调用助手命令的注册方式。Portal 负责快捷键触发，不负责查询 Nautilus 当前选中文件。来源：[XDG GlobalShortcuts](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html)。

悬浮置顶、任意移动和位置恢复也要在 Wayland 环境单独验证。若不能满足，明确列出具体受限行为及可选方案，不能将可编译或可启动当作完整兼容。

## 默认快捷键建议

| 操作 | Windows 与 Linux | macOS |
| --- | --- | --- |
| 收集当前选中项 | Ctrl+Alt+Shift+E | Command+Option+Shift+E |

采用 E 对应 easy_pack，避免直接占用常见的复制、粘贴和文件管理器打开键。这是候选组合，不宣称无冲突；首次注册检查冲突，允许改键。Wayland 若由桌面管理绑定，界面展示实际生效组合并提供系统设置引导。

一期先设置一个全局收集键；显隐悬浮栏使用托盘或应用入口，不再预设额外全局组合，减少快捷键冲突。应用窗口内使用常规操作键管理清单，移除清单项目始终不删除源文件。

## 架构与安装包建议

| 平台 | 正式产物建议 | 一期暂缓 |
| --- | --- | --- |
| Windows x64 | NSIS .exe 安装包 | MSI、Windows ARM64、32 位 |
| macOS ARM64 | 独立 .dmg | 合并 Universal 包 |
| macOS x64 | 独立 .dmg | 旧系统额外兼容包 |
| Linux x64 | .deb 与 AppImage；AppImage 作为便携运行产物 | RPM、Flatpak、Snap 多渠道 |
| Linux ARM64 | 源码构建文档；CI 安装包作为实验目标验证 | 未验收前不称正式支持 |

AppImage 不等于覆盖所有 Linux 系统，也不能被当作已完成桌面适配。Linux 自编译文档给出系统依赖清单与可复制的构建步骤。打包能力参考 [Tauri 分发文档](https://v2.tauri.app/distribute/)，多格式发布的结构参考 [LocalSend release workflow](https://github.com/localsend/localsend/blob/main/.github/workflows/release.yml)。

签名与 macOS 公证列为发布准备项：源码构建及 CI 编译不依赖发布者私钥；有发布证书时在受控发布流程注入。未签名的测试产物明确标记，不当作已获得系统信任的正式安装包。

## GitHub Actions 建议

参考 LocalSend 的“按目标拆分、汇总发布”方式，以及 Tauri 官方多 runner 示例。来源：[LocalSend 工作流](https://github.com/localsend/localsend/blob/main/.github/workflows/release.yml)、[Tauri GitHub 流水线](https://v2.tauri.app/distribute/pipelines/github/)。

| 工作流 | 触发方式建议 | 输出 |
| --- | --- | --- |
| 检查 | PR、主分支提交 | 格式、类型、核心单元测试及构建检查，不发布 |
| 构建 | 手动运行、版本 tag | 按系统与架构生成可下载 artifacts |
| 发布 | v* 版本 tag | 汇总安装包、SHA256 校验文件、版本说明，先创建草稿 Release |

构建建议：Windows runner 生成 Windows x64；macOS ARM runner 分别生成 ARM64 与 x64，其中 ARM 到 Intel 属于交叉架构编译；Ubuntu x64 runner 生成 Linux x64。固定实际 runner 镜像和工具链版本，公开脚本与锁文件。

Linux x64 到 ARM64 的真交叉编译需要目标系统依赖、sysroot、工具链和打包验证，单加 Rust target 不足以证明成功。建议先做 .deb 的交叉编译原型，再决定是否纳入安装包发布矩阵；ARM 原生 runner 或 QEMU 构建标明为原生或仿真，不称交叉编译。若用户要求的 CI 交叉编译特指 Linux，该原型是交付前置条件，不能用三端分别构建或 macOS 跨架构替代。

生成安装包后仍在目标系统验证安装、拖拽、选中即收集和打包；无头 CI 通过不替代桌面验收。

## 验证顺序与决策门槛

1. 最小窗口原型：在三端目标环境验证拖入文件、快捷键触发及准确读取当前选中项，多标签页与前台关联需覆盖。
2. Linux 重点验证：Nautilus 选择桥接、Wayland portal 和悬浮行为。任何一项失败，先给出适配方案或具体范围调整建议，不先开发完整 UI 掩盖问题。
3. 构建原型：Windows .exe、两种 macOS .dmg、Linux .deb 与 AppImage；macOS 跨架构与 Linux ARM64 交叉编译单独记录结果。
4. 达标后确定框架、正式兼容矩阵与安装包矩阵，再完成完整业务功能。

用户批准后，已建立 Tauri、Rust、React 原型并开始 Windows 构建检查。当前只是验证阶段；Linux 选择桥接、Wayland、Mac 和 Linux ARM64 交叉编译仍需验证，具体执行证据见 [原型验证记录](prototype-validation.md)。本稿的系统与包矩阵是原型验证目标，不等于所有兼容性已经通过。
