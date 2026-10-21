import { describe, expect, it } from 'vitest'
import { TAPE_INK, TAPE_INK_VARS } from './tapeInk'
import { DARK, LIGHT, contrast } from '../../styles/palette'

describe('tape inks', () => {
  it.each(Object.entries(TAPE_INK))('%s clears 4.5:1 on the paper of both themes', (_, ink) => {
    expect(contrast(ink, DARK.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(ink, LIGHT.paper)).toBeGreaterThanOrEqual(4.5)
  })

  it('exposes every ink as a custom property', () => {
    expect(Object.values(TAPE_INK_VARS).sort()).toEqual(Object.values(TAPE_INK).sort())
  })
})
