/**
 * Curated words and phrases that people actually look up in Morse.
 *
 * Each entry becomes its own page at `/words/<slug>/`. That only works if every
 * page carries something a reference table does not: the `note` is why the word
 * is worth a page at all. A page that is just "SOS = ... --- ..." is thin
 * content, and thin content ranks for nothing and gets cited by nobody.
 *
 * Codes are never written here — they are derived from `MORSE_ALPHABET`, so a
 * word page can never disagree with the trainer.
 */

import { encode } from '../engine/morseEncoder'
import { isEncodable } from './morseAlphabet'

export type WordCategory = 'emergency' | 'greeting' | 'feeling' | 'radio' | 'everyday' | 'history'

export interface MorseWord {
  /** URL slug, e.g. "i-love-you". */
  slug: string
  /** The text itself, uppercase. */
  text: string
  category: WordCategory
  /**
   * A factual note with something in it — an origin, a convention, a
   * misconception corrected. This is the whole reason the page exists.
   */
  note: string
}

export const WORD_CATEGORIES: Record<WordCategory, { label: string; blurb: string }> = {
  emergency: {
    label: 'Emergency',
    blurb: 'The signals Morse is still legally and practically used for.',
  },
  greeting: { label: 'Greetings', blurb: 'The first things most people want to send.' },
  feeling: { label: 'Feelings', blurb: 'The words people tattoo, engrave and gift.' },
  radio: { label: 'Radio', blurb: 'What operators actually send on the air.' },
  everyday: { label: 'Everyday', blurb: 'Short, common words that make good practice.' },
  history: { label: 'History', blurb: 'Words tied to the story of the code itself.' },
}

export const WORDS: readonly MorseWord[] = [
  {
    slug: 'sos',
    text: 'SOS',
    category: 'emergency',
    note: 'SOS does not stand for anything. It was adopted in 1906 because the unbroken sequence of three dots, three dashes and three dots is hard to mistake for anything else and easy to send under stress. "Save Our Souls" was invented afterwards to explain letters that were never an abbreviation. Sent as one continuous character with no gaps between the letters.',
  },
  {
    slug: 'help',
    text: 'HELP',
    category: 'emergency',
    note: 'HELP is a plain English word, not a distress signal, and no maritime or aviation convention recognises it. If you need to be understood as being in danger, send SOS — it is the internationally agreed signal and it is far shorter to key.',
  },
  {
    slug: 'mayday',
    text: 'MAYDAY',
    category: 'emergency',
    note: 'MAYDAY is a voice distress call, not a Morse one — it comes from the French "m\'aidez". It exists because spoken radio needed its own unmistakable word once voice replaced keying. In Morse the equivalent has always been SOS.',
  },
  {
    slug: 'hello',
    text: 'HELLO',
    category: 'greeting',
    note: 'HELLO makes a poor first message and a good first exercise. It puts E, the single dot, in the same word as H and L, which sit on the deepest layer of the Morse tree — the shortest and longest characters in the alphabet, back to back. Operators greeting each other on the air do not send it at all; they send CQ.',
  },
  {
    slug: 'good-morning',
    text: 'GOOD MORNING',
    category: 'greeting',
    note: 'A two-word phrase, which makes it the shortest useful practice for word spacing. The gap between GOOD and MORNING is seven units — over twice the gap between two letters — and getting that wrong is what makes beginner sending unreadable.',
  },
  {
    slug: 'i-love-you',
    text: 'I LOVE YOU',
    category: 'feeling',
    note: 'The most-searched phrase in Morse code, and the one most often engraved on jewellery. Three words means two word gaps; rendered as dots and dashes it is commonly written with slashes between the words, which is why you will see it printed both ways.',
  },
  {
    slug: 'love',
    text: 'LOVE',
    category: 'feeling',
    note: 'One of the most common Morse tattoos and engravings. Worth knowing before it goes on skin: Morse has no case and no punctuation unless you add it, so the written form is identical whether the original was LOVE or love, and there is no way to encode the difference.',
  },
  {
    slug: 'hope',
    text: 'HOPE',
    category: 'feeling',
    note: 'HOPE opens with H, four dots in a row, which is the classic test of even timing: if your dots drift, four of them in sequence is where a listener hears it first.',
  },
  {
    slug: 'cq',
    text: 'CQ',
    category: 'radio',
    note: 'CQ is a general call to any station listening — the operator equivalent of "is anyone there?". It comes from the French "sécurité" via the British telegraph practice of prefixing messages CQ for "all stations". Usually sent three times: CQ CQ CQ.',
  },
  {
    slug: '73',
    text: '73',
    category: 'radio',
    note: '73 means "best regards" and is how operators sign off. It is a survivor of the Phillips Code, a numeric shorthand telegraphers used to save keystrokes when they were paid by the message. Never say "73s" — the number is already plural.',
  },
  {
    slug: '88',
    text: '88',
    category: 'radio',
    note: '88 means "love and kisses", the affectionate counterpart to 73. Also from the Phillips Code, the numeric shorthand telegraphers used to save keystrokes. By convention it goes to a spouse or close friend rather than a stranger, and sending it to someone you have just met on the air reads as a beginner mistake. Each 8 is three dashes then two dots, so 88 is a symmetrical pattern that is easy to recognise even through heavy interference.',
  },
  {
    slug: 'roger',
    text: 'ROGER',
    category: 'radio',
    note: 'ROGER means "received" and comes from R, the Morse abbreviation for "received", read out in the pre-NATO phonetic alphabet where R was Roger. In Morse itself operators just send R — a single dot-dash-dot.',
  },
  {
    slug: 'over',
    text: 'OVER',
    category: 'radio',
    note: 'OVER is voice procedure, not Morse. The Morse equivalent is K, meaning "go ahead", or KN when inviting one specific station. "Over and out" is a film invention: the two mean opposite things and no operator says both.',
  },
  {
    slug: 'qth',
    text: 'QTH',
    category: 'radio',
    note: 'QTH means "my location is" — one of the Q codes, a set of three-letter abbreviations that let operators exchange standard questions and answers across a language barrier. Send it with a question mark and it becomes "what is your location?".',
  },
  {
    slug: 'yes',
    text: 'YES',
    category: 'everyday',
    note: 'Morse has no dedicated yes. Operators send R for "received" or C for "correct", both single characters, rather than spelling out a three-letter word to say the same thing. This is the pattern across the whole language of the air: anything said often enough eventually collapses into one character or a number.',
  },
  {
    slug: 'no',
    text: 'NO',
    category: 'everyday',
    note: 'NO is one of the shortest real words in Morse, and it uses only dashes and a single dot — good practice for hearing dash length when there is no run of dots alongside it to compare against.',
  },
  {
    slug: 'ok',
    text: 'OK',
    category: 'everyday',
    note: 'OK is made of nothing but dashes and a single dot, which makes it unusually easy to pick out of noise. On the air operators send OK or R interchangeably, though R is a single character and therefore far faster.',
  },
  {
    slug: 'thank-you',
    text: 'THANK YOU',
    category: 'everyday',
    note: 'Operators shorten this to TU, sent as one flowing pair rather than two separate letters. Spelling out THANK YOU takes roughly ten times as long as TU to key, which is why almost nobody does it on the air — Morse conventions were shaped by people paid by the message.',
  },
  {
    slug: 'water',
    text: 'WATER',
    category: 'everyday',
    note: 'A survival word and a good drill. Every letter in WATER sits in the top three layers of the Morse tree, so it is the longest genuinely useful word a learner can send after four days of the seven-day plan — and the first one that feels like a real message rather than an exercise.',
  },
  {
    slug: 'morse',
    text: 'MORSE',
    category: 'history',
    note: 'Samuel Morse devised the original code in the 1830s, but the version used worldwide today is not his. American Morse used variable-length internal gaps that made it unsuitable for radio; the International Morse code, standardised in 1865 and now ITU-R M.1677-1, replaced it everywhere outside American landline telegraphy.',
  },
  {
    slug: 'telegraph',
    text: 'TELEGRAPH',
    category: 'history',
    note: 'Nine letters, and one of the longest words worth practising as a single unit. The telegraph is why the code exists at all: a single wire could carry only on and off, so the alphabet had to be encoded in the length of those two states rather than in their shape.',
  },
  {
    slug: 'titanic',
    text: 'TITANIC',
    category: 'history',
    note: 'The Titanic sent both CQD and SOS in 1912. CQD was the older Marconi distress call — CQ plus D for distress — and SOS had been agreed only six years earlier. The sinking is often credited with popularising SOS, though it was already the official signal.',
  },
]

/** Words in a category, in the order they are defined. */
export function wordsByCategory(category: WordCategory): MorseWord[] {
  return WORDS.filter((word) => word.category === category)
}

export function findWord(slug: string): MorseWord | undefined {
  return WORDS.find((word) => word.slug === slug)
}

/** The Morse for a word, derived rather than stored. */
export function morseFor(word: MorseWord): string {
  return encode(word.text)
}

/** Per-character breakdown, for the table on each word page. */
export function breakdown(word: MorseWord): { character: string; code: string }[] {
  return [...word.text]
    .filter((character) => character !== ' ' && isEncodable(character))
    .map((character) => ({ character, code: encode(character) }))
}
