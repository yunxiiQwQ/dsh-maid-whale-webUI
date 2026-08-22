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
  message: '--dsw-frame-message',
  menu: '--dsw-frame-menu',
  panel: '--dsw-frame-panel',
  primaryButton: '--dsw-frame-primary-button',
}

const FRAME_VALUES: Record<FrameId, string> = {
  selectedNav: 'selected-nav',
  composer: 'composer',
  dialog: 'dialog',
  message: 'message',
  menu: 'menu',
  panel: 'panel',
  primaryButton: 'primary-button',
}

const SELECTORS: Record<FrameId, string> = {
  selectedNav: '[role="treeitem"][aria-selected="true"]',
  composer: 'textarea, [contenteditable="true"], input:not([type])',
  dialog: '[role="dialog"]',
  message: ':not(*)',
  menu: '[role="menu"], [role="listbox"], [role="combobox"]',
  panel: 'main > section, [role="main"] > section, [data-settings-section]',
  primaryButton: 'button[type="submit"], button[data-variant="primary"]',
}

const INTERACTIVE_FRAME_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="treeitem"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
].join(', ')

const FRAME_EXCLUSION_SELECTOR = 'a, [role="link"], .mkts, .mkts *'

const CONVERSATION_CSS_MODULES = {
  userMessage: '@deepseek-ai/dsh-client-ui-conversation/MessageItem.module.css',
  assistantMessage: '@deepseek-ai/dsh-client-ui-conversation/AssistantMarkdown.module.css',
  reasoning: '@deepseek-ai/dsh-client-ui-conversation/ReasoningRow.module.css',
} as const

function cssModuleClass(document: Document, moduleId: string, exportName: string): string | undefined {
  const style = Array.from(document.querySelectorAll<HTMLStyleElement>('style[data-plugin-css]')).find(
    (candidate) => candidate.dataset.pluginCss === moduleId,
  )
  const safeExportName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return style?.textContent?.match(new RegExp(`\\.([\\w-]+_${safeExportName})(?=[\\s,{.:#>\\[])`))?.[1]
}

interface MessageTarget {
  target: HTMLElement
  role: 'user' | 'assistant'
}

interface DesiredFrame {
  frame: string
  role?: MessageTarget['role']
}

function messageTargets(body: HTMLElement): MessageTarget[] {
  const document = body.ownerDocument
  const userBubbleClass = cssModuleClass(document, CONVERSATION_CSS_MODULES.userMessage, 'bubble')
  const assistantRootClass = cssModuleClass(document, CONVERSATION_CSS_MODULES.assistantMessage, 'root')
  const assistantBodyClass = cssModuleClass(document, CONVERSATION_CSS_MODULES.assistantMessage, 'body')
  const reasoningRootClass = cssModuleClass(document, CONVERSATION_CSS_MODULES.reasoning, 'root')

  const userMessages = userBubbleClass
    ? Array.from(body.getElementsByClassName(userBubbleClass)).filter(
        (target): target is HTMLElement => target instanceof HTMLElement,
      )
    : []
  const assistantMessages =
    assistantRootClass && assistantBodyClass
      ? Array.from(body.getElementsByClassName(assistantRootClass))
          .filter((target): target is HTMLElement => target instanceof HTMLElement)
          .flatMap((target) => {
            const content = Array.from(target.children).find(
              (child) => child instanceof HTMLElement && child.classList.contains(assistantBodyClass),
            )
            if (!(content instanceof HTMLElement)) return []
            return Array.from(content.children)
              .filter((child): child is HTMLElement => child instanceof HTMLElement)
              .filter((child) => !reasoningRootClass || !child.classList.contains(reasoningRootClass))
          })
      : []

  return [
    ...userMessages.map((target): MessageTarget => ({ target, role: 'user' })),
    ...assistantMessages.map((target): MessageTarget => ({ target, role: 'assistant' })),
  ].filter(({ target }) => isVisible(target, body))
}

function isVisible(target: HTMLElement, body: HTMLElement): boolean {
  if (target.hidden || target.getAttribute('aria-hidden') === 'true') return false
  const checkVisibility = (
    target as HTMLElement & {
      checkVisibility?: (options?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => boolean
    }
  ).checkVisibility
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
  return Array.from(body.querySelectorAll<HTMLElement>(SELECTORS[id])).filter(
    (target) => !target.matches(FRAME_EXCLUSION_SELECTOR) && isVisible(target, body),
  )
}

function hasAccessibleName(button: HTMLElement): boolean {
  return Boolean(
    button.getAttribute('aria-label')?.trim() || button.getAttribute('title')?.trim() || button.textContent?.trim(),
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
  const panelCandidates = visibleCandidates(body, 'panel').filter((panel) =>
    reserved.every((target) => !related(panel, target)),
  )
  const panels = panelCandidates.filter((panel) =>
    panelCandidates.every((candidate) => candidate === panel || !candidate.contains(panel)),
  )
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
    body
      .querySelectorAll<HTMLElement>('[data-dsh-frame], [data-dsh-message-role], [data-dsh-control-row]')
      .forEach((target) => {
        target.removeAttribute('data-dsh-frame')
        target.removeAttribute('data-dsh-message-role')
        target.removeAttribute('data-dsh-control-row')
      })
  }

  const syncResources = (): void => {
    const sharedFrame = FRAME_ART[mode].message
    for (const id of FRAME_IDS) {
      body.style.setProperty(FRAME_PROPERTIES[id], `url("${sharedFrame}")`)
    }
  }

  const sync = (): void => {
    if (disposed) return
    const targets = selectTargets(body)
    const desired = new Map<HTMLElement, DesiredFrame>()
    for (const id of FRAME_IDS) {
      targets.get(id)?.forEach((target) => {
        desired.set(target, { frame: FRAME_VALUES[id] })
      })
    }
    targets.get('composer')?.forEach((target) => {
      const shell = closestBorderedAncestor(target, body)
      if (shell) desired.set(shell, { frame: 'composer-shell' })
    })
    messageTargets(body).forEach(({ target, role }) => {
      desired.set(target, { frame: 'message', role })
    })
    body.querySelectorAll<HTMLElement>('*').forEach((target) => {
      if (
        !(target instanceof HTMLElement) ||
        desired.has(target) ||
        target.matches(FRAME_EXCLUSION_SELECTOR) ||
        !isVisible(target, body)
      )
        return
      const existing = target.dataset.dshFrame
      if (existing === 'control' || existing === 'surface') {
        desired.set(target, { frame: existing })
        return
      }
      if (!target.hasAttribute('data-dsh-frame') && hasRenderedBorder(target, body)) {
        desired.set(target, {
          frame: target.matches(INTERACTIVE_FRAME_SELECTOR) ? 'control' : 'surface',
        })
      }
    })
    body.querySelectorAll<HTMLElement>('[data-dsh-frame], [data-dsh-message-role]').forEach((target) => {
      const next = desired.get(target)
      if (!next) {
        target.removeAttribute('data-dsh-frame')
        target.removeAttribute('data-dsh-message-role')
        return
      }
      if (target.dataset.dshFrame !== next.frame) target.dataset.dshFrame = next.frame
      if (next.role === undefined) target.removeAttribute('data-dsh-message-role')
      else if (target.dataset.dshMessageRole !== next.role) target.dataset.dshMessageRole = next.role
      desired.delete(target)
    })
    desired.forEach((next, target) => {
      target.dataset.dshFrame = next.frame
      if (next.role !== undefined) target.dataset.dshMessageRole = next.role
    })
    syncControlRows()
  }

  const syncControlRows = (): void => {
    const counts = new Map<HTMLElement, number>()
    body.querySelectorAll<HTMLElement>('[data-dsh-frame="control"]').forEach((control) => {
      const parent = control.parentElement
      if (parent && parent !== body) counts.set(parent, (counts.get(parent) ?? 0) + 1)
    })
    const qualified = new Set<HTMLElement>()
    counts.forEach((count, parent) => {
      if (count >= 2) qualified.add(parent)
    })
    body.querySelectorAll<HTMLElement>('[data-dsh-control-row]').forEach((row) => {
      if (qualified.has(row)) qualified.delete(row)
      else row.removeAttribute('data-dsh-control-row')
    })
    qualified.forEach((row) => {
      row.setAttribute('data-dsh-control-row', '')
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
      'aria-hidden',
      'aria-selected',
      'class',
      'data-variant',
      'disabled',
      'hidden',
      'open',
      'role',
      'style',
      'type',
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
