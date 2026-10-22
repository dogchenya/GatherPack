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

验证进行中。完成后在本记录追加新版本的确切源码提交、运行编号和产物哈希。
