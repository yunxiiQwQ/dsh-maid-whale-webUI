import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CompanionState } from '../src/host/protocol.js'

const manifestPath = resolve(process.cwd(), 'assets/pet-manifest.json')
const petRoot = resolve(process.cwd(), 'assets/pet')

interface Clip {
  frames: string[]
  frameMs: number
  loop: boolean
  motion?: string
  scale?: number
  offsetX?: number
}

interface PetManifest {
  formatVersion: number
  characterId: string
  maxFrameWidth: number
  maxFrameHeight: number
  clips: Record<string, Clip>
  stateMap: Record<string, string>
  workingActivityMap: Record<string, string>
  idleMicroClips: string[]
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PetManifest

function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(path).subarray(16, 24)
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) }
}

describe('companion pet assets', () => {
  it('keeps the drool character contract', () => {
    expect(existsSync(manifestPath)).toBe(true)
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.characterId).toBe('deepseek-drool')
    expect(manifest.maxFrameWidth).toBe(238)
    expect(manifest.maxFrameHeight).toBe(260)
  })

  it('maps every companion state onto a declared clip', () => {
    for (const state of Object.values(CompanionState)) {
      expect(manifest.stateMap[state], `stateMap[${state}]`).toBeDefined()
      expect(manifest.clips[manifest.stateMap[state]], `clip for ${state}`).toBeDefined()
    }
  })

  it('maps working activities and idle micro clips onto declared clips', () => {
    for (const [activity, clip] of Object.entries(manifest.workingActivityMap)) {
      expect(manifest.clips[clip], `workingActivityMap[${activity}]`).toBeDefined()
    }
    for (const clip of manifest.idleMicroClips) {
      expect(manifest.clips[clip], `idleMicroClips ${clip}`).toBeDefined()
    }
    expect(manifest.idleMicroClips.length).toBeGreaterThan(0)
  })

  it('declares the interaction and walk clips the helper requests', () => {
    for (const clip of [
      'dragging',
      'head_pat',
      'poke',
      'tail',
      'walk_start_left',
      'walk_stop_left',
      'walk_start_right',
      'walk_stop_right',
    ]) {
      expect(manifest.clips[clip], clip).toBeDefined()
    }
  })

  it('ships every referenced frame at the manifest dimensions', () => {
    const referenced = new Set<string>()
    for (const clip of Object.values(manifest.clips)) {
      for (const frame of clip.frames) referenced.add(frame)
    }
    expect(referenced.size).toBeGreaterThan(0)
    for (const frame of referenced) {
      const path = resolve(petRoot, frame)
      expect(existsSync(path), frame).toBe(true)
      const { width, height } = pngSize(path)
      expect({ frame, width, height }).toEqual({
        frame,
        width: manifest.maxFrameWidth,
        height: manifest.maxFrameHeight,
      })
    }
  })
})

describe('one-shot clip durations', () => {
  it('never plays a single-frame non-loop clip as a timed overlay', () => {
    // The helper's animation model only retires a non-loop clip once its frame
    // list runs out, so one-shot poses must repeat their frame to express a
    // visible duration.
    for (const [name, clip] of Object.entries(manifest.clips)) {
      if (clip.loop) continue
      expect({ clip: name, frames: clip.frames.length }).toEqual({
        clip: name,
        frames: Math.max(2, clip.frames.length),
      })
    }
  })

  it('holds each click interaction pose for about two seconds', () => {
    for (const name of ['head_pat', 'poke', 'tail']) {
      const clip = manifest.clips[name]
      const seconds = (clip.frames.length * clip.frameMs) / 1000
      expect(seconds, name).toBeGreaterThanOrEqual(1.9)
      expect(seconds, name).toBeLessThanOrEqual(2.1)
    }
  })
})

describe('per-clip registration', () => {
  it('keeps every calibrated action at the same render scale and offset', () => {
    for (const clip of Object.values(manifest.clips)) {
      expect(clip.scale ?? 1).toBe(1)
      expect(clip.offsetX ?? 0).toBe(0)
    }
  })
})
