import { describe, expect, it, vi } from 'vitest'
import { releaseFocus } from './releaseFocus'

describe('releaseFocus', () => {
  it('gives focus back to the page after a pointer click', () => {
    const blur = vi.fn()
    releaseFocus({ detail: 1, currentTarget: { blur } })
    expect(blur).toHaveBeenCalledTimes(1)
  })

  it('leaves a keyboard activation where it is', () => {
    // Enter or Space on a focused control clicks it with detail 0: taking
    // focus away would lose the keyboard user's place.
    const blur = vi.fn()
    releaseFocus({ detail: 0, currentTarget: { blur } })
    expect(blur).not.toHaveBeenCalled()
  })
})
