/**
 * The prose around the practice tools: /practice/, /challenge/.
 * Titles, H1s and intros are the registry's (`src/config/pages.ts`).
 */

import { namespace } from '../define'

export const practicePage = namespace('practicePage', {
  noteListening:
    'trains copying by ear: a character plays as real CW tone, and you name it. This is the skill every other one leans on, and the one a chart cannot teach.',
  noteRecognition:
    'shows the dots and dashes and asks what they spell. Quick to drill and useful for reading printed code, though it is the one to lean on least.',
  noteSending:
    'asks you to key the character yourself, on the keyboard or the on-screen key, so your hand learns the rhythm as well as your ear.',
  modesHeading: 'Three modes, three skills',
  modesBody:
    'Recognising a character, hearing it and sending it are separate skills, and each one is scored on its own. A character only counts as mastered with {rule}, so a letter you have read but never heard still comes back for practice.',
  /** "Hear it, then name it: trains copying…", the mode's prompt then its note. */
  modeLine: '{prompt}: <note>{note}</note>',
  orderHeading: 'Which order to practise in',
  orderBody:
    '"My method" practises the characters your teaching order has unlocked so far. The default is the {method} order; you can switch under Adjust at any time, and your progress carries over. The reasoning behind each, and why the order matters at all, is in <post>which order to learn Morse code in</post>.',
  nextHeading: 'When single characters feel easy',
  nextBody:
    '<copy>{copy}</copy> sends whole lines (code groups, words and callsigns) and grades what you wrote character by character. Or take the <challenge>{seconds}-second test</challenge>: a fixed run of characters at a fixed speed, with a link at the end that gives a friend the identical run to beat.',
  /** JSON-LD: what a learning resource teaches. */
  teaches: 'International Morse code',
})

export const challengePage = namespace('challengePage', {
  newHeading: 'Never done this before?',
  newBody:
    'The standard run draws from the first {pool} letters of the teaching order, so {seconds} seconds is enough to score with only a few of them. {dot} is one dot ({dotCode}) and {dash} is one dash ({dashCode}). The <learn>guided lessons</learn> follow the {days}-day plan, which takes you from there to all {letters} letters in about {planTime} of practice.',
  retakeBody:
    'Retake it as often as you like; every run you start yourself gets a new sequence. If you want one fixed test a day instead, the <daily>{daily}</daily> is the same {lines} lines for everyone.',
  sendHeading: 'Challenging someone else',
  sendBody:
    'Finish a run and you get a link that carries the whole test: a seed that fixes which characters come up and in what order, how many letters it draws from, the length, the speed, and your score to beat.',
  serverBody:
    'Your friend hears exactly what you heard, so the two scores are comparable. There is no server behind it: everything is in the URL, so the link works offline and keeps working. That also means the score on a link is a claim, and the page shows it as one. Values outside a sensible range are clamped rather than trusted, from {timeMin} to {timeMax} seconds and {wpmMin} to {wpmMax} WPM, and a broken link falls back to the standard test instead of an error.',
  leaderboardBody:
    "There is no global leaderboard, because ranking strangers honestly needs a server that checks every score. Your own best and a friend's link are the comparisons this can make truthfully.",
  /** JSON-LD */
  platform: 'Web browser',
  teaches: 'International Morse code',
})
