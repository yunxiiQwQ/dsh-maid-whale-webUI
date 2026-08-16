import type { Context } from '@deepseek-ai/cordis'
import { PAPER_BACKDROP_DARK, PAPER_BACKDROP_LIGHT, PET_ART } from './art.ts'
import { ILLUSTRATED_BACKGROUND, SIDEBAR_OCEAN_BACKGROUND } from './background-art.generated.ts'
import css from './deepseek-workshop.module.css'
import { createFrameController } from './frames.ts'
import { createOrnamentController } from './ornaments.ts'

const BODY_ATTR = 'data-dsh-deepseek-workshop'
const SKIN_TITLE = 'DeepSeek 云鲸纸面'
const WIDE_QUERY = '(min-width: 960px)'
const MASCOT_WIDTH = 148
const MASCOT_EDGE_GAP = 12
const SIDEBAR_ATTR = 'data-dsh-sidebar-surface'
const SIDEBAR_BACKGROUND_PROPERTY = '--dsw-sidebar-ocean-background'
const BACKDROP_PROPERTIES = [
  'background-image',
  'background-position',
  'background-size',
  'background-attachment',
  'background-repeat',
] as const

const cls = (name: keyof typeof css): string => css[name] ?? ''

/** Apply the cloud-paper theme and register a complete retraction lifecycle. */
export function apply(ctx: Context): void {
  const body = document.body
  const originalTitle = document.title
  const previous = new Map<string, string>()
  for (const property of BACKDROP_PROPERTIES) {
    previous.set(property, body.style.getPropertyValue(property))
  }

  body.setAttribute(BODY_ATTR, '')

  const mascot = document.createElement('div')
  mascot.className = cls('mascot')
  mascot.dataset.skinChrome = 'mascot'

  const image = document.createElement('img')
  image.className = cls('mascotImage')
  image.src = PET_ART
  image.alt = ''
  image.setAttribute('aria-hidden', 'true')
  mascot.append(image)

  const favicon = document.createElement('link')
  favicon.rel = 'icon'
  favicon.type = 'image/webp'
  favicon.href = PET_ART
  favicon.dataset.deepseekWorkshopIcon = ''
  document.head.append(favicon)

  const media = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY) : undefined
  let sidebarSurface: HTMLElement | undefined
  const clearSidebarSurface = (): void => {
    sidebarSurface?.removeAttribute(SIDEBAR_ATTR)
    sidebarSurface?.style.removeProperty(SIDEBAR_BACKGROUND_PROPERTY)
    sidebarSurface = undefined
  }
  const findSidebarSurface = (): HTMLElement | undefined => {
    const tree = body.querySelector<HTMLElement>('[role="tree"]')
    if (!tree) return undefined
    const treeBounds = tree.getBoundingClientRect()
    const maximumSidebarWidth = Math.max(480, treeBounds.width * 1.75)
    let candidate = tree
    for (let parent = tree.parentElement; parent && parent !== body; parent = parent.parentElement) {
      const bounds = parent.getBoundingClientRect()
      if (bounds.width <= 0) continue
      if (treeBounds.width > 0 && bounds.width > maximumSidebarWidth) break
      candidate = parent
    }
    return candidate
  }
  const syncSidebarSurface = (): void => {
    const next = findSidebarSurface()
    if (next === sidebarSurface && next?.isConnected) return
    clearSidebarSurface()
    if (!next) return
    sidebarSurface = next
    sidebarSurface.setAttribute(SIDEBAR_ATTR, '')
    sidebarSurface.style.setProperty(SIDEBAR_BACKGROUND_PROPERTY, `url("${SIDEBAR_OCEAN_BACKGROUND}")`)
  }
  const syncMascotPosition = (): void => {
    const workspace = body.querySelector<HTMLElement>('[role="tree"]')
    if (!workspace || !mascot.isConnected) return
    const bounds = workspace.getBoundingClientRect()
    if (bounds.width <= 0) return
    const left = Math.round(Math.max(bounds.left + MASCOT_EDGE_GAP, bounds.right - MASCOT_WIDTH - MASCOT_EDGE_GAP))
    const value = `${left}px`
    if (mascot.style.left !== value) mascot.style.left = value
  }
  const syncMascotMount = (): void => {
    if (media?.matches ?? true) {
      if (!mascot.isConnected) body.append(mascot)
      syncMascotPosition()
    } else {
      mascot.remove()
    }
  }
  syncMascotMount()
  syncSidebarSurface()

  const ornaments = createOrnamentController(body, { wide: media?.matches ?? true })
  const frames = createFrameController(body)
  const setBackdrop = (): void => {
    const dark = body.hasAttribute('data-ds-dark-theme')
    const mode = dark ? 'dark' : 'light'
    const haze = dark
      ? 'linear-gradient(rgba(18, 31, 47, 0.52), rgba(18, 31, 47, 0.52))'
      : 'linear-gradient(rgba(255, 254, 249, 0.60), rgba(255, 254, 249, 0.60))'
    const paper = dark ? PAPER_BACKDROP_DARK : PAPER_BACKDROP_LIGHT
    body.style.setProperty('background-image', `${haze}, url("${ILLUSTRATED_BACKGROUND}"), ${paper}`)
    body.style.setProperty('background-position', 'center, calc(50% + 80px) calc(100% - 80px), center, center, center')
    body.style.setProperty('background-size', 'cover, cover, cover, cover, cover')
    body.style.setProperty('background-attachment', 'fixed')
    body.style.setProperty('background-repeat', 'no-repeat')
    mascot.dataset.theme = mode
    ornaments.setMode(mode)
    frames.setMode(mode)
  }

  const syncViewport = (): void => {
    syncMascotMount()
    ornaments.setWide(media?.matches ?? true)
  }

  const syncChrome = (): void => {
    syncMascotPosition()
    syncSidebarSurface()
  }
  const mascotObserver = new MutationObserver(syncChrome)
  mascotObserver.observe(body, { childList: true, subtree: true })
  window.addEventListener('resize', syncChrome)

  setBackdrop()
  document.title = SKIN_TITLE

  const observer = new MutationObserver(setBackdrop)
  observer.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  media?.addEventListener('change', syncViewport)

  ctx.effect(() => () => {
    frames.dispose()
    ornaments.dispose()
    observer.disconnect()
    mascotObserver.disconnect()
    media?.removeEventListener('change', syncViewport)
    window.removeEventListener('resize', syncChrome)
    clearSidebarSurface()
    body.removeAttribute(BODY_ATTR)
    mascot.remove()
    favicon.remove()
    for (const [property, value] of previous) {
      if (value === '') body.style.removeProperty(property)
      else body.style.setProperty(property, value)
    }
    if (document.title === SKIN_TITLE) document.title = originalTitle
  }, 'ui-skin-maid-whale-webui: cloud paper surface')
}
