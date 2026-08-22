# dsh-maid-whale-webUI

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.en.md) | 中文

DeepSeek Harness Web UI 的鲸鱼女仆主题插件：亮暗双主题、海洋插画壁纸、手绘九宫格边框，并附带随 DSH 启停、置顶桌面的云鲸桌宠（deepseek-drool 20 动作素材）。

## 效果预览

| 亮色模式 | 暗色模式 |
|---|---|
| [![亮色模式](preview/light.webp)](preview/light.webp) | [![暗色模式](preview/dark.webp)](preview/dark.webp) |

## 安装

### 环境要求

- Windows 10/11 x64（桌宠为原生置顶窗口，仅支持 Windows；纯皮肤部分不限平台）
- 可正常运行的 DSH（DeepSeek Harness）Web UI
- **无需安装 Python 或 Node**——桌宠帮助程序已随包提供（`runtime/bin/win32-x64/dsw-drool-helper.exe`）

### 懒人版

对你的 DSH 说：

```text
安装一下这个皮肤包：https://github.com/yunxiiQwQ/dsh-maid-whale-webUI/tree/main/maid-whale-webui
```

### 手动安装

```powershell
# 1) 完全退出 DSH（含托盘进程）
# 2) 克隆并安装插件
git clone https://github.com/yunxiiQwQ/dsh-maid-whale-webUI.git
cd dsh-maid-whale-webUI
dsh plugin --profile web add ./maid-whale-webui
# 3) 启动 DSH
dsh --profile web
```

启动后皮肤自动应用；云鲸桌宠会自动出现在桌面上。若未出现，到 **设置 → 插件 → 插件配置 → 云鲸桌宠** 检查启用开关。

### 更新与卸载

```powershell
# 更新：本地目录以链接方式安装，拉取后重启 DSH 即生效
git pull

# 卸载（需先完全退出 DSH）
dsh plugin --profile web remove @dsh-external/dsh-client-ui-skin-maid-whale-webui
```

同一时间建议只启用一个界面主题。

## 开发

```powershell
pnpm install
pnpm art:embed            # 从 assets/ 重新生成内嵌皮肤素材
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

桌宠侧（改动 `runtime/`、`assets/pet/` 或 `assets/pet-manifest.json` 后需要重建 exe）：

```powershell
py -3 -m unittest discover -s runtime/tests -t .   # Python 单元测试
pnpm build:helper:windows                           # 重建桌宠 exe（代码与素材冻结其中）
```

`build-helper.ps1` 默认使用 `.build/python-env` 虚拟环境（已被 .gitignore 排除，**不会入库**）。首次构建前自建一次即可：

```powershell
python -m venv .build/python-env
.build/python-env/Scripts/pip install PySide6 pyinstaller
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
- 快捷开关：工作区面板右下角有桌宠开关按钮（角色小图标，点击即时启停；灰化为关闭状态）
- 隐私：不存密钥、不截图、无遥测、不开新端口，只响应 DSH 自身事件

节点侧伴侣代码与 Python runtime 源自 QCYTSN/dsh-dafeiyu（MIT），详见 NOTICE。
