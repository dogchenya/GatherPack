# 第三方组件与分发材料

应用原创代码采用 MIT。Cargo.lock、pnpm-lock.yaml 锁定版本；第三方组件保留各自授权，不重新授权为 MIT。

Rust 1.98.1 标准库的原始版权与第三方完整授权另保存在 installer-notices/Rust-COPYRIGHT-library.html，并随安装包放入 licenses/。该文件直接复制自本机官方 Rust 1.98.1 工具链的 share/doc/rust/COPYRIGHT-library.html，保留原文；独立于 Cargo.lock 的依赖清单计数。

scripts/license-notices.mjs 生成 THIRD_PARTY_NOTICES.md 与 license-audit.json。当前所有锁定组件均有适用授权全文，审计中的 missingLicenseText 为空。声明采用三种有明确来源的方式：

1. 原样保留依赖包随附的 LICENSE、COPYING、NOTICE 与第三方声明。
2. 平台二进制包未单独携带声明时，沿用同版本上游主包的原始声明（esbuild、Rollup、Tauri CLI）。
3. 上游仅声明标准 SPDX 授权而未附独立全文时，明确选择声明允许的一个授权，提供 SPDX 官方完整条款、包作者/源码元数据及从包内源码原样提取的版权行。保留标准模板中的占位符，不虚构版权持有者，不称其为原始上游授权文件。

第三类条目逐一列在 canonicalTermsFallback，条款来源与 SHA256 记录在 canonicalTerms。对应条款文件随源码保存在 license-terms/。MPL 组件的未修改源码下载地址保留在对应组件声明中。

主要组件包括 Tauri/插件、React、TypeScript、Vite、Rust ZIP/7z/tar/gzip 引擎、serde、chrono、tempfile、unicode-normalization、libc 及开发验证工具。具体授权以每项声明为准。Python Nautilus 选择桥接为本项目 MIT 独立实现；所用 GTK、GIO、Nautilus 扩展 API、AT-SPI 由系统软件包提供，不将其源码重新授权或嵌入应用。

Windows NSIS 下载工具随附的完整 COPYING 已原样保存在 installer-notices/NSIS-COPYING.txt，并并入交付声明；包含压缩模块及其他组件的不同授权。Windows WebView2、macOS WKWebView 使用系统或供应商各自分发条款。WebView2 在线安装引导和系统运行时不是本项目原创代码。

NSIS 原始分发与源码可从[官方项目下载页](https://nsis.sourceforge.io/Download)获取；本机使用版本为 3.13。

Linux .deb 使用系统 WebKitGTK/GTK 等依赖。AppImage 会实际捆绑这些库，因此另行核对：逐次构建记录实际二进制/开发包的原始 copyright 与完整通用条款，未解析项必须为零。对应确切源码包版本的 .dsc、原始压缩包和 Ubuntu 补丁一并保存于对应源码归档；包内 manifest.json 记录版本、来源与声明摘要。部署仅移动库并可能改写 ELF 搜索路径，不修改系统库源码。

AppImage 运行时 fedfad5 的原始 MIT LICENSE、libfuse LGPL、squashfuse、musl、zstd 与 zlib 声明另存于包内 usr/share/doc/gatherpack/appimage-runtime/。对应源码归档包括运行时原始源码/构建脚本、上游固定的 libfuse 3.15.0 源码及补丁、squashfuse 0.5.2 源码；下载校验与上游构建脚本一致。分发 AppImage 时需同时提供 corresponding-source.tar，不将这些第三方库改为 MIT。此部分独立于 Cargo/npm 的 531 项审计。

该目录还保留 AppRun 上游源文件中的原始 MIT 版权与完整许可、linuxdeploy 及 GTK 部署钩子的原始 MIT 声明。AppRun 可执行文件来自 Tauri 的 apprun-old 镜像；提供上游源文件作为许可/来源参考，未声称当前 HEAD 是该镜像的确切构建提交。包装脚本与 GTK 钩子的实际源码随 AppImage 保留；AppRun.wrapped 动态依赖系统 libc，不把系统 libc 静态嵌入该包装器。

复现（先 pnpm install --frozen-lockfile 与 cargo fetch --locked）：

```sh
node scripts/license-notices.mjs
```

可通过 CARGO 环境变量指定 cargo 可执行文件。生成器对无法确定适用完整条款的条目返回非零退出码；CI 将执行此检查。修改依赖后重新生成，不通过删除条目或替换为推测版权主体来消除问题。

构建所用 musl 原始版权文本已原样保存在 installer-notices/musl-COPYRIGHT，来源为官方 https://git.musl-libc.org/cgit/musl/plain/COPYRIGHT；SHA256 为 `b870108ec5e7790e9f9919064f1b9421d62d5f9b0e6c230c6adf7ea2da62e97b`。构建验证哈希后复制至运行时声明，避免因上游站点连接超时丢失授权文本。升级运行时时需重新核对适用声明。
