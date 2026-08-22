# dsh-maid-whale-webUI

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.en.md) | 中文

DeepSeek Harness Web UI 的鲸鱼女仆主题插件，包含亮暗模式、海洋插画背景、手绘九宫格边框与页边角色装饰。

## 效果预览

| 亮色模式 | 暗色模式 |
|---|---|
| [![亮色模式](preview/light.webp)](preview/light.webp) | [![暗色模式](preview/dark.webp)](preview/dark.webp) |

## 安装

### 懒人版

对你的 DSH 说：

```text
安装一下这个皮肤包：https://github.com/yunxiiQwQ/dsh-maid-whale-webUI/tree/main/maid-whale-webui
```

### 手动安装

```powershell
git clone https://github.com/yunxiiQwQ/dsh-maid-whale-webUI.git
cd dsh-maid-whale-webUI
dsh plugin --profile web add ./maid-whale-webui
```

安装后刷新或重启 DeepSeek Harness Web UI。同一时间建议只启用一个界面主题。

## 开发

```powershell
pnpm install
pnpm art:embed
pnpm art:embed:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

插件只使用官方 DSH 客户端插件机制，不修改 DeepSeek Harness 源码，也不影响模型请求。

## 许可与声明

代码使用 BSD-3-Clause 许可。本项目是非官方社区主题，素材来源于社区二创，与 DeepSeek 官方无隶属关系。

## 桌面伴侣（云鲸桌宠）

本插件集成了一个由 DSH 状态驱动的桌面伴侣（桌面宠物），随 DSH 启动自动出现、DSH 退出自动关闭；DSH 最小化后桌宠仍以透明置顶窗口显示在 Windows 桌面上。

- 事件驱动状态机：空闲 → 思考 → 工作（查找 / 执行 / 验证细分动作）→ 等待确认 / 完成 / 错误，多会话按"等待确认 > 错误 > 工作 > 思考 > 空闲"优先展示
- 角色为 deepseek-drool 的 20 动作素材（待机、思考、努力工作、加载、拜托、成功、错误、惊讶、吃东西等）
- 桌面互动：拖动（位置自动保存）、点击/双击摸头反应、右键菜单
- 设置入口：DSH 设置 → 插件 → 插件配置 → 云鲸桌宠（角色大小、气泡、活跃程度、减少动态效果、响应子 Agent）
- 隐私：不存密钥、不截图、无遥测、不开新端口，只响应 DSH 自身事件

桌宠帮助程序为 `runtime/bin/win32-x64/dsw-drool-helper.exe`（PyInstaller 打包，素材冻结其中）。更换 `assets/pet/` 素材或 `assets/pet-manifest.json` 后需重建：

```bash
pnpm build:helper:windows
```

节点侧伴侣代码与 Python runtime 源自 QCYTSN/dsh-dafeiyu（MIT），详见 NOTICE。
