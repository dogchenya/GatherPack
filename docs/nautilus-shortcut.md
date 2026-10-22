# Ubuntu / GNOME X11 快捷键收集

快捷键已触发但提示 `python3-nautilus` 时，通常是 Nautilus 扩展尚未加载，不能仅凭这条提示判断依赖缺失。

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

## English

A message mentioning `python3-nautilus` can mean that the Nautilus bridge has not loaded, even when the package is installed. On Ubuntu 22.04 / 24.04, install `python3-nautilus` and `python3-gi` using the commands above. Wait for file operations to finish, run `nautilus -q`, then reopen Files and retry the collection shortcut with files selected. Closing the window alone may leave Nautilus running in the background.

AppImage requires this system extension loader separately. Install a local deb with `sudo apt install ./actual-file-name.deb` to resolve dependencies. Updated diagnostics distinguish missing dependencies, an installed but unloaded bridge, an unknown package state, and unavailable Python GI. GatherPack does not automatically close the file manager. Shortcut re-registration does not reload Nautilus extensions.
