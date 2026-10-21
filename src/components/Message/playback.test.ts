import { describe, expect, it } from 'vitest'
import { encode } from '../../engine/morseEncoder'
import { buildTimeline } from '../../engine/timingEngine'
import { messageCells } from '../../game/messageLink'
import { defaultSettings, WPM_PRESETS } from '../../storage/settings'
import { cellOwners, cellsToMorse, messageTiming, nearestSpeed } from './playback'

describe('cellsToMorse', () => {
  it.each(['SOS', 'HI YOU', 'MEET ME AT NINE', 'A'])('matches the encoder for %s', (text) => {
    expect(cellsToMorse(messageCells(text))).toBe(encode(text))
  })
})

describe('cellOwners', () => {
  it('gives every tone to the cell that keys it, in order', () => {
    const cells = messageCells('HI YOU')
    const timeline = buildTimeline(cellsToMorse(cells), { wpm: 20 })
    const owners = cellOwners(timeline, cells)

    expect(owners).toHaveLength(timeline.length)
    const toneOwners = timeline.flatMap((element, i) => (element.on ? [owners[i]] : []))
    const expected = cells.flatMap((cell) => Array.from(cell.code, () => cell.index))
    expect(toneOwners).toEqual(expected)
  })

  it('never lights the word gap cell, and holds the last letter through gaps', () => {
    const cells = messageCells('E T')
    const timeline = buildTimeline(cellsToMorse(cells), { wpm: 20 })
    const owners = cellOwners(timeline, cells)
    expect(owners).not.toContain(1) // the space
    expect(owners[0]).toBe(0)
    expect(owners.at(-1)).toBe(2)
  })
})

describe('speeds', () => {
  it('snaps to the nearest offered preset', () => {
    expect(nearestSpeed(WPM_PRESETS.beginner)).toBe(WPM_PRESETS.beginner)
    expect(nearestSpeed(14)).toBe(WPM_PRESETS.normal)
    expect(nearestSpeed(40)).toBe(WPM_PRESETS.advanced)
  })

  it('keeps the listener’s Farnsworth spacing, never above the character speed', () => {
    const settings = defaultSettings()
    expect(messageTiming(25, settings)).toEqual({
      wpm: 25,
      farnsworthWpm: settings.timing.farnsworthWpm,
    })
    expect(messageTiming(5, settings)).toEqual({ wpm: 5, farnsworthWpm: 5 })
  })
})
