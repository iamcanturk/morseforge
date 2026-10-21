/**
 * The two games: the cabinet they share, Signal Defender and Morse Runner.
 */

import { namespace } from '../define'

export const games = namespace('games', {
  poolMethod: 'My method ({count})',
  poolFirst: 'First {count}',
  poolAll: 'All {count}',
  characters: 'Characters',
  lives: 'Lives',
  livesLeft: ' lives left',
  setup: '{name} setup',
  plate: '{name} · {console}',
  standby: 'Standby',
  yourBest: 'Your best',
  copied: 'Copied. Paste it anywhere.',
  selectToCopy: 'Select the text and copy it.',
  sendIt: 'Send it',
  notNow: 'Not now',
  resultToCopy: 'Your result, to copy',
  share: 'Share',
  copyText: 'Copy text',
  newBest: 'New best',
  firstRecord: 'First record',
  runEnded: 'Run ended',
  reportPlate: '{name} · Run report',
  score: 'Score',
  newBestLine: '<b>New best!</b> Your previous best was {best}.',
  firstRecordLine: 'Your first recorded run. That is the number to beat.',
  bestLine: 'Your best is {best}.',
  notCounted: 'Nothing was answered, so this run was not counted.',
  banked: 'Banked',
  xpGain: '+{xp} XP',
  streak: { one: 'Streak: {count} day', other: 'Streak: {count} days' },
  received: 'Received',
  achievementEarned: 'Achievement earned.',
  misses: '×{count}',
  measurement:
    'A game is a measurement, not a lesson. <practice>Practice</practice> is where these get fixed: it waits for you, which is exactly what this does not.',
  again: 'Again',
  changeSetup: 'Change setup',
  savedLocally: 'Saved to this browser only.',
  /** The share line: "Signal Defender: 1,250, 92% cleared". */
  shareLine: '{name}: {score}, {percent}% cleared',
})

export const defender = namespace('defender', {
  console: 'Receiving console',
  start: 'Start',
  ruleFall: 'Signals fall as Morse code, each one sounding as it appears.',
  ruleType: 'Type the character a code spells to knock down the lowest one that matches.',
  ruleReveal: 'The letter shows only once it is hit.',
  ruleLives: 'Let {lives} reach the floor and the run is over.',
  soundOff:
    'Sound is off in settings. The signals still fall and still show their code, so the game works: you read each code instead of hearing it.',
  overrun: 'Overrun',
  caption: '{percent}% cleared · {hits} down, {landed} landed',
  bestStreak: 'Best streak',
  lasted: 'Lasted',
  seconds: '{seconds}s',
  xp: 'XP',
  plusXp: '+{xp}',
  strip: 'Each lamp is one signal or one key, in order. A ring is a miss.',
  gotPast: 'What got past you',
  playing: '{name}, playing',
  receiving: '{name} · Receiving',
  onAir: 'On air',
  endRun: 'End run',
  score: 'Score',
  streak: 'Streak',
  multiplier: '×{value}',
  onTheWire: 'On the wire',
  floor: 'Floor',
  pressure: 'Pressure',
  typeLabel: 'Type what each code spells',
  answerPad: 'Answer pad',
  waiting: 'Waiting for the first signal',
  gotThrough: '{letters} got through',
  down: '{character} down, +{points}',
  matchedNothing: '{character} matched nothing',
})

export const runner = namespace('runner', {
  console: 'Sending console',
  start: 'Start running',
  ruleGates: 'Gates come towards you, each showing one letter and not its code.',
  ruleKey: 'Key its code from memory before you reach the gate and you pass through.',
  ruleHint:
    'Key a wrong one and the nearest gate shows its code. You can get through on the hint, but it scores nothing.',
  ruleLives: '{lives} collisions and the run is over.',
  note: 'Unless you pick another set, the gates use only the characters you have been taught. You send on the same key as the <telegraph>telegraph</telegraph>, straight or paddles. A character counts as soon as it matches a gate, or can no longer match one; only a half-keyed character waits for the pause, and how long that is comes from your <settings>settings</settings>.',
  runOver: 'Run over',
  caption: '{percent}% cleared · {cleared} of {gates} gates',
  distance: 'Distance',
  metres: '{metres} m',
  metresUnit: 'm',
  bestStreak: 'Best streak',
  xp: 'XP',
  plusXp: '+{xp}',
  strip: 'Each lamp is one gate, in order. A ring is a collision.',
  knocked: 'What knocked you over',
  running: '{name}, running',
  sending: '{name} · Sending',
  onAir: 'On air',
  endRun: 'End run',
  score: 'Score',
  multiplier: '×{value}',
  points: '+{points}',
  speed: '{speed} m/s',
  nextGate: 'Next gate: {character}',
  nextGateHint: 'Next gate: {character}, hint: {code}',
  trackClear: 'Track clear',
  keyNearest: 'Key the code for the nearest gate.',
  throughHint: '{character} through on the hint, no points',
  cleared: '{character} cleared, +{points}',
  noGateHint: '{character} matched no gate. {hinted} is {code}',
  noGate: '{character} matched no gate',
  hitGate: 'Hit the {gates} gate',
})

/** The prose on the two game pages. */
export const gamesPage = namespace('gamesPage', {
  defenderHeading: 'What a game is for',
  defenderWhy:
    'Not learning. Practice teaches, and it waits for you: you can sit on a character for as long as you like and still be told you were right. That is correct for learning and useless as a measure, because copying at speed does not fail on characters you cannot decode. It fails on characters you cannot decode <em>before the next one arrives</em>.',
  defenderGap:
    'This is that gap, made visible. Each signal falls as its code alone, with the letter shown only once you have named it. Everything you knock down, and everything that lands, feeds the same review schedule as practice, so a run is not thrown away. But what it is really for is the list at the end of what got past you.',
  defenderOther: 'The other one is <other>{name}</other>, which is the same idea for sending.',
  runnerHeading: 'Why sending needs a clock',
  runnerWhy:
    'The <telegraph>telegraph</telegraph> waits for you forever, and so does the sending drill. That is the right way to learn a character, and it is why neither of them ever teaches you to commit to one. Hesitating costs nothing there. On the air it costs the contact.',
  runnerGate:
    'Here the gate arrives whether you are ready or not, which is the only honest way to find out whether you can send a character or merely work one out. Each gate shows only its letter: the code has to come from memory. A wrong send shows the code as a hint, and a gate passed on a hint saves the run but counts as a miss in the same sending schedule as practice.',
  runnerOther:
    'The other one is <other>{name}</other>, which is the same idea for reading: signals fall as dots and dashes, and the letter only shows once you have named it.',
})
