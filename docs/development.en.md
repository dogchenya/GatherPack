# Development guide

[简体中文](development.md) | **English** · [Back to the project](../README.en.md)

This guide covers development, source builds, and installer maintenance. See the [README](../README.en.md) for downloads and usage, and the [validation record](prototype-validation.md) (Chinese) for tested environments.

<a id="prerequisites"></a>

## Prerequisites

| Tool | Version |
| --- | --- |
| Rust | 1.98.1, pinned in `rust-toolchain.toml` |
| Node.js | 24 |
| pnpm | 11.25.0, pinned in `package.json` |

Platform dependencies:

- **Windows**: Visual Studio C++ Build Tools, Windows SDK, and WebView2.
- **macOS 14+**: Xcode Command Line Tools. Reading Finder selections requires Automation permission.
- **Ubuntu 24.04 x64**: install the packages below. Other distributions require dependency adjustments.

```sh
sudo apt-get update
sudo apt-get install -y build-essential file curl libcurl4t64 libcurl3t64-gnutls libssl-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev libfuse2t64 python3-gi python3-nautilus python3-pyatspi gir1.2-gtk-4.0 x11-utils
```

## Local development

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
```

`pnpm dev` starts a browser preview only. File manager selection, global shortcuts, and archiving require the Tauri desktop application.

## Checks and tests

```sh
pnpm build
cargo fmt --all --check
cargo test --locked -p gatherpack-collection
cargo test --locked -p gatherpack
cargo check --locked -p gatherpack
```

UI integration tests:

```sh
# Windows uses the installed Edge by default; install Chromium on other platforms.
pnpm exec playwright install chromium
pnpm test:ui
```

UI tests use mocked IPC. Once a production executable has been built, run real Rust IPC checks for packing, cancellation, reports, and restart recovery:

```sh
node scripts/test-native.mjs path/to/gatherpack
# On Windows, the executable is named gatherpack.exe.
# Headless Linux: xvfb-run -a dbus-run-session -- node scripts/test-native.mjs path/to/gatherpack
```

Native IPC tests create isolated profiles and fixtures without modifying the normal user profile. Native dialogs, file manager interaction, and physical shortcut input are validated separately.

Run large-file tests as needed. These create and read temporary files larger than 4 GiB:

```sh
cargo test --locked --release -p gatherpack-collection -- --ignored
```

## Build installers

After dependency changes, regenerate complete notices. The build environment needs source caches for the locked dependencies:

```sh
cargo fetch --locked
node scripts/license-notices.mjs
```

Run on the corresponding operating system:

```sh
# Windows x64
pnpm tauri build --bundles nsis -- --locked

# macOS Apple Silicon
pnpm tauri build --target aarch64-apple-darwin --bundles dmg -- --locked

# macOS Intel
pnpm tauri build --target x86_64-apple-darwin --bundles dmg -- --locked

# Ubuntu 24.04 x64: enable deb-src as described below first.
bash scripts/build-linux-release.sh
```

Installers are written to `target/release/bundle/` by default, or `target/<target>/release/bundle/` when `--target` is specified. The executable is named `gatherpack`, with `.exe` on Windows. A custom `CARGO_TARGET_DIR` changes the output root.

The Tauri CLI enables the production protocol automatically. A direct Cargo release build needs `--features custom-protocol` to load the bundled frontend assets.

### Linux AppImage and corresponding source

The release script requires matching source indexes. In Ubuntu 24.04's `/etc/apt/sources.list.d/ubuntu.sources`, change `Types: deb` to `Types: deb deb-src`, then run `sudo apt-get update`.

`scripts/build-linux-release.sh` verifies the pinned AppImage runtime, builds `.deb` and AppImage packages, adds original system library notices, downloads the exact corresponding source versions, and collects installers, checksums, and provenance under `artifacts/x86_64-unknown-linux-gnu/`.

Distribute the generated `corresponding-source.tar` alongside the AppImage. If runtime or source verification fails, review the sources and update the pinned version; keep the notice and source archive steps in place. See [third-party distribution notes](third-party.md) (Chinese) for details.

<a id="linux-integration"></a>

## Linux file manager integration

The validated baseline for direct selection capture is Ubuntu 24.04 with GNOME / X11 and Nautilus. Runtime dependencies include:

```sh
sudo apt-get install -y python3-gi python3-nautilus python3-pyatspi gir1.2-gtk-4.0 x11-utils
```

The `.deb` installs the system extension and dependencies. Source runs and the AppImage prepare a Nautilus extension in the user's data directory on first launch. Quit and restart Nautilus after installation to load it. The application does not close the file manager automatically.

The bridge reads the foreground window's current view without caching previous selections or reading the clipboard. See the [validation record](prototype-validation.md) (Chinese) for Wayland and other file manager status.

## CI and artifacts

| Runner | Rust target | Package |
| --- | --- | --- |
| `windows-2025` | `x86_64-pc-windows-msvc` | NSIS `.exe` |
| `macos-15` | `aarch64-apple-darwin` | `.dmg` |
| `macos-15-intel` | `x86_64-apple-darwin` | `.dmg` |
| `ubuntu-24.04` | `x86_64-unknown-linux-gnu` | `.deb` / AppImage |

The [build workflow](../.github/workflows/prototype.yml) runs checks on main/master pushes, Pull Requests, and manual dispatches. Installer jobs run outside Pull Requests. Version tags matching `v*` also create a draft Release.

The workflow records the actual Rust host and requested target, and executes native IPC only when they match. Four native build targets do not demonstrate cross-OS or Linux ARM64 cross-compilation. The separate [Mac package validation workflow](../.github/workflows/macos-package-validation.yml) can download artifacts from a selected build, mount each DMG, and validate its bundled executable.

Artifacts contain installers, `SHA256SUMS.txt`, source commit/toolchain provenance, and third-party notices. Full local and remote evidence is linked from the [validation record](prototype-validation.md) (Chinese) and [CI summary](brand-migration.md).
