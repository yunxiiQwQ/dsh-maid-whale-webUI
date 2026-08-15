import { FRAME_ART, FRAME_IDS, type FrameId, type FrameMode } from './frame-art.generated.ts'

export interface FrameController {
  sync(): void
  setMode(mode: FrameMode): void
  dispose(): void
}

const FRAME_PROPERTIES: Record<FrameId, string> = {
  selectedNav: '--dsw-frame-selected-nav',
  composer: '--dsw-frame-composer',
  dialog: '--dsw-frame-dialog',
  menu: '--dsw-frame-menu',
  panel: '--dsw-frame-panel',
  primaryButton: '--dsw-frame-primary-button',
}

const FRAME_VALUES: Record<FrameId, string> = {
  selectedNav: 'selected-nav',
  composer: 'composer',
  dialog: 'dialog',
  menu: 'menu',
  panel: 'panel',
  primaryButton: 'primary-button',
}

const SELECTORS: Record<FrameId, string> = {
  selectedNav: '[role="treeitem"][aria-selected="true"]',
  composer: 'textarea, [contenteditable="true"], input:not([type])',
  dialog: '[role="dialog"]',
  menu: '[role="menu"], [role="listbox"], [role="combobox"]',
  panel: 'main > section, [role="main"] > section, [data-settings-section]',
  primaryButton: 'button[type="submit"], button[data-variant="primary"]',
}

const INTERACTIVE_FRAME_SELECTOR = [
  'button', 'input', 'select', 'textarea', '[contenteditable="true"]',
  '[role="button"]', '[role="treeitem"]', '[role="menuitem"]',
  '[role="option"]', '[role="combobox"]',
].join(', ')

function isVisible(target: HTMLElement, body: HTMLElement): boolean {
  if (target.hidden || target.getAttribute('aria-hidden') === 'true') return false
  const checkVisibility = (target as HTMLElement & {
    checkVisibility?: (options?: { checkOpacity?: boolean, checkVisibilityCSS?: boolean }) => boolean
  }).checkVisibility
  if (checkVisibility && !checkVisibility.call(target, { checkOpacity: true, checkVisibilityCSS: true })) return false

  const view = body.ownerDocument.defaultView
  for (let current: HTMLElement | null = target; current; current = current.parentElement) {
    const style = view?.getComputedStyle(current)
    const opacity = Number.parseFloat(style?.opacity ?? '1')
    if (style?.display === 'none' || style?.visibility === 'hidden' || opacity <= 0.05) return false
    if (current === body) break
  }
  return true
}

function visibleCandidates(body: HTMLElement, id: FrameId): HTMLElement[] {
  return Array.from(body.querySelectorAll<HTMLElement>(SELECTORS[id]))
    .filter((target) => isVisible(target, body))
}

function hasAccessibleName(button: HTMLElement): boolean {
  return Boolean(
    button.getAttribute('aria-label')?.trim()
    || button.getAttribute('title')?.trim()
    || button.textContent?.trim(),
  )
}

function related(left: HTMLElement, right: HTMLElement): boolean {
  return left === right || left.contains(right) || right.contains(left)
}

function hasRenderedBorder(target: HTMLElement, body: HTMLElement): boolean {
  const style = body.ownerDocument.defaultView?.getComputedStyle(target)
  if (!style) return false
  return [
    [style.borderTopWidth, style.borderTopStyle],
    [style.borderRightWidth, style.borderRightStyle],
    [style.borderBottomWidth, style.borderBottomStyle],
    [style.borderLeftWidth, style.borderLeftStyle],
  ].some(([width, borderStyle]) => Number.parseFloat(width) > 0 && borderStyle !== 'none')
}

function closestBorderedAncestor(target: HTMLElement, body: HTMLElement): HTMLElement | null {
  for (let current = target.parentElement; current && current !== body; current = current.parentElement) {
    if (isVisible(current, body) && hasRenderedBorder(current, body)) return current
  }
  return null
}

function selectTargets(body: HTMLElement): Map<FrameId, HTMLElement[]> {
  const result = new Map<FrameId, HTMLElement[]>()
  const selectedNav = visibleCandidates(body, 'selectedNav').slice(0, 1)
  const composer = visibleCandidates(body, 'composer').slice(0, 1)
  const dialogs = visibleCandidates(body, 'dialog')
  const menus = visibleCandidates(body, 'menu')
  const reserved = [...composer, ...dialogs, ...menus]
  const panelCandidates = visibleCandidates(body, 'panel')
    .filter((panel) => reserved.every((target) => !related(panel, target)))
  const panels = panelCandidates.filter((panel) => (
    panelCandidates.every((candidate) => candidate === panel || !candidate.contains(panel))
  ))
  const primaryButtons = visibleCandidates(body, 'primaryButton').filter(hasAccessibleName)

  result.set('selectedNav', selectedNav)
  result.set('composer', composer)
  result.set('dialog', dialogs)
  result.set('menu', menus)
  result.set('panel', panels)
  result.set('primaryButton', primaryButtons)
  return result
}

export function createFrameController(body: HTMLElement): FrameController {
  let disposed = false
  let frame: number | undefined
  let mode: FrameMode = 'light'
  const view = body.ownerDocument.defaultView ?? window

  const clearMarkers = (): void => {
    body.querySelectorAll<HTMLElement>('[data-dsh-frame]').forEach((target) => {
      target.removeAttribute('data-dsh-frame')
    })
  }

  const syncResources = (): void => {
    for (const id of FRAME_IDS) {
      body.style.setProperty(FRAME_PROPERTIES[id], `url("${FRAME_ART[mode][id]}")`)
    }
  }

  const sync = (): void => {
    if (disposed) return
    clearMarkers()
    const targets = selectTargets(body)
    for (const id of FRAME_IDS) {
      targets.get(id)?.forEach((target) => {
        target.dataset.dshFrame = FRAME_VALUES[id]
      })
    }
    targets.get('composer')?.forEach((target) => {
      const shell = closestBorderedAncestor(target, body)
      if (shell) shell.dataset.dshFrame = 'composer-shell'
    })
    body.querySelectorAll<HTMLElement>('*').forEach((target) => {
      if (!(target instanceof HTMLElement)
        || target.hasAttribute('data-dsh-frame')
        || !isVisible(target, body)
        || !hasRenderedBorder(target, body)) return
      target.dataset.dshFrame = target.matches(INTERACTIVE_FRAME_SELECTOR) ? 'control' : 'surface'
    })
  }

  const requestFrame = (callback: FrameRequestCallback): number => {
    if (typeof view.requestAnimationFrame === 'function') return view.requestAnimationFrame(callback)
    return view.setTimeout(() => callback(performance.now()), 0)
  }
  const cancelFrame = (handle: number): void => {
    if (typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(handle)
    else view.clearTimeout(handle)
  }
  const schedule = (): void => {
    if (disposed || frame != null) return
    frame = requestFrame(() => {
      frame = undefined
      sync()
    })
  }

  const observer = new MutationObserver(schedule)
  observer.observe(body, {
    attributes: true,
    attributeFilter: [
      'aria-hidden', 'aria-selected', 'class', 'data-variant', 'disabled',
      'hidden', 'open', 'role', 'style', 'type',
    ],
    childList: true,
    characterData: true,
    subtree: true,
  })

  syncResources()
  sync()

  return {
    sync,
    setMode(nextMode) {
      if (disposed) return
      mode = nextMode
      syncResources()
      sync()
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (frame != null) cancelFrame(frame)
      observer.disconnect()
      clearMarkers()
      for (const property of Object.values(FRAME_PROPERTIES)) body.style.removeProperty(property)
    },
  }
}
