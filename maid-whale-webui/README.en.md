# dsh-maid-whale-webUI

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[中文](README.md) | English

A whale-maid theme plugin for the DeepSeek Harness Web UI: light/dark themes, ocean illustration wallpapers, hand-drawn frames, plus a cloud-whale desktop companion (deepseek-drool, 20 actions) that starts and stops with DSH.

## Preview

| Light | Dark |
|---|---|
| [![Light](preview/light.webp)](preview/light.webp) | [![Dark](preview/dark.webp)](preview/dark.webp) |

## Installation

### Requirements

- Windows 10/11 x64 (the companion is a native always-on-top window; the skin itself is platform-agnostic)
- A working DSH (DeepSeek Harness) Web UI
- **No Python or Node needed** — the companion helper ships in the package (`runtime/bin/win32-x64/dsw-drool-helper.exe`)

### Quick install

Tell your DSH:

```text
Install this skin package: https://github.com/yunxiiQwQ/dsh-maid-whale-webUI/tree/main/maid-whale-webui
```

### Manual installation

```powershell
# 1) Fully exit DSH (including the tray process)
# 2) Clone and add the plugin
git clone https://github.com/yunxiiQwQ/dsh-maid-whale-webUI.git
cd dsh-maid-whale-webUI
dsh plugin --profile web add ./maid-whale-webui
# 3) Start DSH
dsh --profile web
```

The skin applies automatically; the cloud-whale companion appears on the desktop. If it does not, check the toggle under **Settings -> Plugins -> Plugin config -> cloud whale companion**.

### Update and uninstall

```powershell
# Update: the local directory is linked into the profile, so pulling + restarting DSH is enough
git pull

# Uninstall (fully exit DSH first)
dsh plugin --profile web remove @dsh-external/dsh-client-ui-skin-maid-whale-webui
```

Only one UI theme should be enabled at a time.

## Development

```powershell
pnpm install
pnpm art:embed            # regenerate embedded skin assets from assets/
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Companion side (rebuild the exe after changing `runtime/`, `assets/pet/`, or `assets/pet-manifest.json`):

```powershell
py -3 -m unittest discover -s runtime/tests -t .   # Python unit tests
pnpm build:helper:windows                           # rebuild the companion exe (code and art are frozen inside)
```

`build-helper.ps1` uses the `.build/python-env` virtual environment by default (git-ignored, **never committed**). Create it once before the first build:

```powershell
python -m venv .build/python-env
.build/python-env/Scripts/pip install PySide6 pyinstaller
```

The plugin uses only the official DSH client plugin mechanism. It does not modify the DeepSeek Harness source code or affect model requests.

## License and Disclaimer

The code is licensed under BSD-3-Clause. This is an unofficial community theme whose assets originate from community fan creations. It is not affiliated with DeepSeek. Node-side companion code and the Python runtime are vendored from QCYTSN/dsh-dafeiyu (MIT), see NOTICE.

## Desktop companion (cloud whale pet)

A DSH-driven desktop companion: it starts with DSH, exits with DSH, and keeps rendering as a transparent always-on-top window while the WebUI is minimized.

- Event-driven state machine: idle -> thinking -> working (searching / commanding / testing sub-poses) -> waiting / success / error; multi-session shown by priority waiting > error > working > thinking > idle
- The character is the deepseek-drool 20-action pack (idle, thinking, working, loading, please, success, error, surprised, eating, ...)
- Desktop interactions: drag (position remembered), click/double-click head-pat reactions, context menu
- Settings: DSH Settings -> Plugins -> Plugin config -> cloud whale companion (size, bubble, activity level, reduced motion, subagents)
- Quick toggle: a pet on/off button sits at the bottom-right corner of the workspace panel (click to start/stop instantly; greyed out when off)
- Privacy: no keys stored, no screenshots, no telemetry, no extra ports; reacts only to DSH events
