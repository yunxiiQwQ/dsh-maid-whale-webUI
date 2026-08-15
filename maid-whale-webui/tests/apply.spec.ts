// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { apply } from '../src/client/index.ts'

let fiber: Fiber | undefined

async function mount(): Promise<Fiber> {
  const mounted = new Context().plugin({ apply })
  await mounted.await()
  return mounted
}

async function tick(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

function installMatchMedia(initial: boolean): { set: (next: boolean) => void } {
  let matches = initial
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    get matches() { return matches },
    media: '(min-width: 960px)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn(() => query))
  return {
    set(next) {
      matches = next
      const event = { matches, media: query.media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

afterEach(async () => {
  await fiber?.dispose()
  fiber = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.cssText = ''
  document.body.removeAttribute('data-dsh-deepseek-workshop')
  document.body.removeAttribute('data-ds-dark-theme')
  document.head.querySelectorAll('link[data-deepseek-workshop-icon]').forEach((node) => node.remove())
  document.title = ''
})

describe('DeepSeek cloud paper skin', () => {
  it('mounts one mascot, paper backdrop, favicon, and title', async () => {
    installMatchMedia(true)
    document.title = 'DeepSeek Harness'
    fiber = await mount()

    expect(document.body.hasAttribute('data-dsh-deepseek-workshop')).toBe(true)
    expect(document.body.querySelectorAll('[data-skin-chrome="mascot"]')).toHaveLength(1)
    expect(document.body.style.getPropertyValue('background-image')).toContain('linear-gradient')
    expect(document.head.querySelector('link[data-deepseek-workshop-icon]')).not.toBeNull()
    expect(document.title).toBe('DeepSeek 云鲸纸面')
  })

  it('switches the backdrop and mascot theme without duplicating DOM', async () => {
    installMatchMedia(true)
    fiber = await mount()
    const light = document.body.style.getPropertyValue('background-image')

    document.body.setAttribute('data-ds-dark-theme', '')
    await tick()

    const mascot = document.body.querySelector<HTMLElement>('[data-skin-chrome="mascot"]')
    expect(document.body.style.getPropertyValue('background-image')).not.toBe(light)
    expect(mascot?.dataset.theme).toBe('dark')
    expect(document.body.querySelectorAll('[data-skin-chrome="mascot"]')).toHaveLength(1)
  })

  it('mounts the illustrated background and retractable semantic frames in both modes', async () => {
    installMatchMedia(true)
    document.body.innerHTML = `
      <nav role="tree"><button role="treeitem" aria-selected="true">Chat</button></nav>
      <main>
        <textarea aria-label="Message"></textarea>
        <section><h2>Workspace</h2></section>
      </main>
      <section role="dialog"><button type="submit">Save</button></section>
      <div role="menu"><button role="menuitem">Open</button></div>
    `
    fiber = await mount()

    expect(document.querySelectorAll('[data-dsh-frame]')).toHaveLength(6)
    const lightBackdrop = document.body.style.getPropertyValue('background-image')
    const lightDialog = document.body.style.getPropertyValue('--dsw-frame-dialog')
    expect(lightBackdrop).toContain('data:image/webp;base64,')
    expect(lightBackdrop).toContain('rgba(255, 254, 249, 0.6)')
    expect(document.body.style.getPropertyValue('background-position'))
      .toBe('center center, calc(50% + 80px) bottom, center center, center center, center center')
    expect(lightDialog).toContain('data:image/webp;base64,')

    document.body.setAttribute('data-ds-dark-theme', '')
    await tick()
    expect(document.body.style.getPropertyValue('background-image')).toContain('rgba(18, 31, 47, 0.52)')
    expect(document.body.style.getPropertyValue('--dsw-frame-dialog')).not.toBe(lightDialog)
    expect(document.querySelectorAll('[data-dsh-frame]')).toHaveLength(6)

    await fiber.dispose()
    fiber = undefined
    expect(document.querySelector('[data-dsh-frame]')).toBeNull()
    expect(document.body.style.getPropertyValue('--dsw-frame-dialog')).toBe('')
    expect(document.body.style.getPropertyValue('background-image')).toBe('')
  })

  it('keeps the mascot absent on narrow screens and responds to query changes', async () => {
    const media = installMatchMedia(false)
    fiber = await mount()
    expect(document.body.querySelector('[data-skin-chrome="mascot"]')).toBeNull()

    media.set(true)
    expect(document.body.querySelector('[data-skin-chrome="mascot"]')).not.toBeNull()
    media.set(false)
    expect(document.body.querySelector('[data-skin-chrome="mascot"]')).toBeNull()
  })

  it('keeps the mascot static and integrates one light-dark ornament layer', async () => {
    installMatchMedia(true)
    document.body.innerHTML = `
      <nav role="tree"><button role="treeitem" aria-selected="true">Chat</button></nav>
      <main><h1>DeepSeek Harness</h1><textarea></textarea></main>
    `
    fiber = await mount()
    const mascot = document.body.querySelector<HTMLElement>('[data-skin-chrome="mascot"]')
    const lightBow = document.body.querySelector<HTMLImageElement>('[data-dsh-ornament="bow"]')?.src

    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('blur'))
    expect(mascot?.hasAttribute('data-state')).toBe(false)
    expect(document.querySelectorAll('[data-skin-chrome="ornaments"]')).toHaveLength(1)

    document.body.setAttribute('data-ds-dark-theme', '')
    await tick()
    expect(document.body.querySelector<HTMLImageElement>('[data-dsh-ornament="bow"]')?.src).not.toBe(lightBow)
  })

  it('anchors the mascot to the workspace tree right edge and follows resizes', async () => {
    installMatchMedia(true)
    document.body.innerHTML = '<nav role="tree"><button role="treeitem">Chat</button></nav>'
    const tree = document.querySelector<HTMLElement>('[role="tree"]')!
    let right = 320
    tree.getBoundingClientRect = vi.fn(() => ({
      x: 0, y: 100, left: 0, top: 100, right, bottom: 780, width: right, height: 680,
      toJSON: () => ({}),
    }))

    fiber = await mount()
    const mascot = document.body.querySelector<HTMLElement>('[data-skin-chrome="mascot"]')!
    expect(mascot.style.left).toBe('160px')

    right = 400
    window.dispatchEvent(new Event('resize'))
    expect(mascot.style.left).toBe('240px')
  })

  it('mounts the ocean art on the full sidebar surface and retracts it', async () => {
    installMatchMedia(true)
    document.body.innerHTML = `
      <div data-test-frame>
        <aside data-test-sidebar>
          <div><nav role="tree"><button role="treeitem">Chat</button></nav></div>
        </aside>
        <main>Conversation</main>
      </div>
    `
    const tree = document.querySelector<HTMLElement>('[role="tree"]')!
    const treeWrapper = tree.parentElement!
    const sidebar = document.querySelector<HTMLElement>('[data-test-sidebar]')!
    const frame = document.querySelector<HTMLElement>('[data-test-frame]')!
    tree.getBoundingClientRect = vi.fn(() => ({
      x: 10, y: 160, left: 10, top: 160, right: 280, bottom: 850, width: 270, height: 690,
      toJSON: () => ({}),
    }))
    treeWrapper.getBoundingClientRect = vi.fn(() => ({
      x: 10, y: 120, left: 10, top: 120, right: 280, bottom: 850, width: 270, height: 730,
      toJSON: () => ({}),
    }))
    sidebar.getBoundingClientRect = vi.fn(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 280, bottom: 900, width: 280, height: 900,
      toJSON: () => ({}),
    }))
    frame.getBoundingClientRect = vi.fn(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900,
      toJSON: () => ({}),
    }))

    fiber = await mount()

    expect(sidebar.hasAttribute('data-dsh-sidebar-surface')).toBe(true)
    expect(sidebar.style.getPropertyValue('--dsw-sidebar-ocean-background')).toContain('data:image/webp;base64,')
    expect(document.body.style.getPropertyValue('background-image')).not.toContain('SIDEBAR_OCEAN_BACKGROUND')

    await fiber.dispose()
    fiber = undefined
    expect(sidebar.hasAttribute('data-dsh-sidebar-surface')).toBe(false)
    expect(sidebar.style.getPropertyValue('--dsw-sidebar-ocean-background')).toBe('')
  })

  it('restores prior writes and removes every owned resource', async () => {
    installMatchMedia(true)
    document.title = 'DeepSeek Harness'
    document.body.style.setProperty('background-image', 'url("https://example.test/prior.png")')
    document.body.style.setProperty('background-attachment', 'scroll')
    fiber = await mount()

    await fiber.dispose()
    fiber = undefined
    document.body.setAttribute('data-ds-dark-theme', '')
    await tick()

    expect(document.body.hasAttribute('data-dsh-deepseek-workshop')).toBe(false)
    expect(document.body.querySelector('[data-skin-chrome="mascot"]')).toBeNull()
    expect(document.body.querySelector('[data-skin-chrome="ornaments"]')).toBeNull()
    expect(document.head.querySelector('link[data-deepseek-workshop-icon]')).toBeNull()
    expect(document.body.style.getPropertyValue('background-image')).toContain('prior.png')
    expect(document.body.style.getPropertyValue('background-attachment')).toBe('scroll')
    expect(document.title).toBe('DeepSeek Harness')
  })
})

describe('DeepSeek cloud paper stylesheet', () => {
  const stylesheet = readFileSync(resolve(process.cwd(), 'src/client/deepseek-workshop.module.css'), 'utf8')

  it('defines the light and dusk-paper token surfaces', () => {
    expect(stylesheet).toContain('body[data-dsh-deepseek-workshop] {')
    expect(stylesheet).toContain('--dsw-alias-bg-base: rgba(251, 250, 245, 0.28)')
    expect(stylesheet).toContain('body[data-dsh-deepseek-workshop][data-ds-dark-theme]')
    expect(stylesheet).toContain('--dsw-alias-bg-base: rgba(23, 36, 53, 0.34)')
  })

  it('keeps the mascot and generated ornament layer responsive', () => {
    expect(stylesheet).toContain('.mascot')
    expect(stylesheet).toContain('.ornamentLayer')
    expect(stylesheet).toContain('.ornamentBow')
    expect(stylesheet).toContain('.ornamentWhaleTail')
    expect(stylesheet).toContain('.ornamentApronCrest')
    expect(stylesheet).toContain('.ornamentHairWave')
    expect(stylesheet).toContain('.ornamentBubbles')
    expect(stylesheet).toContain('.ornamentHeadbandCorner')
    expect(stylesheet).toContain('.ornamentRibbonTab')
    expect(stylesheet).toContain('.ornamentCloudTide')
    expect(stylesheet).toContain('@media (max-width: 959px), print')
  })

  it('polishes semantic DSH components without CSS-drawn character ornaments', () => {
    expect(stylesheet).toContain("body[data-dsh-deepseek-workshop] [role='dialog']")
    expect(stylesheet).toContain("body[data-dsh-deepseek-workshop] [role='treeitem'][aria-selected='true']")
    expect(stylesheet).toContain("body[data-dsh-deepseek-workshop] [role='menu']")
    expect(stylesheet).toContain('body[data-dsh-deepseek-workshop] button')
    expect(stylesheet).toContain("body[data-dsh-deepseek-workshop] :is(textarea, [contenteditable='true'], input:not([type]))")
    expect(stylesheet).not.toContain('@keyframes deepseekCloudPaperFloat')
    expect(stylesheet).not.toContain('.cloud')
    expect(stylesheet).not.toContain('clip-path')
    expect(stylesheet).not.toContain('repeating-linear-gradient')
  })

  it('uses generated nine-slice frames with responsive and printable fallbacks', () => {
    for (const frame of ['selected-nav', 'composer', 'composer-shell', 'dialog', 'menu', 'panel', 'primary-button', 'control', 'surface', 'message']) {
      expect(stylesheet).toContain(`[data-dsh-frame='${frame}']`)
    }
    expect(stylesheet).toContain("[data-dsh-message-role='user']")
    expect(stylesheet).toContain("[data-dsh-message-role='assistant']")
    expect(stylesheet).toContain('inset 0 0 0 2px')
    expect(stylesheet).toContain('border-image-source: var(--dsw-frame-selected-nav)')
    expect(stylesheet).toContain('border-image-slice: 90 120 90 120 fill')
    expect(stylesheet).toContain('border-image-slice: 80 120 90 120 fill')
    expect(stylesheet).toContain('border-image-slice: 55 120 55 120 fill')
    expect(stylesheet).toContain('left: calc(var(--dsw-x) + var(--dsw-w) - 13px)')
    expect(stylesheet).toContain('transform: rotate(5deg) scaleX(-1)')
    expect(stylesheet).toContain('top: calc(var(--dsw-y) - 11px)')
    expect(stylesheet).toContain('left: calc(var(--dsw-x) + var(--dsw-w) + 7px)')
    expect(stylesheet).toContain('width: 48px')
    expect(stylesheet).toContain('height: 43px')
    expect(stylesheet).toContain('top: calc(var(--dsw-y) + var(--dsw-h) - 90px)')
    expect(stylesheet).toContain('left: calc(var(--dsw-x) - 19px)')
    expect(stylesheet).toContain('left: calc(var(--dsw-x) + var(--dsw-w) - 2px)')
    expect(stylesheet).toContain('background-position: center, calc(50% + 80px) center, center, center, center !important')
    expect(stylesheet).toContain('background-image: none !important')
  })

  it('renders interface frames with the approved 35 percent heavier treatment outside targeted rollbacks', () => {
    const frameWidths = {
      'selected-nav': 14,
      composer: 22,
      'composer-shell': 18,
      dialog: 22,
      menu: 16,
      panel: 22,
      'primary-button': 14,
      control: 9,
      surface: 15,
      message: 19,
    }

    for (const [frame, width] of Object.entries(frameWidths)) {
      expect(stylesheet).toMatch(new RegExp(`\\[data-dsh-frame='${frame}'\\][\\s\\S]*?border-image-width: ${width}px`))
    }

    expect(stylesheet).not.toContain('border: 1px solid')
    expect(stylesheet).toContain('border: 2px solid')
    expect(stylesheet).toContain('inset 0 0 0 2px')
    expect(stylesheet).toMatch(/@media \(max-width: 959px\)[\s\S]*?\[data-dsh-frame\][\s\S]*?border-image-width: 12px/)
  })

  it('restores the composer shell and conversation header to their original frame thickness', () => {
    expect(stylesheet).toMatch(/\[data-dsh-frame='composer-shell'\][\s\S]*?border-width: 1px;[\s\S]*?border-image-width: 18px/)
    expect(stylesheet).toMatch(/\[data-slot='conversation\.session\.header'\] > \[data-dsh-frame='surface'\][\s\S]*?border-width: 1px;[\s\S]*?border-image-width: 11px/)
  })

  it('layers the generated ocean art only on the discovered sidebar surface', () => {
    expect(stylesheet).toContain("[data-dsh-sidebar-surface]")
    expect(stylesheet).toContain('var(--dsw-sidebar-ocean-background)')
    expect(stylesheet).toContain('center bottom')
    expect(stylesheet).toContain("[data-ds-dark-theme] [data-dsh-sidebar-surface]")
    expect(stylesheet).toContain('--dsw-specific-sidebar-fill: rgba(246, 249, 247, 0.36)')
    expect(stylesheet).toContain('--dsw-specific-sidebar-fill: rgba(28, 45, 66, 0.48)')
  })
})
