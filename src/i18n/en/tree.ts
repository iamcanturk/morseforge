/**
 * The Signal Tree: the board, its screen on /tree/, and the one-character drill.
 */

import { namespace } from '../define'

export const tree = namespace('tree', {
  // The board
  stateLocked: 'not met yet',
  stateDiscovered: 'met',
  stateActive: 'learning',
  stateMastered: 'mastered',
  /** A pad's name: "A, dot dash, learning". */
  padLabel: '{character}, {code}, {state}',
  scrollable: 'Morse code tree, scrollable',
  title: 'Morse code tree',
  description:
    'The Morse code binary tree across {depth} levels. From the root, a dot branches left and a dash branches right. {mastered} of {total} letters are mastered.',
  /** The legend at the root. The arrows point the way the branch goes. */
  dotBranch: '← DOT',
  dashBranch: 'DASH →',
  keysHint:
    'Arrow left follows a dot, arrow right follows a dash, arrow up goes back towards the root. Enter or Space picks a letter.',
  networkPower: 'Network power',
  percent: '{value}%',
  masteredOf: '{mastered} of {total} mastered',
  learningSuffix: ' · {count} learning',
  // The screen
  legendLocked: 'Not met',
  legendDiscovered: 'Met',
  legendActive: 'Learning',
  legendMastered: 'Mastered',
  legend: 'Legend',
  boardHeading: 'Signal tree · {first}–{last}',
  node: 'Node',
  startHere: 'Start here',
  tapToSwitch: 'Tap any pad to switch',
  spelledOut: '{character}: {spelled}',
  spokenLine: '“{spoken}” · {elements}',
  sending: 'Sending…',
  playAgain: 'Play again',
  flashAgain: 'Flash again',
  soundOff: 'Sound is off in settings',
  pathHeading: 'Path from the root',
  pathStart: 'START',
  pathDot: 'DOT',
  pathDash: 'DASH',
  /** A step on the path that lands on a character: "DOT E". */
  pathStep: '{step} {character}',
  mirror: 'Mirror',
  mirrorNote: 'dots and dashes swapped',
  planHeading: '{days}-day plan',
  planDay: 'Day {day}',
  justEarned: 'Just earned',
  firstSignal: 'First signal',
  xpGain: '+{xp} XP',
  received: 'Received',
  startAtCore: 'Start at the core.',
  /** "E is one dot", one per core letter, joined with commas. */
  coreLetter: '{character} is {elements}',
  coreBody:
    '{letters}. Every other letter grows from those two: a dot to the left, a dash to the right.',
  pickAny: 'Pick any pad to hear it, see its path from the root, and drill it right here.',
  // The drill
  drillSend: 'Send it',
  drillHear: 'Hear it',
  drillHeading: 'Drill {character}',
  signalLocked: 'Signal locked',
  notQuite: 'Not quite',
  youSent: 'You sent <code>{sent}</code>. {character} is <morse>{morse}</morse>.',
  youTyped: 'You typed <code>{sent}</code>. {character} is <morse>{morse}</morse>.',
  again: 'Again',
  tryAgain: 'Try again',
  keyIt: 'Key <glyph>{character}</glyph> on the key below',
  finishCharacter: 'Finish character',
  playSignal: 'Play the signal',
  flashSignal: 'Flash the signal',
  whatHeard: 'What did you hear?',
  whatSeen: 'What did you see?',
  check: 'Check',
})

/** The prose on /tree/. */
export const treePage = namespace('treePage', {
  readHeading: 'How to read the Morse code tree',
  readBody:
    'Start at the root, the ring at the top of the board. Every dot you hear is one step down and to the left, and every dash is one step down and to the right. Wherever you are standing when the character ends is the letter.',
  readBodyExample:
    'Start at the root, the ring at the top of the board. Every dot you hear is one step down and to the left, and every dash is one step down and to the right. Wherever you are standing when the character ends is the letter. So {character}, {spelled} (<code>{display}</code>), is one step left and then one step right.',
  depthBody:
    'How deep a letter sits is how long its code is. {top} are one step down because each is a single element. The second row holds {row2} letters of two elements, the third row {row3} of three, and the fourth {row4} of four. The {letters} letters fill {depth} rows, and the last row has room for {slots} but uses only {used}, which is why it has gaps.',
  depthBodyUnused:
    'How deep a letter sits is how long its code is. {top} are one step down because each is a single element. The second row holds {row2} letters of two elements, the third row {row3} of three, and the fourth {row4} of four. The {letters} letters fill {depth} rows, and the last row has room for {slots} but uses only {used}, which is why it has gaps: the other {unused} four-element patterns are not used by any character in international Morse code.',
  siblingsBody:
    'Two letters side by side under the same parent differ only in their last element. Pick any pad on the board to hear it at your own speed and tone, see its path from the root, and drill it on the spot, either by keying it or by naming it by ear.',
  siblingsBodyOne:
    'Two letters side by side under the same parent differ only in their last element. That is why {a} (<code>{aCode}</code>) and {b} (<code>{bCode}</code>) are easy to mix up at first: they share everything but the ending. Pick any pad on the board to hear it at your own speed and tone, see its path from the root, and drill it on the spot, either by keying it or by naming it by ear.',
  siblingsBodyTwo:
    'Two letters side by side under the same parent differ only in their last element. That is why {a} (<code>{aCode}</code>) and {b} (<code>{bCode}</code>), or {c} (<code>{cCode}</code>) and {d} (<code>{dCode}</code>), are easy to mix up at first: they share everything but the ending. Pick any pad on the board to hear it at your own speed and tone, see its path from the root, and drill it on the spot, either by keying it or by naming it by ear.',
  orderHeading: 'Why it is also the best order to learn in',
  orderBody:
    'Learning the tree from the top down means the shortest characters come first, and each new row only adds one element to patterns you already know. You never meet a four-element letter before you can tell a dot from a dash.',
  planBody:
    'That is the order the <lessons>guided lessons</lessons> and the <plan>{plan}</plan> follow. Day 1 is the top row, {first}. Each following day takes the next row, and a row too wide for one sitting is split across days. After {letterDays} days you have all {letters} letters, and the last day adds the {digits} digits: about {planTime} of practice in total.',
  planBodyLettersOnly:
    'That is the order the <lessons>guided lessons</lessons> and the <plan>{plan}</plan> follow. Day 1 is the top row, {first}. Each following day takes the next row, and a row too wide for one sitting is split across days. After {letterDays} days you have all {letters} letters: about {planTime} of practice in total.',
  padsBody:
    'Each pad shows how far along you are with that letter. A dashed pad is one you have not met. A thin ring means you have met it, an amber ring means you are learning it, and a lit pad means it is mastered. Mastered is a high bar on purpose: at least {attempts} answers in each of the {skills} skills, reading the code, hearing it and sending it, and an average of {percent}% or better across them. The network power gauge under the board averages that progress over the whole alphabet, so it moves every time you practise. For the full list of codes, letters, digits and punctuation, see <alphabet>the Morse code alphabet</alphabet>.',
})
