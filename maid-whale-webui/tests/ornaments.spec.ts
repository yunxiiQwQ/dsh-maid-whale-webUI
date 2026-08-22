// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createOrnamentController, type OrnamentController } from '../src/client/ornaments.ts'

let controller: OrnamentController | undefined

function fixture(): HTMLTextAreaElement {
  document.body.innerHTML = `
    <nav role="tree">
      <button role="treeitem" aria-selected="true">Chat</button>
    </nav>
    <main>
      <h1>DeepSeek Harness</h1>
      <textarea aria-label="Message"></textarea>
    </main>
    <div data-skin-chrome="mascot"></div>
  `
  return document.querySelector('textarea')!
}

async function tick(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 40)
  })
}

afterEach(() => {
  controller?.dispose()
  controller = undefined
  document.body.innerHTML = ''
})

describe('ornament controller', () => {
  it('syncs idempotently, reacts to semantic targets, and disposes owned DOM', async () => {
    const input = fixture()
    controller = createOrnamentController(document.body, { wide: true })

    controller.sync()
    expect(document.querySelectorAll('img[data-dsh-ornament]')).toHaveLength(5)
    expect(document.querySelector('[data-dsh-ornament="bubbles"]')).not.toBeNull()
    expect(document.querySelectorAll('img[data-dsh-ornament][aria-hidden="true"]')).toHaveLength(5)

    controller.sync()
    expect(document.querySelectorAll('img[data-dsh-ornament]')).toHaveLength(5)

    input.focus()
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await tick()
    expect(document.querySelector('[data-dsh-ornament="bubbles"]')).toBeNull()
    expect(document.querySelector('[data-dsh-ornament="ribbonTab"]')).not.toBeNull()

    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    await tick()
    expect(document.querySelector('[data-dsh-ornament="apronCrest"]')).not.toBeNull()
    expect(document.querySelectorAll('img[data-dsh-ornament]')).toHaveLength(5)

    const before = document.querySelector<HTMLImageElement>('[data-dsh-ornament="bow"]')!.src
    controller.setMode('dark')
    expect(document.querySelector<HTMLImageElement>('[data-dsh-ornament="bow"]')!.src).not.toBe(before)

    controller.dispose()
    controller = undefined
    expect(document.querySelector('[data-skin-chrome="ornaments"]')).toBeNull()
    expect(document.querySelector('[data-dsh-ornament-target]')).toBeNull()
  })

  it('keeps only the narrow-screen ornament pair', () => {
    fixture()
    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    controller = createOrnamentController(document.body, { wide: true })
    controller.sync()

    controller.setWide(false)

    expect(
      Array.from(
        document.querySelectorAll<HTMLImageElement>('img[data-dsh-ornament]'),
        (image) => image.dataset.dshOrnament,
      ),
    ).toEqual(['whaleTail', 'bow', 'headbandCorner'])
  })

  it('anchors the whale tail to the workspace label immediately before the tree area', () => {
    document.body.innerHTML = `
      <section>
        <header><span id="workspace-label">工作区</span></header>
        <div><div><div role="tree"><button role="treeitem">Chat</button></div></div></div>
      </section>
      <textarea aria-label="Message"></textarea>
    `
    controller = createOrnamentController(document.body, { wide: true })

    controller.sync()

    expect(document.querySelector('#workspace-label')?.getAttribute('data-dsh-ornament-target')).toBe('whaleTail')
    expect(document.querySelector('[role="tree"]')?.hasAttribute('data-dsh-ornament-target')).toBe(false)
  })

  it('does not decorate a dialog that has transitioned out of view', () => {
    fixture()
    const fadingShell = document.createElement('div')
    fadingShell.style.opacity = '0.001'
    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    fadingShell.append(dialog)
    document.body.append(fadingShell)
    controller = createOrnamentController(document.body, { wide: false })

    controller.sync()

    expect(
      Array.from(
        document.querySelectorAll<HTMLImageElement>('img[data-dsh-ornament]'),
        (image) => image.dataset.dshOrnament,
      ),
    ).toEqual(['whaleTail', 'bow'])
  })
})
