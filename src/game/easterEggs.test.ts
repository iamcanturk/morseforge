import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EASTER_EGGS,
  NAME_MAX,
  SOS_PROSIGN_REPLY,
  checkTarget,
  detectEasterEgg,
  findEgg,
  isMessageWord,
  lastWord,
  sendable,
} from './easterEggs'
import { PROSIGNS } from '../data/morseAlphabet'
import { WORDS, findWord } from '../data/words'
import { encode } from '../engine/morseEncoder'
import { UNKNOWN_CHARACTER } from '../engine/morseDecoder'
import { handTypedMorse } from '../seo/proseScan'

/** Commit a word one character at a time, the way the live decoder does. */
function key(text: string): ReturnType<typeof detectEasterEgg>[] {
  const hits: ReturnType<typeof detectEasterEgg>[] = []
  let sent = ''
  for (const character of text) {
    if (character === ' ') {
      sent += ' '
      continue
    }
    sent += character
    hits.push(detectEasterEgg({ text: sent, code: encode(character) }))
  }
  return hits
}

describe('EASTER_EGGS', () => {
  it('has the four §50 eggs, each triggered by a word that exists in WORDS', () => {
    expect(EASTER_EGGS.map((egg) => egg.id)).toEqual(['sos', 'cq', '73', '88'])
    for (const egg of EASTER_EGGS) {
      const word = findWord(egg.id)
      expect(word, egg.id).toBeDefined()
      expect(egg.word).toBe(word?.text)
    }
  })

  it('links every egg to a word page that is in the word list', () => {
    const slugs = new Set(WORDS.map((word) => word.slug))
    for (const egg of EASTER_EGGS) {
      expect(egg.href).toMatch(/^\/words\/[a-z0-9-]+\/$/)
      expect(slugs.has(egg.href.split('/')[2] ?? '')).toBe(true)
    }
  })

  it('has ids that the analytics beacon accepts as a value', () => {
    for (const egg of EASTER_EGGS) expect(egg.id).toMatch(/^[a-z0-9_-]{1,24}$/)
  })

  it('types no Morse by hand', () => {
    const source = readFileSync(new URL('./easterEggs.ts', import.meta.url), 'utf8')
    expect(handTypedMorse(source)).toEqual([])
  })

  it('throws on an id that is not an egg', () => {
    // @ts-expect-error — deliberately outside the union
    expect(() => findEgg('qrz')).toThrow()
  })
})

describe('detectEasterEgg', () => {
  it('fires once, on the character that completes the word', () => {
    for (const egg of EASTER_EGGS) {
      const hits = key(egg.word)
      expect(hits.slice(0, -1).every((hit) => hit === null)).toBe(true)
      expect(hits.at(-1)?.egg.id).toBe(egg.id)
      expect(hits.at(-1)?.form).toBe('letters')
      expect(hits.at(-1)?.reply).toBe(egg.reply)
    }
  })

  it('fires for a word after other words', () => {
    expect(key('HELLO CQ').at(-1)?.egg.id).toBe('cq')
    expect(key('TNX 73').at(-1)?.egg.id).toBe('73')
  })

  it('fires for each CQ in CQ CQ CQ', () => {
    expect(key('CQ CQ CQ').filter((hit) => hit?.egg.id === 'cq')).toHaveLength(3)
  })

  it('ignores the word inside a longer word', () => {
    expect(key('XSOS').every((hit) => hit === null)).toBe(true)
    expect(key('CQD').at(-1)).toBeNull()
    expect(key('733').at(-1)).toBeNull()
  })

  it('recognises SOS keyed as one unbroken prosign', () => {
    // Keyed without letter gaps, the decoder cannot read it as letters and
    // prints the unknown mark; the raw code is what identifies it.
    const hit = detectEasterEgg({ text: `HI ${UNKNOWN_CHARACTER}`, code: PROSIGNS.SOS })
    expect(hit?.egg.id).toBe('sos')
    expect(hit?.form).toBe('prosign')
    expect(hit?.reply).toBe(SOS_PROSIGN_REPLY)
  })

  it('returns null for an empty stream', () => {
    expect(detectEasterEgg({ text: '', code: '' })).toBeNull()
    expect(detectEasterEgg({ text: '   ', code: '' })).toBeNull()
  })
})

describe('lastWord', () => {
  it('reads the word being sent, ignoring a trailing word gap', () => {
    expect(lastWord('HELLO WORLD')).toBe('WORLD')
    expect(lastWord('HELLO ')).toBe('HELLO')
    expect(lastWord('cq')).toBe('CQ')
    expect(lastWord('')).toBe('')
  })
})

describe('isMessageWord', () => {
  it('counts ordinary words and every egg', () => {
    expect(isMessageWord('HI')).toBe(true)
    expect(isMessageWord('HELLO')).toBe(true)
    for (const egg of EASTER_EGGS) expect(isMessageWord(egg.word), egg.id).toBe(true)
  })

  it('rejects the noise of learning to time the key', () => {
    expect(isMessageWord('E')).toBe(false)
    expect(isMessageWord('EEEE')).toBe(false)
    expect(isMessageWord('TT')).toBe(false)
    expect(isMessageWord(`H${UNKNOWN_CHARACTER}`)).toBe(false)
    expect(isMessageWord('')).toBe(false)
  })

  it('still counts a repeated-character word that is an egg', () => {
    const repeated = EASTER_EGGS.filter((egg) => new Set(egg.word).size === 1)
    expect(repeated.length).toBeGreaterThan(0)
    for (const egg of repeated) expect(isMessageWord(egg.word)).toBe(true)
  })
})

describe('sendable', () => {
  it('upper-cases and keeps only what the key can send', () => {
    expect(sendable('Ada')).toBe('ADA')
    expect(sendable('  Ada   Lovelace ')).toBe('ADA LOVELACE ')
    expect(sendable('Zoë 🙂')).toBe('ZO ')
  })

  it('caps the length', () => {
    expect(sendable('A'.repeat(40))).toHaveLength(NAME_MAX)
  })
})

describe('checkTarget', () => {
  const sos = findEgg('sos').word

  it('starts with the first character to send', () => {
    expect(checkTarget(sos, '')).toEqual({
      matched: 0,
      total: sos.length,
      next: sos[0],
      slips: 0,
      lastSlip: null,
      done: false,
    })
  })

  it('advances character by character and finishes', () => {
    expect(checkTarget(sos, sos.slice(0, 2)).matched).toBe(2)
    const done = checkTarget(sos, sos)
    expect(done.done).toBe(true)
    expect(done.next).toBeNull()
    expect(done.slips).toBe(0)
  })

  it('waits on a slip instead of starting over', () => {
    const check = checkTarget('SOS', 'SOE')
    expect(check.matched).toBe(2)
    expect(check.next).toBe('S')
    expect(check.slips).toBe(1)
    expect(check.lastSlip).toBe('E')
    const recovered = checkTarget('SOS', 'SOES')
    expect(recovered.done).toBe(true)
    expect(recovered.slips).toBe(1)
    expect(recovered.lastSlip).toBeNull()
  })

  it('ignores spaces on both sides', () => {
    expect(checkTarget('ADA LOVELACE', 'ADAL OVE LACE').done).toBe(true)
  })

  it('ignores anything sent after it is done', () => {
    expect(checkTarget('CQ', 'CQXYZ')).toMatchObject({ done: true, slips: 0 })
  })

  it('never reports an empty target as done', () => {
    expect(checkTarget('', 'ABC').done).toBe(false)
  })
})
