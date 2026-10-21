import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { shouldCommitEarly } from './useMorseKey'

describe('shouldCommitEarly', () => {
  it('never commits without a rule, so existing callers keep the gap', () => {
    expect(shouldCommitEarly('.')).toBe(false)
    expect(shouldCommitEarly('.-')).toBe(false)
  })

  it('commits as soon as the rule accepts the pending elements', () => {
    const rule = (pending: string) => pending === '.-'
    expect(shouldCommitEarly('.', rule)).toBe(false)
    expect(shouldCommitEarly('.-', rule)).toBe(true)
    expect(shouldCommitEarly('.--', rule)).toBe(false)
  })

  it('never commits an empty buffer, even if the rule would accept one', () => {
    expect(shouldCommitEarly('', () => true)).toBe(false)
  })
})

/**
 * The hook has no DOM-free seam for its effects, so the wiring of Esc is pinned
 * in the source. The behaviour behind it (Esc mid-character leaves nothing to
 * commit, and the next element starts a fresh character) is tested against the
 * real engine in `engine/bindKeyboard.test.ts`.
 */
describe('Esc in useMorseKey (A11Y-08)', () => {
  const source = readFileSync(fileURLToPath(new URL('./useMorseKey.ts', import.meta.url)), 'utf8')

  it('hands the window binding the same cancel the Undo button uses', () => {
    expect(source).toMatch(
      /bindKeyboard\(\s*keyEngine,\s*bindings,\s*window,\s*commitCharacter,\s*cancelPending\s*\)/,
    )
  })

  it('answers Esc on the focused key too, which the window binding leaves alone', () => {
    const handler = /onKeyDown: \(event: React\.KeyboardEvent\) => \{([\s\S]*?)\n {4}\},/.exec(
      source,
    )?.[1]
    expect(handler).toBeDefined()
    expect(handler).toMatch(/DEFAULT_KEY_BINDINGS\.cancel/)
    expect(handler).toMatch(/cancelPending\(\)/)
  })
})
