/**
 * Every page's FAQ, in one place.
 *
 * The visible list, the FAQPage JSON-LD, `llms-full.txt` and the Markdown
 * alternates all read these arrays, so what a person sees, what a crawler is
 * told and what an assistant quotes cannot drift apart. Google penalises
 * structured data that does not match the page, and an array written twice is
 * how that happens.
 *
 * Two rules for anything added here, both enforced by `faq.test.ts`:
 *
 *   - An answer stands alone. It is quoted without its page, so it names its own
 *     subject and runs to at least 25 words.
 *   - No Morse and no figure is typed. A code arrives through `encode()` or
 *     `codeFor`, a count through `FACTS`, so the answer is true whenever the
 *     data is.
 *
 * Questions are phrased the way people type them, because that is the string an
 * answer engine matches against.
 */

import { CITATIONS } from '../config/site'
import { FACTS, prosignFacts, wordFacts } from '../config/facts'
import { encode } from '../engine/morseEncoder'
import {
  PARIS_KEYING_UNITS,
  PARIS_SPACING_UNITS,
  PARIS_UNITS,
  UNITS,
  buildTimeline,
  resolveTiming,
  timelineDuration,
} from '../engine/timingEngine'
import type { CharacterFacts } from './characters'
import { describeElements, joinList, numberWord } from './format'
import { COPY_PASS_MARK } from '../game/copy'
import { STARTING_LIVES as DEFENDER_LIVES } from '../game/defender'
import { STARTING_LIVES as RUNNER_LIVES } from '../game/runner'
import { METHODS } from './methods'
import {
  ALL_DIGITS,
  DIGITS,
  EXTENDED_LETTERS,
  LEARNING_STAGES,
  LETTERS,
  MORSE_ALPHABET,
  NON_ITU_PUNCTUATION,
  PUNCTUATION_NAMES,
  codeLength,
} from './morseAlphabet'
import { codeGroup } from './practiceText'
import { DEFAULT_KEY_BINDINGS, KEYER_KINDS } from '../engine/keyEngine'
import { KEYER_LABELS, SIGNAL_LABELS, SIGNAL_MODES } from '../storage/settings'
import { MORSE_TREE, treeDepth } from './tree'
import { wordLabel, type MorseWord } from './words'

/** A phrase inside an answer that the page should turn into a link. */
export interface FaqLink {
  /** Exact text as it appears in the answer. The first occurrence is linked. */
  text: string
  href: string
}

export interface FaqItem {
  question: string
  answer: string
  links?: readonly FaqLink[]
}

const ITU = CITATIONS.itu.short

const byLength = FACTS.lettersByLength

/** "E (one dot) and T (one dash)": the single-element letters, described. */
const firstStage = LEARNING_STAGES[0]!
const singleElementLetters = joinList(
  firstStage.map(
    (letter) => `${letter} (${describeElements(LETTERS[letter as keyof typeof LETTERS])})`,
  ),
)

const stageSizeWord = (index: number): string => numberWord(LEARNING_STAGES[index]!.length)
const stageElementsWord = (index: number): string =>
  numberWord(codeLength(LEARNING_STAGES[index]![0]!))

/** The marks the standard leaves out, by name: "exclamation mark, ampersand and so on". */
const nonItuNames = Object.keys(NON_ITU_PUNCTUATION).map(
  (mark) => PUNCTUATION_NAMES[mark as keyof typeof PUNCTUATION_NAMES],
)

/** "days 5 and 6", or "day 5" if the plan ever has a single longest day. */
const longestDays =
  FACTS.planLongestDays.length === 1
    ? `day ${FACTS.planLongestDays[0]}`
    : `days ${joinList(FACTS.planLongestDays.map(String))}`

const digitWord = (digit: keyof typeof DIGITS): string => describeElements(DIGITS[digit])

/** "three choices: sound, lamp or both", from the setting itself (DEC-045). */
const signalChoices = `${numberWord(SIGNAL_MODES.length)} choices: ${joinList(
  SIGNAL_MODES.map((mode) => SIGNAL_LABELS[mode].toLowerCase()),
  'or',
)}`

const HOME: readonly FaqItem[] = [
  {
    question: 'How long does it take to learn Morse code?',
    answer: `Learning every character takes about ${FACTS.planTime} of practice: MorseForge's ${FACTS.planDays}-day plan covers all ${FACTS.letterCount} letters and ${FACTS.digitCount} digits in daily sessions of ${FACTS.planMinMinutesPerDay} to ${FACTS.planMaxMinutesPerDay} minutes. Copying Morse at a useful speed takes longer, usually weeks to months of short daily practice, because recognising a character instantly is a separate skill.`,
    links: [
      {
        text: 'short daily practice',
        href: '/blog/how-long-does-it-take-to-learn-morse-code/',
      },
    ],
  },
  {
    question: 'Is MorseForge free?',
    answer:
      'Yes. MorseForge is free and open source, with no ads and no account. It runs entirely in your browser, works offline once it has loaded, and stores your progress on your own device instead of on a server.',
  },
  {
    question: 'What is the best way to learn Morse code?',
    answer:
      'Learn it by sound. Hear each character as a rhythm instead of memorising dots and dashes from a chart, start with the shortest codes, keep characters fast with long gaps between them, which is Farnsworth timing, and send as well as listen. Short daily sessions beat long weekly ones.',
    links: [
      { text: 'Learn it by sound', href: '/blog/why-a-morse-code-chart-does-not-work/' },
      { text: 'Farnsworth timing', href: '/blog/what-farnsworth-timing-is/' },
    ],
  },
  {
    question: 'Can I practise Morse code on my phone?',
    answer:
      'Yes. Every page works on a phone. On a touchscreen the telegraph key becomes an on-screen button that you tap for a dot and hold for a dash, and the audio plays through the speaker or headphones.',
  },
  {
    question: 'Which Morse code does MorseForge teach?',
    answer: `International Morse code, as defined by Recommendation ${ITU}, which is the version used on the radio worldwide. American Morse, the original landline code, used different patterns for some letters and is not taught here.`,
    links: [{ text: `Recommendation ${ITU}`, href: CITATIONS.itu.url }],
  },
]

const PLAN: readonly FaqItem[] = [
  {
    question: `Can you really learn Morse code in ${FACTS.planDays} days?`,
    answer: `You can learn to recognise all ${FACTS.letterCount} letters and ${FACTS.digitCount} digits in ${numberWord(FACTS.planDays)} days at about ${FACTS.planTime} of practice in total. Reaching conversational speed takes months of listening beyond that. Knowing the alphabet and reading it at speed are different skills, and only the first fits in a week.`,
  },
  {
    question: 'What order should you learn Morse code letters in?',
    answer: `Learn by code length, not alphabetically. Start with ${singleElementLetters}, then the ${stageSizeWord(1)} ${stageElementsWord(1)}-element characters ${joinList(LEARNING_STAGES[1]!)}, then the ${stageSizeWord(2)} ${stageElementsWord(2)}-element characters, then the ${stageSizeWord(3)} ${stageElementsWord(3)}-element ones. Morse is a binary tree, and this order walks it one layer at a time.`,
    links: [{ text: 'binary tree', href: '/tree/' }],
  },
  {
    question: 'Should you learn Morse code by sight or by sound?',
    answer:
      'By sound. Learning the written dots and dashes first creates a translation step — you hear the beeps, picture the dots, then recall the letter — and that step becomes the ceiling on your speed. Learn each character as a rhythm you recognise directly.',
    links: [{ text: 'By sound', href: '/blog/why-a-morse-code-chart-does-not-work/' }],
  },
  {
    question: 'What is Farnsworth timing?',
    answer:
      'Farnsworth timing sends each character at full speed but leaves longer gaps between characters. It stops you learning a slowed-down character as a sequence of countable beeps, which is the habit that stalls most learners around 10 words per minute. The ARRL published a standard for calculating the stretched gaps.',
    links: [
      { text: 'Farnsworth timing', href: '/blog/what-farnsworth-timing-is/' },
      { text: 'ARRL', href: CITATIONS.arrl.url },
    ],
  },
  {
    question: 'How many minutes a day does the plan take?',
    answer: `Between ${FACTS.planMinMinutesPerDay} and ${FACTS.planMaxMinutesPerDay} minutes. Day 1 takes about ${FACTS.planFirstDayMinutes} minutes, ${longestDays} about ${FACTS.planMaxMinutesPerDay} minutes each, and the whole plan about ${FACTS.planTime}. If a day feels heavy, split it in two: the order matters more than the pace.`,
  },
  {
    question: 'What can I send after the seven days?',
    answer: `Any text written with the ${FACTS.letterCount} letters and ${FACTS.digitCount} digits: your name, a sentence, a number or the operator call ${FACTS.planClosingCall}. Punctuation is not part of the plan; look it up in the Morse code alphabet when you need it.`,
    links: [{ text: 'Morse code alphabet', href: '/morse-code-alphabet/' }],
  },
]

const ALPHABET: readonly FaqItem[] = [
  {
    question: 'How many characters are in the Morse code alphabet?',
    answer: `International Morse code, as defined in ${ITU}, has ${FACTS.letterCount} letters, ${FACTS.digitCount} digits and ${FACTS.ituPunctuationCount} punctuation marks. This chart also includes ${FACTS.nonItuPunctuationCount} widely used marks that the standard does not define: the ${joinList(nonItuNames)}. Letters are one to four elements long and every digit is exactly five.`,
    links: [{ text: ITU, href: CITATIONS.itu.url }],
  },
  {
    question: 'Why is E just one dot?',
    answer:
      'Because E is the most common letter in English. Morse assigned the shortest codes to the most frequent letters, which is a form of frequency encoding — the same principle behind modern compression. Q and Z are long precisely because they are rare.',
  },
  {
    question: 'What is the easiest way to remember Morse code numbers?',
    answer: `Count the dots. 1 is ${digitWord('1')}, 2 is ${digitWord('2')}, and so on up to 5, which is ${digitWord('5')}. From 6 the pattern reverses: 6 is ${digitWord('6')}, up to 0, which is ${digitWord('0')}. Every digit is exactly ${numberWord(FACTS.digitElements)} elements long.`,
  },
  {
    question: 'Which letters are the longest in Morse code?',
    answer: `No letter is longer than ${numberWord(FACTS.letterMaxElements)} elements, and ${byLength[FACTS.letterMaxElements]!.length} letters share that length: ${joinList(byLength[FACTS.letterMaxElements]!)}. H is the only letter made of four dots, and no letter is made of four dashes.`,
  },
  {
    question: 'How long is a dot and a dash in Morse code?',
    answer: `A dot, or dit, lasts ${numberWord(FACTS.units.DOT)} unit and a dash, or dah, lasts ${numberWord(FACTS.units.DASH)}. The gap inside a character is ${numberWord(FACTS.units.ELEMENT_GAP)} unit, between letters ${numberWord(FACTS.units.CHARACTER_GAP)} units and between words ${numberWord(FACTS.units.WORD_GAP)}. At ${FACTS.exampleWpm} words per minute one unit is ${FACTS.unitMs} milliseconds, so a dash lasts ${FACTS.dashMs} milliseconds.`,
  },
  {
    question: 'Is there a Morse code for lowercase letters?',
    answer:
      'No. Morse has no case at all. It also has no way to indicate a paragraph or a new line beyond the prosign BT. Anything sent in Morse arrives as uppercase by convention, not because it was sent that way.',
  },
  {
    question: 'What is the difference between American and International Morse?',
    answer:
      'American Morse, the original, used variable-length internal gaps inside some characters. Those gaps were readable on a landline sounder but not over radio, where fading and interference blur them. International Morse replaced it worldwide and is what every modern reference means by "Morse code".',
  },
]

const TRANSLATOR: readonly FaqItem[] = [
  {
    question: 'How do you write Morse code?',
    answer: `Write a dot as a period and a dash as a hyphen, with no space between the elements of one character. Put a single space between characters and a forward slash between words. So SOS is "${encode('SOS')}" and HI THERE is "${encode('HI THERE')}".`,
  },
  {
    question: 'Why does the translator use a slash between words?',
    answer:
      'A slash survives copy and paste, URLs and chat apps, all of which collapse repeated spaces. The older convention of a double space is still accepted as input here, but it silently breaks the moment the text is pasted anywhere.',
  },
  {
    question: 'Can Morse code handle punctuation and numbers?',
    answer: `Yes. ${ITU} defines all ${FACTS.digitCount} digits and ${FACTS.ituPunctuationCount} punctuation marks, including the full stop, comma, question mark, slash and at sign. The exclamation mark is not in the standard, though ${NON_ITU_PUNCTUATION['!']} is widely used and this translator accepts it. Morse has no upper and lower case.`,
    links: [{ text: ITU, href: CITATIONS.itu.url }],
  },
  {
    question: 'Is this translator accurate?',
    answer: `The codes follow ${ITU}, the international standard, apart from ${numberWord(FACTS.nonItuPunctuationCount)} common marks it does not define, and timing follows the PARIS convention where one unit lasts ${FACTS.unitMsAtOneWpm} milliseconds divided by the speed in words per minute. The same engine generates the audio, so what you hear is correctly timed rather than approximated.`,
    links: [{ text: ITU, href: CITATIONS.itu.url }],
  },
  {
    question: 'Can this translator decode Morse code from audio?',
    answer: `No. It translates typed text and typed dots and dashes. MorseForge does not listen through a microphone. To read Morse by ear, train with the practice modes or the ${FACTS.planDays}-day plan, which teach each character as a sound.`,
    links: [
      { text: 'practice modes', href: '/practice/' },
      { text: `${FACTS.planDays}-day plan`, href: '/learn-morse-code-in-7-days/' },
    ],
  },
  {
    question: 'How do I type Morse code on a phone?',
    answer:
      'Type a full stop for a dot and a hyphen for a dash, with a space between letters and a slash between words. If your keyboard turns hyphens into long dashes, or you paste middle dots, the translator still reads them correctly.',
  },
]

const PRACTICE: readonly FaqItem[] = [
  {
    question: 'What is the best way to practise Morse code?',
    answer:
      'Little and often, by ear. Fifteen minutes a day of copying characters you hear beats a long weekly session, and practising all three skills, hearing, reading and sending, stops one from lagging behind. MorseForge brings back each character just before you would forget it.',
    links: [{ text: 'Little and often', href: '/blog/how-long-does-it-take-to-learn-morse-code/' }],
  },
  {
    question: 'Can I practise Morse code with the sound off, or if I am deaf?',
    answer: `Yes. Settings has a Signal option with ${signalChoices}. With the lamp, every character in practice, copy practice, the daily wire and the ${FACTS.challengeSeconds}-second challenge flashes on screen with the same timing as the tone, so you read Morse by light, as signal lamps and heliographs always have. The lesson, the tree and the translator flash a lamp as well.`,
    links: [{ text: 'Settings', href: '/settings/#signal' }],
  },
]

const CHALLENGE: readonly FaqItem[] = [
  {
    question: 'Is this a real Morse code test?',
    answer: `It is a practice test, not a licence exam. It measures how many characters you can copy by ear in ${FACTS.challengeSeconds} seconds at the speed you choose, then gives you a score and a link so a friend can take the identical test. Nothing about it is certified or official.`,
  },
]

const keyerChoices = joinList(KEYER_KINDS.map((kind) => KEYER_LABELS[kind]))

const TELEGRAPH: readonly FaqItem[] = [
  {
    question: 'Can I use a real Morse key or paddle?',
    answer: `Yes. Settings has a Key type: ${keyerChoices}. The straight key is timed by hand. With iambic paddles, hold ${DEFAULT_KEY_BINDINGS.dit} for dits and ${DEFAULT_KEY_BINDINGS.dah} for dahs, or use the two on-screen paddles on a touchscreen, and Swap paddles reverses them for a left hand. A physical key or paddle works through an adapter that turns it into key presses, as long as each paddle sends a different key: bind those keys in Settings.`,
    links: [{ text: 'Settings', href: '/settings/#key' }],
  },
  {
    question: 'What is the difference between iambic mode A and mode B?',
    answer: `Both send dits or dahs for as long as you hold a paddle, timed exactly from your speed: a dit is ${numberWord(UNITS.DOT)} unit long and a dah ${numberWord(UNITS.DASH)}, each followed by ${numberWord(UNITS.ELEMENT_GAP)} unit of silence. Squeeze both paddles and they alternate. The difference is what happens when you let go of a squeeze: mode A finishes the element it is sending and stops, while mode B sends one more, the opposite element. Both remember a paddle tapped during an element and send it next.`,
  },
]

const MESSAGE: readonly FaqItem[] = [
  {
    question: 'Does my message get sent to a server?',
    answer:
      'No. The message is stored in the part of the link after the # sign, called the fragment, and browsers never send the fragment when they request a page. Only the page itself is requested, so the people who run this site cannot read your message. Anyone who has the link can.',
  },
  {
    question: 'Is a message in Morse code really secret?',
    answer:
      'No. Morse code is an encoding, not encryption: anyone who knows the code can read it, and anyone who has the link can open the message. The link is private only in the sense that it goes where you send it, so do not put anything in it that you would not say to that person directly.',
  },
]

// ---- Wave 3 pages: copy, daily, tree, games (TASK-022) ---------------------

const COPY: readonly FaqItem[] = [
  {
    question: 'Why practise Morse code with random code groups?',
    answer: `Because random groups cannot be guessed. Real words let you fill in a missing letter from the ones either side, which is a useful skill but hides what you can actually hear. Random code groups measure copying and nothing else, which is why proficiency tests have long used them. MorseForge's copy practice sends groups of ${numberWord(codeGroup().length)}, about as much as anyone holds before the next group starts.`,
  },
  {
    question: 'How is a line of Morse code copy graded?',
    answer: `Character by character, after lining up what was sent with what you typed, so dropping one character costs one mark rather than every character after it. In MorseForge's copy practice a line is clean when every character is right and nothing was added, and it clears the bar at ${Math.round(COPY_PASS_MARK * 100)}%, because on the air most of a callsign is a wrong callsign.`,
  },
  {
    question: 'Should I write Morse code down or type it?',
    answer:
      'Type it in MorseForge so the line can be graded, but the habit worth building either way is copying a character or two behind the sending rather than trying to keep up. Falling behind on purpose is how Morse operators reach high speeds: you decode the last character while hearing the next.',
  },
]

const DAILY: readonly FaqItem[] = [
  {
    question: 'How is the daily Morse code challenge the same for everyone?',
    answer: `The date is the seed. Every browser runs the same generator over the same UTC date and gets the same ${FACTS.dailyLines} lines, the same speed and the same pass mark. Nothing has to be fetched, so the daily Morse code challenge works offline, and there is no server that can go down or start charging.`,
  },
  {
    question: 'Why does the daily Morse challenge use UTC and not my local day?',
    answer:
      "Your practice streak uses your local day, deliberately, so going to bed late does not cost you a day. A shared challenge is a different question: it only works if today means the same thing in Istanbul and in Los Angeles, so the streak is yours and the daily challenge is everyone's.",
  },
  {
    question: 'What does the shared daily challenge result show?',
    answer:
      'One square per line, how many lines cleared the bar, your accuracy and your streak. The shared result of the daily Morse code challenge never includes the text of a line, so posting it in the morning spoils nothing for someone who plays at night.',
  },
  {
    question: 'What happens if I miss the bar on the daily challenge?',
    answer:
      'Nothing is lost. The daily challenge streak counts attempts, not passes, because showing up is the only thing a streak is any good at encouraging. If the speed is the problem, set your own in copy practice and work up to the daily speed from there.',
    links: [{ text: 'copy practice', href: '/copy/' }],
  },
]

const treeRows = treeDepth(MORSE_TREE)
const treeLastRow = FACTS.lettersByLength[treeRows] ?? []
const treeSpare = 2 ** treeRows - treeLastRow.length
/** Letters of other languages that sit in the tree's spare places. */
const treeSpareUsers = Object.keys(EXTENDED_LETTERS).filter(
  (letter) => codeLength(letter) === treeRows,
)

const TREE: readonly FaqItem[] = [
  {
    question: 'Why are dots on the left and dashes on the right of the Morse code tree?',
    answer:
      "It is a convention, not part of the code. Every Morse character is a path of dots and dashes from the root, so any drawing of the Morse code tree has to send one branch each way. Drawing dots left and dashes right means reading a letter's code and following its path are the same left-to-right motion.",
  },
  {
    question: 'Why are some places on the bottom row of the Morse code tree empty?',
    answer: `The Morse code tree of the English alphabet is ${numberWord(treeRows)} rows deep, so its last row has room for ${2 ** treeRows} patterns of ${numberWord(treeRows)} elements, but only ${treeLastRow.length} of them are English letters. The other ${numberWord(treeSpare)} stay empty rather than being filled with something made up${
      treeSpareUsers.length > 0
        ? `, although other languages use some of them for letters such as ${joinList(treeSpareUsers)}`
        : ''
    }.`,
  },
]

const SIGNAL_DEFENDER: readonly FaqItem[] = [
  {
    question: 'Is there a game for learning to copy Morse code by ear?',
    answer: `Signal Defender is one. Signals fall down the screen as dots and dashes and sound as they appear, and you type the letter each one spells before it lands; the letter shows only once you hit it. Let ${numberWord(DEFENDER_LIVES)} reach the floor and the run is over. It trains decoding at speed, and every hit and every miss feeds the same review schedule as MorseForge's practice.`,
    links: [{ text: 'practice', href: '/practice/' }],
  },
  {
    question: 'Can I play Signal Defender with the sound off?',
    answer:
      'Yes. Each falling signal shows only its dots and dashes, and the letter appears once you hit it, so with sound switched off in settings Signal Defender is a Morse reading game rather than a listening one. With sound on, you read and hear every code at once.',
    links: [{ text: 'settings', href: '/settings/#signal' }],
  },
]

const MORSE_RUNNER: readonly FaqItem[] = [
  {
    question: 'Is there a game for practising sending Morse code?',
    answer: `Morse Runner is one. Gates rush towards you, each showing one letter but not its code, and you key the code from memory on your keyboard or the on-screen key before you arrive; run into ${numberWord(RUNNER_LIVES)} and the run is over. A wrong send shows the nearest gate's code as a hint, though a gate passed on its hint scores nothing. Unlike the telegraph, the clock does not wait, so it shows whether you can really send a character or only work it out.`,
    links: [{ text: 'telegraph', href: '/telegraph/' }],
  },
  {
    question: 'Why does Morse Runner end my character too early or not at all?',
    answer:
      'In Morse Runner, a character is committed as soon as what you have keyed matches a gate, or can no longer match any gate on the track; only a half-finished character waits for the pause. How long that pause lasts is a separate setting from sending speed, and the default is deliberately patient. If characters still run together or split early, adjust the keyer timing in settings.',
    links: [{ text: 'settings', href: '/settings/' }],
  },
]

// ---- SEO-D reference pages (TASK-021, package N) ---------------------------

/** Send time of one digit at the example speed, in milliseconds. */
const digitMs = (digit: keyof typeof DIGITS): number =>
  timelineDuration(buildTimeline(DIGITS[digit], { wpm: FACTS.exampleWpm }))

const digitsBySpeed = [...ALL_DIGITS].sort((a, b) => digitMs(a) - digitMs(b))
const quickestDigit = digitsBySpeed[0]!
const slowestDigit = digitsBySpeed.at(-1)!
/** What swapping one dot for a dash adds, at the example speed. */
const dashPenaltyMs = (FACTS.units.DASH - FACTS.units.DOT) * FACTS.unitMs

const swapElements = (code: string): string =>
  [...code].map((element) => (element === '.' ? '-' : '.')).join('')
const digitWithCode = (code: string): string | undefined =>
  ALL_DIGITS.find((digit) => DIGITS[digit] === code)

/** "1 into 6, 2 into 7 …": each digit whose dot-dash swap is another digit, counted once. */
const digitMirrors = ALL_DIGITS.flatMap((digit) => {
  const other = digitWithCode(swapElements(DIGITS[digit]))
  return other && Number(digit) > 0 && Number(digit) <= ALL_DIGITS.length / 2
    ? [`${digit} into ${other}`]
    : []
})
const mirrorDistance = (Number(digitWithCode(swapElements(DIGITS['1']))) || 0) - 1
const digitReversals = ALL_DIGITS.flatMap((digit) => {
  const other = digitWithCode([...DIGITS[digit]].reverse().join(''))
  return other && other !== digit && digit < other ? [`${digit} and ${other}`] : []
})
/** Pairs that themselves contain "and" need a comma before the last one. */
const pairList = (pairs: readonly string[]): string =>
  pairs.length <= 2 ? pairs.join(' and ') : `${pairs.slice(0, -1).join(', ')}, and ${pairs.at(-1)}`
const digitPalindromes = ALL_DIGITS.filter(
  (digit) => [...DIGITS[digit]].reverse().join('') === DIGITS[digit],
)

const NUMBERS: readonly FaqItem[] = [
  {
    question: 'How do you write numbers in Morse code?',
    answer: `Digit by digit, with a space between them, exactly as letters are spaced. Every digit is ${numberWord(FACTS.digitElements)} elements long, so 73, the operators' sign-off, is "${encode('73')}". Morse code has no single symbol for a number bigger than ${numberWord(Math.max(...ALL_DIGITS.map(Number)))}; larger numbers are always spelled out one digit at a time.`,
    links: [{ text: "the operators' sign-off", href: '/words/73/' }],
  },
  {
    question: `Why is 0 ${describeElements(DIGITS['0'])} in Morse code?`,
    answer: `Because the digits run in a cycle. 1 is ${describeElements(DIGITS['1'])}, and each digit after it moves one more dot in until 5 is ${describeElements(DIGITS['5'])}. From 6 the dashes come back in the same order, so 9 is ${describeElements(DIGITS['9'])} and the only pattern left after it is ${describeElements(DIGITS['0'])}. Zero closes the cycle after nine rather than opening it before one.`,
  },
  {
    question: 'How long does it take to send a number in Morse code?',
    answer: `At ${FACTS.exampleWpm} words per minute the quickest digit, ${quickestDigit} (${describeElements(DIGITS[quickestDigit])}), takes ${digitMs(quickestDigit)} milliseconds and the slowest, ${slowestDigit} (${describeElements(DIGITS[slowestDigit])}), takes ${digitMs(slowestDigit)} milliseconds. Every dash that replaces a dot adds ${numberWord(FACTS.units.DASH - FACTS.units.DOT)} units, ${dashPenaltyMs} milliseconds at that speed, and a gap between digits adds ${numberWord(FACTS.units.CHARACTER_GAP)} units more.`,
  },
  {
    question: 'Which Morse code numbers are mirror images of each other?',
    answer: `Swapping every dot for a dash turns ${joinList(digitMirrors)}, so each digit's mirror is ${numberWord(mirrorDistance)} places along. Reading a digit backwards gives another digit as well: ${pairList(digitReversals)}. Only ${joinList(digitPalindromes)} read the same in both directions.`,
  },
]

/** The Farnsworth example: the example speed for characters, the slowest slider speed overall. */
const farnsworthExample = resolveTiming({ wpm: FACTS.exampleWpm, farnsworthWpm: FACTS.wpmMin })
const standardExample = resolveTiming({ wpm: FACTS.exampleWpm })

const SPEED: readonly FaqItem[] = [
  {
    question: 'What does WPM mean in Morse code?',
    answer: `WPM is words per minute, measured with the standard word PARIS. PARIS is exactly ${PARIS_UNITS} units long, counting the gap after it, so sending it W times a minute fixes one unit, the length of a dot, at ${FACTS.unitMsAtOneWpm} ÷ W milliseconds. At ${FACTS.exampleWpm} WPM a dot lasts ${FACTS.unitMs} milliseconds.`,
  },
  {
    question: `How fast is ${FACTS.exampleWpm} words per minute in Morse code?`,
    answer: `At ${FACTS.exampleWpm} words per minute a dot lasts ${standardExample.dot} milliseconds, a dash ${standardExample.dash}, the gap between letters ${standardExample.characterGap} and the gap between words ${standardExample.wordGap}. The word PARIS, gap included, takes exactly ${60 / FACTS.exampleWpm} seconds, because ${FACTS.exampleWpm} of them fill one minute.`,
  },
  {
    question: 'What is the difference between character speed and Farnsworth speed?',
    answer: `Character speed sets how fast the dots and dashes inside each character are sent. Farnsworth speed is the slower overall rate reached by stretching only the gaps between characters and words. With characters at ${FACTS.exampleWpm} WPM and a Farnsworth speed of ${FACTS.wpmMin}, every letter sounds exactly as it does at ${FACTS.exampleWpm}, but the gap after it grows from ${Math.round(standardExample.characterGap)} to ${Math.round(farnsworthExample.characterGap)} milliseconds. The ARRL standard defines the stretch.`,
    links: [
      { text: 'Farnsworth speed', href: '/blog/what-farnsworth-timing-is/' },
      { text: 'ARRL', href: CITATIONS.arrl.url },
    ],
  },
  {
    question: 'Why is PARIS used to measure Morse code speed?',
    answer: `Because its length is a round number. PARIS has ${PARIS_KEYING_UNITS} units of dots, dashes and gaps inside its letters, plus ${PARIS_SPACING_UNITS} units of letter and word spacing, which make exactly ${PARIS_UNITS}. A speed in words per minute then converts straight into a unit length of ${FACTS.unitMsAtOneWpm} ÷ WPM milliseconds, with no table to look up.`,
  },
]

const koch = METHODS.koch
const kochAccuracy = koch.unlockAccuracy
if (kochAccuracy === null) throw new Error('The Koch method needs an unlock accuracy')

const HOW_TO: readonly FaqItem[] = [
  {
    question: 'How many minutes a day should I practise Morse code?',
    answer: `Between ${FACTS.planMinMinutesPerDay} and ${FACTS.planMaxMinutesPerDay} minutes is enough. MorseForge's ${FACTS.planDays}-day plan asks for ${FACTS.planFirstDayMinutes} minutes on day 1 and ${FACTS.planMaxMinutesPerDay} on its longest days, about ${FACTS.planTime} in total. Short daily sessions beat one long weekly session, so keep going every day after the plan ends.`,
    links: [
      { text: `${FACTS.planDays}-day plan`, href: '/learn-morse-code-in-7-days/' },
      {
        text: 'Short daily sessions',
        href: '/blog/how-long-does-it-take-to-learn-morse-code/',
      },
    ],
  },
  {
    question: 'Should I use the Koch method or learn the shortest codes first?',
    answer: `Either works, and both beat learning alphabetically. The Koch method starts at full speed with just ${joinList(koch.order.slice(0, koch.startingCount))} and adds one character each time you reach ${Math.round(kochAccuracy * 100)}% accuracy. Shortest-first follows the Morse tree outwards from ${joinList(LEARNING_STAGES[0]!)}, one layer at a time, which is the order of MorseForge's plan. Practice lets you pick either.`,
    links: [
      { text: 'Koch method', href: '/blog/which-order-should-you-learn-morse-in/' },
      { text: 'Morse tree', href: '/tree/' },
      { text: 'Practice', href: '/practice/' },
    ],
  },
  {
    question: 'Do I need to learn to send Morse code as well as receive it?',
    answer:
      'Yes, if you want to use it. Hearing a character and sending it are separate skills: you can copy a letter perfectly and still key it with the wrong rhythm. Sending each new character back also checks that you have its timing, not just its name. The online telegraph key works with a keyboard or a touchscreen.',
    links: [{ text: 'online telegraph key', href: '/telegraph/' }],
  },
]

/** FAQs for the fixed pages, keyed by the page's path in the registry. */
export const PAGE_FAQ = {
  '/': HOME,
  '/learn-morse-code-in-7-days/': PLAN,
  '/morse-code-alphabet/': ALPHABET,
  '/morse-code-translator/': TRANSLATOR,
  '/practice/': PRACTICE,
  '/challenge/': CHALLENGE,
  '/telegraph/': TELEGRAPH,
  '/message/': MESSAGE,
  '/morse-code-numbers/': NUMBERS,
  '/morse-code-speed/': SPEED,
  '/how-to-learn-morse-code/': HOW_TO,
  '/copy/': COPY,
  '/daily/': DAILY,
  '/tree/': TREE,
  '/games/signal-defender/': SIGNAL_DEFENDER,
  '/games/morse-runner/': MORSE_RUNNER,
} as const satisfies Readonly<Record<string, readonly FaqItem[]>>

/** The pages that have an FAQ, as a type: what a per-language catalog must cover. */
export type FaqPath = keyof typeof PAGE_FAQ

/** The FAQ for a page, or an empty list when the page has none. */
export function faqFor(path: string): readonly FaqItem[] {
  return (PAGE_FAQ as Readonly<Record<string, readonly FaqItem[]>>)[path] ?? []
}

/**
 * The FAQ for a word page.
 *
 * The first question carries the entry's own note, which is why the page
 * exists. The others are computed, so a word added to `WORDS` gets a complete
 * FAQ without anyone writing one.
 */
export function wordFaq(word: MorseWord): FaqItem[] {
  const facts = wordFacts(word)
  const label = wordLabel(word)
  const prosign = prosignFacts(word)
  const items: FaqItem[] = [
    {
      question: `What is ${label} in Morse code?`,
      answer: `${label} in Morse code is "${facts.morse}". ${word.note}`,
    },
    {
      question: `How long does it take to send ${label} in Morse code?`,
      answer: `At ${FACTS.exampleWpm} words per minute, ${label} takes about ${facts.sendSeconds} seconds to send. That counts its ${facts.dots} dots and ${facts.dashes} dashes plus the silences between them, timed by the PARIS standard, in which one unit, the length of a dot, is ${FACTS.unitMs} milliseconds at that speed.${prosign ? ` Sent the way operators send it, run together as one prosign with no gaps between the letters, it takes about ${prosign.sendSeconds} seconds.` : ''}`,
    },
  ]

  if (facts.wordCount > 1) {
    const slashes = facts.wordCount - 1
    items.push({
      question: `How do you write ${label} in Morse code?`,
      answer: `Write it as "${facts.morse}". Each group of dots and dashes is one letter, a single space separates letters and a slash separates words, so the ${numberWord(facts.wordCount)} words of ${label} are divided by ${numberWord(slashes)} ${slashes === 1 ? 'slash' : 'slashes'}.`,
    })
  }

  return items
}

/**
 * The FAQ for a character page. A question is left out when its computed value
 * is empty, so no answer ever says "confused with nothing".
 */
export function characterFaq(facts: CharacterFacts): FaqItem[] {
  const punctuation = facts.kind === 'punctuation'
  const asked = punctuation ? `the ${facts.name}` : facts.character
  const answering = punctuation ? `The ${facts.name} (${facts.character})` : facts.character
  const items: FaqItem[] = []

  const treeSentence = facts.tree
    ? ` It sits ${numberWord(facts.tree.steps)} ${facts.tree.steps === 1 ? 'step' : 'steps'} from the root of the Morse code tree.`
    : ''
  items.push({
    question: `What is ${asked} in Morse code?`,
    answer: `${answering} in Morse code is "${facts.code}", spoken ${facts.spoken}. It is ${numberWord(facts.elements)} ${facts.elements === 1 ? 'element' : 'elements'} long (${facts.spelled}) and takes ${facts.durationMs.wpm20} milliseconds to send at ${FACTS.exampleWpm} words per minute.${treeSentence}`,
  })

  const confusions: string[] = []
  if (facts.mirror) {
    confusions.push(
      `${facts.mirror} (${codeOf(facts.mirror)}), its mirror image with dots and dashes swapped`,
    )
  }
  if (facts.neighbours.length > 0) {
    const others = joinList(facts.neighbours.map((other) => `${other} (${codeOf(other)})`))
    confusions.push(`${others}, each of which differs from it by a single element`)
  }
  if (confusions.length > 0) {
    items.push({
      question: `Which Morse code characters are confused with ${asked}?`,
      answer: `${answering} (${facts.code}) is easy to confuse with ${confusions.join(', and with ')}. Practise them back to back until the difference is a sound rather than a count.`,
    })
  }

  if (facts.planDay !== null) {
    const companions =
      facts.companions.length > 0 ? `, together with ${joinList(facts.companions)}` : ''
    items.push({
      question: `How do you learn ${asked} in Morse code?`,
      answer: `By its sound, not its shape: ${answering} is spoken ${facts.spoken}. Listen to it at full speed instead of counting its elements. MorseForge's ${FACTS.planDays}-day plan teaches it on day ${facts.planDay}${companions}.`,
      links: [{ text: `${FACTS.planDays}-day plan`, href: '/learn-morse-code-in-7-days/' }],
    })
  }

  return items
}

function codeOf(character: string): string {
  return MORSE_ALPHABET[character] ?? ''
}
