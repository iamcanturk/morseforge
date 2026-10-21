/**
 * The seven-day learning plan.
 *
 * Built on the tree's own structure rather than on an arbitrary split: each day
 * takes characters from one depth of the Morse tree, so a learner finishes a
 * day having completed a whole *layer* of the code rather than a random dozen
 * letters. That is also why day 1 is two characters and day 5 is six — the tree
 * widens, and pretending otherwise would mean teaching E and Q side by side.
 *
 * Codes are read from `MORSE_ALPHABET`, never written out here, so the plan can
 * never disagree with the rest of the app.
 */

import { MORSE_ALPHABET } from './morseAlphabet'

export interface CurriculumDay {
  day: number
  /** Short title, used as the H2 and in the table of contents. */
  title: string
  /** New characters introduced. */
  characters: readonly string[]
  /**
   * The answer-first summary — 40–60 words, stated plainly, directly under the
   * heading. This is the shape an LLM will quote and a search snippet will
   * lift, so it has to stand alone without the surrounding page.
   */
  summary: string
  /** Why these characters, at this point. */
  rationale: string
  /** Concrete practice for the day. */
  drill: string
  /** Words the learner can already spell after this day. */
  words: readonly string[]
  /** Realistic minutes of practice. */
  minutes: number
}

export const CURRICULUM: readonly CurriculumDay[] = [
  {
    day: 1,
    title: 'The two shortest characters',
    characters: ['E', 'T'],
    summary:
      'Start with E and T. E is a single dot, T is a single dash — the two shortest characters in Morse code, and the only two that are one element long. Learning them first means you learn the difference between a dot and a dash before you learn any letter at all.',
    rationale:
      'Every other character is built from these two sounds. Until a short beep and a long beep are unmistakably different to you, nothing else can be. Spend day one on the distinction, not on the alphabet.',
    drill: 'Send E and T twenty times each until you stop having to think about which is which.',
    words: ['ET', 'TEE'],
    minutes: 10,
  },
  {
    day: 2,
    title: 'The four two-element characters',
    characters: ['I', 'A', 'N', 'M'],
    summary:
      'Day two adds I, A, N and M. These are every possible pair of dots and dashes: I is two dots, A is dot-dash, N is dash-dot, M is two dashes. Together with E and T you now know six letters and can spell real words.',
    rationale:
      'This is the second layer of the Morse tree, and it is complete — there is no fifth two-element character. Learning a full layer means you are never left wondering what you have missed.',
    drill:
      'Practise A against N. They are mirror images and they are the pair beginners confuse most.',
    words: ['AM', 'AN', 'IN', 'IT', 'ME', 'MAN', 'MINE', 'TIME'],
    minutes: 15,
  },
  {
    day: 3,
    title: 'Three elements, dot-first',
    characters: ['S', 'U', 'R', 'W'],
    summary:
      'Day three covers S, U, R and W — the four three-element characters that begin with a dot. S is three dots, U is dot-dot-dash, R is dot-dash-dot, W is dot-dash-dash. Knowing S alongside E and T is enough to send SOS.',
    rationale:
      'The third layer of the tree has eight characters, which is too many for one sitting. Splitting it by first element keeps each half coherent: today everything starts with a dot.',
    drill:
      'Send SOS. It is three dots, three dashes, three dots — you will have the dashes tomorrow, so send the S groups today and listen to the whole thing.',
    words: ['US', 'SUN', 'RUN', 'WAR', 'SEA', 'TRAIN', 'WATER'],
    minutes: 20,
  },
  {
    day: 4,
    title: 'Three elements, dash-first',
    characters: ['D', 'K', 'G', 'O'],
    summary:
      'Day four completes the three-element layer with D, K, G and O — the four that begin with a dash. O is three dashes, which makes SOS complete: three dots, three dashes, three dots. You now know fourteen of the twenty-six letters.',
    rationale:
      'You have now finished three full layers of the tree. Every character you have left is four elements long, so from here the shape of the problem stops changing.',
    drill: 'Send SOS in full, then send your own name using whatever letters you have.',
    words: ['SOS', 'DOG', 'GOOD', 'DARK', 'WORD', 'ROAD', 'SMOKE'],
    minutes: 20,
  },
  {
    day: 5,
    title: 'The four-element characters, part one',
    characters: ['H', 'V', 'F', 'L', 'P', 'J'],
    summary:
      'Day five starts the last layer with H, V, F, L, P and J — the six four-element characters that begin with a dot. Together with day six, this is the longest day of the plan, and the first where counting elements stops working and you have to hear the rhythm instead.',
    rationale:
      'At four elements, counting beeps is no longer viable at any real speed. This is the day to switch from counting to recognising a shape, which is why Farnsworth spacing matters more from here on.',
    drill:
      'Turn the character speed up but keep the effective speed low. Hear each character fast, then take your time answering.',
    words: ['HELP', 'FIVE', 'LIVE', 'PLANE', 'JUMP', 'PHONE'],
    minutes: 25,
  },
  {
    day: 6,
    title: 'The four-element characters, part two',
    characters: ['B', 'X', 'C', 'Y', 'Z', 'Q'],
    summary:
      'Day six finishes the alphabet with B, X, C, Y, Z and Q — the six four-element characters that begin with a dash. Three of them, Q, X and Z, are the rarest letters in English, so finishing on them costs little: you will meet them less often than anything else in practice.',
    rationale:
      'The tree decides the order, not letter frequency: this is the dash-first half of the last layer. It suits the end of the alphabet anyway, because Q, X and Z each appear in under 0.2% of English text.',
    drill:
      'Practise these against the letters they resemble: C against K, Z against G, Q against O.',
    words: ['BOX', 'QUIZ', 'CYCLE', 'ZEBRA', 'BLACK'],
    minutes: 25,
  },
  {
    day: 7,
    title: 'Numbers, and your first real message',
    characters: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    summary:
      'Day seven adds the ten digits and puts everything together. Digits are all five elements long and follow one simple rule: 1 is one dot then four dashes, and each number shifts one more dot in until 5 is five dots, then back out again to 0.',
    rationale:
      'Numbers are the only part of Morse with a rule you can derive rather than memorise, which makes them a light day — the right way to end a week that has been getting heavier.',
    drill:
      'Send a full sentence. Then send CQ, the call every operator uses to ask if anyone is listening.',
    words: ['CQ', '73', 'SOS', 'HELLO WORLD'],
    minutes: 20,
  },
]

/** Total characters taught across the plan. */
export const CURRICULUM_CHARACTER_COUNT = CURRICULUM.reduce(
  (total, day) => total + day.characters.length,
  0,
)

/** Total practice time the plan asks for, in minutes. */
export const CURRICULUM_TOTAL_MINUTES = CURRICULUM.reduce((total, day) => total + day.minutes, 0)

/** Everything taught up to and including a given day. */
export function charactersThroughDay(day: number): string[] {
  return CURRICULUM.filter((entry) => entry.day <= day).flatMap((entry) => [...entry.characters])
}

/** The Morse code for a curriculum character. */
export function codeFor(character: string): string {
  return MORSE_ALPHABET[character] ?? ''
}
