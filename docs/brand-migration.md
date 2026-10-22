# GatherPack 品牌迁移

目标版本：**0.1.0-alpha.4**。旧工作名为 easy_pack；alpha.3 的历史产物、哈希和测试记录保留原值，不追溯改名或冒充新版本证据。

## 名称与标识

| 位置 | 新值 |
| --- | --- |
| 产品、窗口、托盘与安装包显示名 | GatherPack |
| GitHub 仓库 | dogchenya/GatherPack |
| npm / Rust 桌面包与可执行文件 | gatherpack / gatherpack.exe |
| Rust 收集引擎 | gatherpack-collection |
| Debian 系统包名 | gather-pack（由产品名转换） |
| 应用标识与用户数据目录名 | io.github.dogchenya.gatherpack |
| 默认输出名 | GatherPack_年月日_时分秒.zip / .7z / .tar.gz |
| Nautilus 扩展 | gatherpack_selection.py |
| Nautilus D-Bus 服务 | io.github.dogchenya.gatherpack.NautilusSelection |

仓库工作目录和既有验证环境的缓存位置无需重命名。安装包、运行时界面、当前构建脚本和文档使用新名称。

## 旧配置迁移

普通启动时，如果新标识下还没有 `state.json`，尝试读取系统应用数据目录中旧标识 `io.github.easy-pack.prototype` 下的清单、设置、最新报告和历史 JSON 报告。

- 先验证旧清单，再复制数据；原文件保留。
- 新版已有清单时不覆盖，也不重复导入。
- 报告只复制普通文件，不跟随链接；目标已有同名记录时保留目标。
- 清单最后原子提交；读取失败时提示原因，旧记录不删除。
- 默认快捷键不变；开机启动以新程序的系统注册状态为准，需要在新版设置中重新启用。
- 隔离验证模式不会读取真实用户的旧配置。

旧版和新版可使用不同安装标识。确认新版清单正常后，可通过系统卸载旧版，避免重复悬浮栏或快捷键冲突。

## 验证与交付顺序

1. 本地完成源码、界面、安装标识、脚本、双语 README 与截图同步。
2. 检查 Windows/Linux 构建、配置导入、真实 IPC、安装卸载和 Linux 桌面流程。
3. 在独立分支执行四目标 CI 和 Mac DMG 包内运行验证；默认分支保留原版。
4. 全部通过后，将现有 GitHub 仓库重命名为 GatherPack，并更新默认分支；保留仓库历史与旧构建证据。

## 本地已通过

- Windows：收集引擎 5 项、桌面持久化/迁移 3 项；安装后的核心 22 项和恢复 5 项真实 IPC，随后成功卸载。
- Linux：收集引擎 7 项、桌面持久化/迁移 4 项；.deb 与 AppImage 分别通过 27 项真实 IPC 和 70 项 GNOME/X11 桌面断言。
- 普通程序启动实测：通过隔离 XDG 目录导入真实旧标识配置，重启时保留新记录，旧数据和源字节不变，共 3 项检查。
- Windows 产品属性、Debian 包名、桌面启动器、包内路径和新品牌截图已核对。
- 531 项组件授权门禁、安装包哈希和对应源码归档的 2286 个文件校验通过。

本地预提交结果见 [local-alpha.4.json](validation/local-alpha.4.json)。最终交付包证据见 [ci-alpha.4.json](validation/ci-alpha.4.json)。

## 最终交付验证

- 四目标构建及每目标 27 项真实 IPC：[CI 39748220404](https://github.com/dogchenya/GatherPack/actions/runs/39748220404)，产物源码提交 `0c4564c8578a515506d6951a38b75c7b4805c3fb`。
- 两种 Mac 架构均挂载实际下载的 DMG，核对名称与标识、授权文本、包内程序 27 项真实 IPC，再卸载卷：[Mac 包验证 39750241415](https://github.com/dogchenya/GatherPack/actions/runs/39750241415)。
- 最终 Windows 安装器通过 6 项安装、产品属性、授权、程序运行和卸载检查；最终 Linux .deb / AppImage 分别通过 27 项真实 IPC 和 70 项 GNOME/X11 桌面断言。
- 最终 AppImage 普通启动导入、重启保护和原始数据保留 3 项通过；对应源码归档 2283 个文件校验通过。
- 每个交付产物的 SHA256、版本、目标架构、源码提交和许可证均已交叉核对；完整值保存在 JSON 证据中。

CI 镜像中预装的 curl/systemd 旧二进制版本曾与已更新的源码索引不一致。构建前现在同步可升级的运行库；无同名升级候选的兼容 ABI 保留。最终包的逐库精确源码检查保持启用。musl 官方站点连接超时后，改为随源码保存此前取得的原始版权全文，并验证固定 SHA256，保留完整授权声明。

以上检查全部通过后才更新默认分支并重命名原仓库，保留提交历史、问题与历史构建。最终证据文档提交不改变已验证的应用源码。

Windows Explorer / macOS Finder 完整桌面交互、Wayland 与其他 Linux 文件管理器仍待专项验证；不将本次构建及 IPC 结果等同于这些环境的验收。
