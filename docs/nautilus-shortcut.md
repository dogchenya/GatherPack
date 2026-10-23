# Ubuntu / GNOME X11 快捷键收集

快捷键已触发但提示 `python3-nautilus` 时，通常是 Nautilus 扩展尚未加载，不能仅凭这条提示判断依赖缺失。

alpha.9 会清理本应用遗留在用户目录中的同名托管扩展，避免它覆盖 deb 安装的新版桥接；不会覆盖用户自行编写的扩展。加载时优先匹配 Nautilus 进程已经加载的 GI/GTK 版本。系统扩展仍需在 Nautilus 新进程中加载，升级不会自动关闭文件管理器。

连接失败时，程序会以系统 Python 隔离模式尝试导入实际安装的桥接文件。若缺少 typelib 或导入报错，界面显示具体异常与文件位置；包已安装、模块可以导入但服务尚未出现时，才显示退出后台进程并重新打开的提示。该导入检查不能证明运行中的 Nautilus 已加载扩展。

用户目录优先于系统目录的加载顺序见 [GNOME 官方扩展文档](https://gnome.pages.gitlab.gnome.org/nautilus-python/nautilus-python-overview.html)。

Ubuntu 22.04 / 24.04 可以执行：

```bash
sudo apt update
sudo apt install python3-nautilus python3-gi
```

先等待文件复制、移动等操作完成，再执行：

```bash
nautilus -q
```

随后从桌面重新打开“文件”，选中文件并按收集快捷键。仅关闭文件窗口可能保留 Nautilus 后台进程，新安装的扩展要在进程重新启动后才能加载。GatherPack 不会自动关闭文件管理器。

AppImage 不会自动安装系统的 Nautilus 扩展加载器。deb 的依赖由支持依赖解析的安装器处理；终端安装本地包可使用 `sudo apt install ./实际文件名.deb`。

修正后的诊断会区分：

- 缺少或未完整安装 `python3-nautilus`：显示安装命令。
- 已安装但桥接未加载：说明无需重复安装，提示退出后台进程并重新打开。
- 无法查询安装状态：明确显示状态未知，不直接判断依赖缺失。
- 系统 Python 无法加载 GI：单独提示安装 `python3-gi`。

若重新打开后仍无法加载，可注销并重新登录桌面，使会话和扩展重新初始化。只有显示“快捷键注册失败”时才需要检查快捷键占用，并在解除占用后点击“重新注册”。该按钮可以重试注册和检查桥接，不能代替 Nautilus 加载扩展。

<a id="alpha7-validation"></a>

## alpha.7 安装包验证

最终构建：[39800649107](https://github.com/dogchenya/GatherPack/actions/runs/39800649107)，代码提交 `6c031f92d36cb522cc6aef9ea5eb189b802c9d7a`。完整包哈希、构建来源、逐项结果与候选记录见 [ci-alpha.7.json](validation/ci-alpha.7.json)。

- 7 项诊断单元测试通过，覆盖已安装、锁定版本、缺失、未配置完成及查询失败等状态。
- Ubuntu 22.04 / 24.04 隔离系统分别实际移除、装回并锁定 `python3-nautilus`，三种状态的诊断均通过；测试结束后恢复安装和版本选择状态。
- 同一批最终 deb、AppImage 在两套 GNOME/X11 桌面，每种格式各通过 91 项操作检查；每套系统另通过 20 项快捷键恢复检查，包括“已安装未加载”的提示、重新加载后的实际收集、按键占用恢复和 Caps Lock。
- 两套 Ubuntu 的 deb 安装、27 项真实 IPC、普通启动迁移与卸载通过；AppImage 另通过普通启动迁移、授权材料及对应源码校验。GLIBC 上限保持 2.35。
- Windows 安装包通过安装、版本与授权材料、27 项真实 IPC 和卸载检查；两种 Mac 架构的最终 DMG 通过挂载、包哈希、元数据、授权材料和 27 项真实 IPC 检查。

Linux 桌面结果适用于隔离 GNOME/X11 会话；Wayland，以及 Windows Explorer / macOS Finder 的完整桌面交互范围仍见 [兼容性记录](prototype-validation.md)。

## English

A message mentioning `python3-nautilus` can mean that the Nautilus bridge has not loaded, even when the package is installed. On Ubuntu 22.04 / 24.04, install `python3-nautilus` and `python3-gi` using the commands above. Wait for file operations to finish, run `nautilus -q`, then reopen Files and retry the collection shortcut with files selected. Closing the window alone may leave Nautilus running in the background.

AppImage requires this system extension loader separately. Install a local deb with `sudo apt install ./actual-file-name.deb` to resolve dependencies. Updated diagnostics distinguish missing dependencies, an installed but unloaded bridge, an unknown package state, and unavailable Python GI. GatherPack does not automatically close the file manager. Shortcut re-registration does not reload Nautilus extensions.

<a id="alpha7-validation-en"></a>

### Alpha.7 validation

[Build 39800649107](https://github.com/dogchenya/GatherPack/actions/runs/39800649107) uses commit `6c031f92d36cb522cc6aef9ea5eb189b802c9d7a`. See [the complete evidence](validation/ci-alpha.7.json) for package hashes, provenance, assertions, and candidate history. Seven diagnostic unit tests passed. Both isolated Ubuntu versions passed checks with the real loader removed, restored, and held at its installed version; package states were restored after testing. The same final deb and AppImage passed 91 desktop assertions per format on Ubuntu 22.04 and 24.04 GNOME/X11, plus 20 shortcut recovery assertions per system. Installed native IPC, startup migration, source and license checks passed, with a GLIBC 2.35 limit. Windows installation/uninstallation and both final Mac DMGs also passed their package and native IPC checks. Full Explorer/Finder desktop interaction and Wayland remain outside this validation scope.
