import type { OrnamentId } from './ornament-art.generated.ts'

export interface OrnamentState {
  wide: boolean
  selectedNav: boolean
  dialog: boolean
  composerEngaged: boolean
  heading: boolean
}

export function chooseOrnaments(state: OrnamentState): OrnamentId[] {
  const selected: OrnamentId[] = ['whaleTail']

  if (state.selectedNav) selected.push('bow')

  if (!state.wide) {
    if (state.dialog) selected.push('headbandCorner')
    return selected
  }

  selected.push(state.composerEngaged ? 'ribbonTab' : 'bubbles')
  if (state.dialog) selected.push('apronCrest')
  else if (state.heading) selected.push('hairWave')

  return selected
}
