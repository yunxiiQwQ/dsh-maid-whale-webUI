# 云鲸女仆 Web UI

[English](README.md) | 中文

DeepSeek 云鲸纸面是面向 DeepSeek Harness Web UI 的纯客户端主题。它以纸白、云灰、浅海蓝构成亮色纸面，以暮蓝和月光蓝构成暗色纸面，并让本地 `deepseek-drool` Codex pet 作为静态角色安静地停在页面边缘。

本包只使用官方 DSH 客户端插件机制，不修改 DSH 源码，不注入服务，不发送 Cordis 事件，也不触及模型请求。全部样式都限定在 `body[data-dsh-deepseek-workshop]` 下；卸载插件时会还原标题、favicon、body 属性、内联背景样式、pet 和装饰层。

## 本地安装

仓库已包含预构建产物，可直接挂载：

```powershell
git clone https://github.com/yunxiiQwQ/dsh-maid-whale-webUI.git
cd dsh-maid-whale-webUI
dsh plugin --profile web add ./maid-whale-webui
```

挂载插件时，包内 `cordis.patch.yml` 会加入客户端节点。同一时间应只启用一个 DSH 主题；若安装后当前页面没有自动重载，请重启或刷新 Web UI。

## 视觉行为

- 亮色模式使用纸白、云灰和浅天蓝；暗色模式使用暮蓝纸面与月光蓝强调色。
- 宽屏下静态 pet 停在页面左下边缘，不响应窗口焦点或模型状态。
- 8 件 ImageGen 手绘平涂装饰会按语义挂载到导航、输入区、标题和设置等组件。
- 单屏装饰最多 4 件；输入区与设置变体互斥，小于 960 px 时只保留蝴蝶结和发带角饰。
- 导航、输入区、dialog、菜单、选择器和按钮统一采用轻微不规则的纸面处理。
- 角色装饰全部使用图片素材，不用 CSS 绘制图案。全部画面以 WebP data URL 内嵌，不产生外部图片请求。
- 打印时隐藏 pet 与全部装饰。

## 开发验证

```powershell
pnpm art:embed
pnpm test
pnpm build
```

`pnpm art:embed` 会把背景、亮暗 WebP 装饰与九宫格边框可复现地嵌入客户端源码。独立构建预设位于 `build/`，官方 `@deepseek-ai/*` SDK 类型从本包 `devDependencies` 解析。

## 模型体验

无。本包只改变浏览器中的界面呈现，不影响提示词、模型供应商或 KV Cache。
