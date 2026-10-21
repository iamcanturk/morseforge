import { describe, expect, it } from 'vitest'
import { initialChannels } from './player'

describe('initialChannels (A-18): a player starts where the Signal setting says', () => {
  it('plays the tone, with the lamp only if the page asked for it, on Sound', () => {
    expect(initialChannels({ signal: 'sound' }, false)).toEqual({ sound: true, lamp: false })
    expect(initialChannels({ signal: 'sound' }, true)).toEqual({ sound: true, lamp: true })
  })

  it('is silent with the lamp on, on Lamp', () => {
    expect(initialChannels({ signal: 'lamp' }, false)).toEqual({ sound: false, lamp: true })
    expect(initialChannels({ signal: 'lamp' }, true)).toEqual({ sound: false, lamp: true })
  })

  it('sounds and lights, on Both', () => {
    expect(initialChannels({ signal: 'both' }, false)).toEqual({ sound: true, lamp: true })
  })
})
