# Maid Whale Web UI

English | [中文](README.zh.md)

DeepSeek Cloud Paper is a presentation-only skin for the DeepSeek Harness web UI. It combines warm paper surfaces, mist-blue accents, a dusk-blue dark palette, and the local `deepseek-drool` Codex pet as a quiet, static page-edge mascot.

The package uses only the official DSH client plugin mechanism. It does not modify DSH source code, inject services, emit Cordis events, or touch model requests. Every style is scoped to `body[data-dsh-deepseek-workshop]`. Unloading the plugin restores the previous title, favicon, body attributes, inline background styles, mascot, and ornament layer.

## Local installation

The repository includes prebuilt artifacts and can be mounted directly:

```powershell
git clone https://github.com/yunxiiQwQ/dsh-maid-whale-webUI.git
cd dsh-maid-whale-webUI
dsh plugin --profile web add ./maid-whale-webui
```

The package's `cordis.patch.yml` adds the client row when the plugin is mounted. Keep only one DSH skin active at a time. Restart or refresh the web UI after installation if the current page does not reload automatically.

## Visual behavior

- Light mode uses paper white, cloud gray, and pale sky blue; dark mode uses dusk-blue paper and moonlit blue accents.
- The static pet rests at the lower-left edge on desktop layouts and does not react to focus or model state.
- Eight hand-drawn, flat-color ImageGen ornaments attach to semantic UI targets such as navigation, the composer, headings, and settings.
- Ornament selection is capped at four items. Composer and settings variants are mutually exclusive, while layouts below 960 px degrade to only the bow and headband corner.
- Navigation, composer, dialogs, menus, selectors, and buttons share the same softly irregular paper treatment.
- Character ornaments are image assets rather than CSS-drawn motifs. All artwork is embedded as WebP data URLs, so the skin makes no external image requests.
- The mascot and all ornaments are hidden when printing.

## Development

```powershell
pnpm art:embed
pnpm test
pnpm build
```

`pnpm art:embed` reproducibly embeds the backgrounds, light and dark WebP ornaments, and nine-slice frames into the client source. The standalone build preset lives in `build/`, and official `@deepseek-ai/*` SDK types resolve from `devDependencies`.

## Model experience

None. This package changes browser presentation only and has no effect on prompts, providers, or KV cache behavior.
