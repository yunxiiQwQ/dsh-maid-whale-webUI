import { describe, expect, it } from 'vitest'
import { chooseOrnaments } from '../src/client/ornament-policy.ts'

describe('ornament policy', () => {
  it('keeps the whale tail alongside all normal-page ornaments', () => {
    expect(
      chooseOrnaments({
        wide: true,
        selectedNav: true,
        dialog: false,
        composerEngaged: false,
        heading: true,
      }),
    ).toEqual(['whaleTail', 'bow', 'bubbles', 'hairWave'])
  })

  it('makes composer and settings ornaments mutually exclusive', () => {
    expect(
      chooseOrnaments({
        wide: true,
        selectedNav: true,
        dialog: true,
        composerEngaged: true,
        heading: true,
      }),
    ).toEqual(['whaleTail', 'bow', 'ribbonTab', 'apronCrest'])
  })

  it('keeps the whale tail, bow, and headband corner on narrow screens', () => {
    expect(
      chooseOrnaments({
        wide: false,
        selectedNav: true,
        dialog: true,
        composerEngaged: false,
        heading: true,
      }),
    ).toEqual(['whaleTail', 'bow', 'headbandCorner'])
  })

  it('keeps the whale tail when no selected navigation target exists', () => {
    expect(
      chooseOrnaments({
        wide: true,
        selectedNav: false,
        dialog: false,
        composerEngaged: true,
        heading: false,
      }),
    ).toEqual(['whaleTail', 'ribbonTab'])
  })
})
