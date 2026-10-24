# 产品演示录制

README 使用一段完整工作流演示，替代分散的功能截图与隐藏动效介绍。中英文 README 共用带中英步骤字幕的 GIF，并提供清晰 MP4。

画面来自 v1.0.0 实际 DEB 安装后的程序，运行在隔离的 Ubuntu 24.04 / GNOME X11 桌面。使用临时示例文件和独立应用数据目录，通过原生可访问性操作及 GTK 文件选择器完成收集、文件画布、移除、撤销、保存和打包。录制期间隐藏鼠标指针，字幕在画面外的独立顶栏展示。

录制脚本仅用于桌面演示，不修改应用程序。`record-product-demo-linux.py` 复用桌面回归脚本中的原生操作辅助函数；提前通过实际界面添加并清空示例清单，待临时通知消失后开始录制。四边隐藏不属于这段工作流的演示内容。

验证记录见 [product-demo-v1.0.0.json](validation/product-demo-v1.0.0.json)：实际 ZIP 交付成功、包含四份示例文件且内容逐字节一致，移除与撤销写入真实清单，原文件不变。开发程序不参与本段录制。

在已有隔离桌面验证环境中，安装实际 DEB，并确保 `ffmpeg` 与 Noto CJK 字体可用后执行：

```sh
bash scripts/validation-desktop-linux.sh demo /usr/bin/gatherpack
python3 scripts/export-product-demo-linux.py
```

原始 MP4 和验证报告保存在 `artifacts/validation/`，导出的 GIF 和 MP4 复制到 `docs/assets/`。输出为原生连续录屏加字幕，没有伪造界面或模拟打包结果。GIF 为 8fps、1120 像素宽的循环版本；MP4 保留原始清晰度。
