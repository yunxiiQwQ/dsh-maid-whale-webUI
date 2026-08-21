// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createFrameController, type FrameController } from '../src/client/frames.ts'

let controller: FrameController | undefined

function fixture(): { dialog: HTMLElement, firstPanel: HTMLElement, secondPanel: HTMLElement } {
  document.body.innerHTML = `
    <nav role="tree"><button role="treeitem" aria-selected="true">Chat</button></nav>
    <main>
      <textarea aria-label="Message"></textarea>
      <section data-panel><h2>Workspace</h2></section>
      <section data-panel><h2>Activity</h2></section>
    </main>
    <section role="dialog"><button type="submit">Save</button></section>
    <div role="menu"><button role="menuitem">Open</button></div>
  `
  return {
    dialog: document.querySelector('[role="dialog"]')!,
    firstPanel: document.querySelectorAll<HTMLElement>('main > section')[0],
    secondPanel: document.querySelectorAll<HTMLElement>('main > section')[1],
  }
}

async function tick(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 40) })
}

function mountConversationCssModules(): void {
  const modules = [
    ['@deepseek-ai/dsh-client-ui-conversation/MessageItem.module.css', '.message_bubble{background:blue}'],
    ['@deepseek-ai/dsh-client-ui-conversation/AssistantMarkdown.module.css', '.assistant_root{display:flex}.assistant_body{display:flex}'],
    ['@deepseek-ai/dsh-client-ui-conversation/ReasoningRow.module.css', '.reasoning_root{display:flex}'],
  ] as const
  for (const [id, css] of modules) {
    const style = document.createElement('style')
    style.dataset.pluginCss = id
    style.textContent = css
    document.head.append(style)
  }
}

afterEach(() => {
  controller?.dispose()
  controller = undefined
  document.body.innerHTML = ''
  document.body.style.cssText = ''
  document.head.querySelectorAll('style[data-plugin-css]').forEach((style) => style.remove())
})

describe('frame controller', () => {
  it('marks semantic targets idempotently and updates every frame resource by mode', () => {
    const { firstPanel, secondPanel } = fixture()
    controller = createFrameController(document.body)

    controller.sync()
    controller.sync()

    expect(document.querySelectorAll('[data-dsh-frame="selected-nav"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-dsh-frame="composer"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-dsh-frame="dialog"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-dsh-frame="menu"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-dsh-frame="panel"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-dsh-frame="primary-button"]')).toHaveLength(1)
    expect(firstPanel.dataset.dshFrame).toBe('panel')
    expect(secondPanel.dataset.dshFrame).toBe('panel')

    const lightDialog = document.body.style.getPropertyValue('--dsw-frame-dialog')
    const lightMessage = document.body.style.getPropertyValue('--dsw-frame-message')
    expect(lightDialog).toContain('data:image/webp;base64,')
    expect(lightMessage).toContain('data:image/webp;base64,')
    for (const property of [
      '--dsw-frame-selected-nav',
      '--dsw-frame-composer',
      '--dsw-frame-dialog',
      '--dsw-frame-menu',
      '--dsw-frame-panel',
      '--dsw-frame-primary-button',
    ]) {
      expect(document.body.style.getPropertyValue(property)).toBe(lightMessage)
    }
    controller.setMode('dark')
    expect(document.body.style.getPropertyValue('--dsw-frame-dialog')).not.toBe(lightDialog)
    expect(document.body.style.getPropertyValue('--dsw-frame-message')).not.toBe(lightMessage)
  })

  it('decorates every visible non-semantic element that already has a rendered border', () => {
    fixture()
    const borderedButton = document.createElement('button')
    borderedButton.textContent = 'Secondary action'
    borderedButton.style.border = '1px solid rgb(20, 30, 40)'
    const borderedSurface = document.createElement('article')
    borderedSurface.style.border = '2px solid rgb(20, 30, 40)'
    const borderedBadge = document.createElement('span')
    borderedBadge.textContent = 'Preview'
    borderedBadge.style.border = '1px solid rgb(20, 30, 40)'
    const borderlessButton = document.createElement('button')
    borderlessButton.textContent = 'Plain action'
    borderlessButton.style.border = '0 none transparent'
    document.body.append(borderedButton, borderedSurface, borderedBadge, borderlessButton)

    controller = createFrameController(document.body)
    controller.sync()

    expect(borderedButton.dataset.dshFrame).toBe('control')
    expect(borderedSurface.dataset.dshFrame).toBe('surface')
    expect(borderedBadge.dataset.dshFrame).toBe('surface')
    expect(borderlessButton.hasAttribute('data-dsh-frame')).toBe(false)
  })

  it('does not frame bordered inline links inside conversation content', () => {
    fixture()
    const sourceLink = document.createElement('a')
    sourceLink.href = 'https://example.com/source'
    sourceLink.textContent = 'DeepSeek Open Sources'
    sourceLink.style.borderBottom = '1px solid currentColor'
    document.querySelector('main')!.append(sourceLink)

    controller = createFrameController(document.body)
    controller.sync()

    expect(sourceLink.hasAttribute('data-dsh-frame')).toBe(false)
  })

  it('promotes the nearest bordered composer ancestor to a dedicated shell frame', () => {
    fixture()
    const textarea = document.querySelector('textarea')!
    const shell = document.createElement('div')
    shell.style.border = '1px solid rgb(20, 30, 40)'
    textarea.replaceWith(shell)
    shell.append(textarea)

    controller = createFrameController(document.body)
    controller.sync()

    expect(textarea.dataset.dshFrame).toBe('composer')
    expect(shell.dataset.dshFrame).toBe('composer-shell')
  })

  it('frames sent messages and final assistant replies without framing reasoning-only rows', () => {
    fixture()
    mountConversationCssModules()
    const userMessage = document.createElement('div')
    userMessage.className = 'message_bubble'
    userMessage.textContent = 'Sent message'
    const assistantReply = document.createElement('div')
    assistantReply.className = 'assistant_root'
    assistantReply.innerHTML = '<div class="assistant_body"><div class="reasoning_root">Think before answering</div><article data-final-reply>Final reply</article></div>'
    const finalReply = assistantReply.querySelector<HTMLElement>('[data-final-reply]')!
    const reasoningOnly = document.createElement('div')
    reasoningOnly.className = 'assistant_root'
    reasoningOnly.innerHTML = '<div class="assistant_body"><div class="reasoning_root">Think</div></div>'
    document.querySelector('main')!.append(userMessage, assistantReply, reasoningOnly)

    controller = createFrameController(document.body)
    controller.sync()

    expect(userMessage.dataset.dshFrame).toBe('message')
    expect(userMessage.dataset.dshMessageRole).toBe('user')
    expect(assistantReply.hasAttribute('data-dsh-frame')).toBe(false)
    expect(finalReply.dataset.dshFrame).toBe('message')
    expect(finalReply.dataset.dshMessageRole).toBe('assistant')
    expect(assistantReply.querySelector('.reasoning_root')?.hasAttribute('data-dsh-frame')).toBe(false)
    expect(reasoningOnly.hasAttribute('data-dsh-frame')).toBe(false)
    expect(reasoningOnly.hasAttribute('data-dsh-message-role')).toBe(false)
  })

  it('keeps existing message markers stable across repeated synchronization', async () => {
    fixture()
    mountConversationCssModules()
    const assistantReply = document.createElement('div')
    assistantReply.className = 'assistant_root'
    assistantReply.innerHTML = '<div class="assistant_body"><article data-final-reply>Final reply</article></div>'
    const finalReply = assistantReply.querySelector<HTMLElement>('[data-final-reply]')!
    document.querySelector('main')!.append(assistantReply)
    controller = createFrameController(document.body)

    const changedAttributes: string[] = []
    const observer = new MutationObserver((records) => {
      changedAttributes.push(...records.flatMap((record) => record.attributeName ?? []))
    })
    observer.observe(finalReply, {
      attributes: true,
      attributeFilter: ['data-dsh-frame', 'data-dsh-message-role'],
    })

    controller.sync()
    controller.sync()
    await Promise.resolve()
    observer.disconnect()

    expect(finalReply.dataset.dshFrame).toBe('message')
    expect(finalReply.dataset.dshMessageRole).toBe('assistant')
    expect(changedAttributes).toEqual([])
  })

  it('ignores hidden targets, nested panels, and unnamed icon-only primary buttons', () => {
    fixture()
    const fadingShell = document.createElement('div')
    fadingShell.style.opacity = '0.001'
    const hiddenDialog = document.createElement('section')
    hiddenDialog.setAttribute('role', 'dialog')
    fadingShell.append(hiddenDialog)
    document.body.append(fadingShell)

    const outer = document.createElement('section')
    outer.dataset.settingsSection = ''
    const inner = document.createElement('section')
    inner.dataset.settingsSection = ''
    outer.append(inner)
    document.querySelector('main')!.append(outer)

    const iconOnly = document.createElement('button')
    iconOnly.dataset.variant = 'primary'
    iconOnly.innerHTML = '<svg></svg>'
    document.body.append(iconOnly)

    controller = createFrameController(document.body)
    controller.sync()

    expect(hiddenDialog.hasAttribute('data-dsh-frame')).toBe(false)
    expect(outer.dataset.dshFrame).toBe('panel')
    expect(inner.hasAttribute('data-dsh-frame')).toBe(false)
    expect(iconOnly.hasAttribute('data-dsh-frame')).toBe(false)
  })

  it('mounts delayed targets and removes markers, variables, observers, and scheduled work', async () => {
    const { dialog } = fixture()
    document.querySelector('[role="menu"]')?.remove()
    controller = createFrameController(document.body)

    const lateMenu = document.createElement('div')
    lateMenu.setAttribute('role', 'menu')
    document.body.append(lateMenu)
    await tick()
    expect(lateMenu.dataset.dshFrame).toBe('menu')

    dialog.parentElement!.style.opacity = '0.001'
    controller.sync()
    expect(dialog.hasAttribute('data-dsh-frame')).toBe(false)

    controller.dispose()
    controller = undefined
    expect(document.querySelector('[data-dsh-frame]')).toBeNull()
    for (const property of [
      '--dsw-frame-selected-nav',
      '--dsw-frame-composer',
      '--dsw-frame-dialog',
      '--dsw-frame-message',
      '--dsw-frame-menu',
      '--dsw-frame-panel',
      '--dsw-frame-primary-button',
    ]) {
      expect(document.body.style.getPropertyValue(property)).toBe('')
    }

    const afterDispose = document.createElement('div')
    afterDispose.setAttribute('role', 'menu')
    document.body.append(afterDispose)
    await tick()
    expect(afterDispose.hasAttribute('data-dsh-frame')).toBe(false)
  })
})
