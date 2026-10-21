import { describe, expect, it } from 'vitest'
import { DECODE_ROUNDS, stampFor } from './DecodeChallenge'
import { encode } from '../../engine/morseEncoder'
import { decode } from '../../engine/morseDecoder'
import { ALL_LETTERS, isEncodable } from '../../data/morseAlphabet'
import { capitalise, numberWord } from '../../data/format'

/**
 * This is the first thing a visitor interacts with. A puzzle whose Morse does
 * not decode back to its own answer would be the worst possible first
 * impression for a site whose entire pitch is accuracy.
 */
describe('DECODE_ROUNDS', () => {
  it('round-trips every answer through the real engine', () => {
    for (const round of DECODE_ROUNDS) {
      expect(decode(encode(round.answer)), round.answer).toBe(round.answer)
    }
  })

  it('uses only characters the engine can send', () => {
    for (const round of DECODE_ROUNDS) {
      for (const character of round.answer) {
        expect(isEncodable(character), `${round.answer} contains "${character}"`).toBe(true)
      }
    }
  })

  it('opens with SOS, the one nearly everyone half-knows', () => {
    // The first round has to be winnable or the hook reads as a wall.
    expect(DECODE_ROUNDS[0]!.answer).toBe('SOS')
  })

  it('gets harder, never easier', () => {
    // Measured in characters to look up, not elements: CQ is two characters but
    // both are four elements and unfamiliar, so element count would rank it as
    // an easy round when it is not.
    const lengths = DECODE_ROUNDS.map((round) => round.answer.replace(/\s/g, '').length)
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!, `round ${i + 1} is easier than round ${i}`).toBeGreaterThanOrEqual(
        lengths[i - 1]!,
      )
    }
  })

  it('is uppercase, since answers are compared uppercased', () => {
    for (const round of DECODE_ROUNDS) {
      expect(round.answer).toBe(round.answer.toUpperCase())
    }
  })

  it('gives every round a note worth reading', () => {
    for (const round of DECODE_ROUNDS) {
      expect(round.note.trim().split(/\s+/).length, round.answer).toBeGreaterThanOrEqual(8)
    }
  })
})

describe('a finished round', () => {
  it('stamps a decode as received, and a revealed answer as shown, never received', () => {
    expect(stampFor('correct')).toBe('Received')
    expect(stampFor('revealed')).toBe('Shown')
  })

  it('counts the last round’s note from its own word', () => {
    const last = DECODE_ROUNDS.at(-1)!
    const letters = new Set(last.answer).size
    expect(last.note).toMatch(
      new RegExp(
        `^${capitalise(numberWord(last.answer.length))} characters, ${numberWord(letters)} different letters`,
      ),
    )
    // "nearly a quarter" must stay true of the share it describes.
    if (last.note.includes('nearly a quarter')) {
      expect(letters / ALL_LETTERS.length).toBeGreaterThanOrEqual(0.2)
      expect(letters / ALL_LETTERS.length).toBeLessThan(0.25)
    }
  })
})
