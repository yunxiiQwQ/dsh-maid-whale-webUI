# dsh-maid-whale-webUI

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

English | [中文](README.md)

A whale-maid theme plugin for the DeepSeek Harness Web UI, featuring light and dark modes, ocean-themed illustrated backgrounds, hand-drawn nine-slice frames, and decorative page-edge character art.

## Preview

| Light mode | Dark mode |
|---|---|
| [![Light mode](maid-whale-webui/preview/light.webp)](maid-whale-webui/preview/light.webp) | [![Dark mode](maid-whale-webui/preview/dark.webp)](maid-whale-webui/preview/dark.webp) |

## Installation

### Quick install

Tell your DSH:

```text
Install this skin package: https://github.com/yunxiiQwQ/dsh-maid-whale-webUI/tree/main/maid-whale-webui
```

### Manual installation

```powershell
git clone https://github.com/yunxiiQwQ/dsh-maid-whale-webUI.git
cd dsh-maid-whale-webUI
dsh plugin --profile web add ./maid-whale-webui
```

Refresh or restart the DeepSeek Harness Web UI after installation. Enabling only one UI theme at a time is recommended.

## Development

```powershell
cd maid-whale-webui
pnpm install
pnpm art:embed
pnpm art:embed:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The plugin uses only the official DSH client plugin mechanism. It does not modify the DeepSeek Harness source code or affect model requests.

## License and Disclaimer

The code is licensed under BSD-3-Clause. This is an unofficial community theme whose assets originate from community fan creations. It is not affiliated with DeepSeek.
