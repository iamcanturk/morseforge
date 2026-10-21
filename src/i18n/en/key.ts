/**
 * The Morse key: the brass straight key, the iambic paddles, the station that
 * holds them on the telegraph, and the settings vocabulary they share.
 */

import { namespace } from '../define'

/** Names for settings values, shared by every screen that shows them. */
export const terms = namespace('terms', {
  signalSound: 'Sound',
  signalLamp: 'Lamp',
  signalBoth: 'Both',
  keyerStraight: 'Straight',
  keyerIambicA: 'Iambic A',
  keyerIambicB: 'Iambic B',
  presetLearning: 'Learning',
  presetRelaxed: 'Relaxed',
  presetStandard: 'Standard',
  presetManual: 'Manual',
  /** The key caps for the two keys that have names rather than letters. */
  keySpace: 'SPACE',
  keyCtrl: 'CTRL',
  keyCtrlLeft: 'LEFT CTRL',
  keyCtrlRight: 'RIGHT CTRL',
  /** The commit key spelled out, as the drills' hint line prints it. */
  keyControl: 'CONTROL',
})

export const key = namespace('key', {
  ready: 'Ready',
  notACharacter: 'Not a character yet',
  preview: '= {preview}',
  previewUnknown: '= ?',
  label:
    'Morse key. Press and hold this button, or hold the {key} key. A short press sends a dot, a long press sends a dash.',
  tx: 'TX',
  transmitting: 'Transmitting',
  hold: 'Hold {key}',
  holdToSend: 'Hold to send',
  soundOff: 'Sound off',
  hertz: '{frequency} Hz',
  pauseHint: 'Pause to finish the character; the bar above shows how long you have.',
  manualHint:
    'Take as long as you like, then<desk> press {key} </desk><touch> use the button below </touch>to finish the character.',
  pendingPreview: '{code}, {preview}',
  pendingNone: '{code}, not a character yet',
  fuse: 'Time left before this character is committed',
  noSignal: 'No signal',
  traceTitle: '{element}, {ms} ms',
  tapLead: 'Tap for a dot, hold for a dash.',
  paddleLeadDesk: 'Hold {dit} for dits and {dah} for dahs, or both to alternate.',
  paddleLeadTouch: 'Hold a paddle for dits or dahs, or both to alternate.',
  // Paddles
  paddles: '{kind} paddles',
  dit: 'Dit',
  dah: 'Dah',
  ditPaddle:
    'Dit paddle. Hold for a run of dits, or hold the {key} key. Hold both paddles to alternate.',
  dahPaddle:
    'Dah paddle. Hold for a run of dahs, or hold the {key} key. Hold both paddles to alternate.',
  // The station
  signalDetected: 'Signal detected',
  finish: 'Finish',
  finishCharacter: ' character',
  newWord: 'New word',
  undo: 'Undo character',
  clear: 'Clear tape',
  stationPause: 'Pause to finish the character; the fuse shows how long you have.',
  stationManual: 'Take your time, then<desk> press {key}</desk><touch> tap Finish</touch>.',
  decoded: 'Decoded text',
  printsHere: 'Your message prints here',
  // How patient the decoder is
  patience: 'Time to finish a character',
  custom: 'Custom, set in Settings',
  seconds: '{seconds} s',
  noTimer: 'No timer',
  patienceSeconds: '{preset}, {seconds} seconds',
  patienceNoTimer: '{preset}, no timer',
})

/** The telegraph screen. */
export const telegraph = namespace('telegraph', {
  yourName: 'Your name',
  free: 'Free',
  send: 'Send',
  whatToSend: 'What to send',
  namePlaceholder: 'Ada',
  enterThenKey: 'Press Enter, then key it.',
  thenKeyBelow: 'Then key it below.',
  keyFirstLetter: 'Key the first letter',
  printsHere: 'Your message prints here',
  yourTiming: 'Your timing',
  whereInTree: 'Where you are in the tree',
  hideTree: 'Hide tree',
  showTree: 'Show tree',
  received: 'Received',
  chars: '{count} chars',
  nothingSent: 'Nothing sent yet. What you key prints on the tape and here, in full.',
  asMorse: 'As Morse',
  unknownNote:
    '{mark} marks a sequence that is not a character, usually an extra element slipped in. Give yourself more time per character, or switch to Manual so nothing finishes until you say so.',
  earnedHere: 'Earned on this visit',
  worthSending: 'Worth sending',
  sendTarget: 'Send {target}',
  sendYourName: 'Send your name',
  typeName: 'Type your name above',
  sent: 'Sent',
  xpGain: '+{xp} XP',
  moreOn: 'More on {word}',
  sentClean: 'Sent clean.',
  sentSlips: { one: 'Sent, with {count} slip.', other: 'Sent, with {count} slips.' },
  sendAgain: 'Send it again',
  thatWas: 'That was {slip}. ',
  next: 'Next: <next>{character}</next>',
  letterByLetter: ' Letter by letter, with a pause between.',
  pauseHint: 'Pause to finish the character; the fuse shows how long you have.',
  pressFinish: 'Then press Finish.',
  receivedStamp: 'Received',
  copiedWithLink: 'Copied the telegram and a link that plays it',
  copied: 'Copied the telegram',
  copyBlocked: 'Copying was blocked. Select the text below instead.',
  refusedCopied: 'Sharing was refused, so the telegram and its link were copied instead.',
  refused: 'Sharing was refused here. Use Copy text, or Save image.',
  shareHeading: 'Share this telegram',
  shareSub: 'With a link that plays it in Morse.',
  dismissSharing: 'Dismiss sharing',
  share: 'Share',
  copyText: 'Copy text',
  seeCard: 'See the card',
  imageFailed: 'The image could not be made here. Copy text still works.',
  saved: 'Saved {file}',
  panelHeading: 'Share this as a telegram',
  dismissPanel: 'Dismiss the share panel',
  saveImage: 'Save image',
  linkPlays:
    'The text carries a link that plays your message in Morse, so whoever gets it can hear it.',
  linkTelegraph:
    'Too long, or too unusual, for a message link, so this one links to the telegraph instead.',
})

/** The prose on /telegraph/. */
export const telegraphPage = namespace('telegraphPage', {
  howHeading: 'How to send Morse code with a keyboard',
  howBody:
    'The Space bar is the key. Press it and the sidetone sounds for as long as you hold it: let go quickly for a dot, hold it past {dashAfter} ms for a dash. Then stop. When the key has been quiet long enough, the elements you sent are read as one character and printed on the tape. Stay quiet a little longer and the word ends too. On a phone or tablet, press and hold the brass key on the screen instead; it behaves exactly the same.',
  letterBody:
    'To send the letter S, tap three times ({code}) and wait. To send the word, send each letter the same way, with a pause between them. If a character finishes before you meant it to, press <b>Finish</b> yourself next time, or give the key more time below it.',
  waitHeading: 'Why the key waits for you',
  waitBody:
    'How patient the key is has nothing to do with speed. At {wpm} WPM a character ends after {gap} ms of silence, which is right for a practised operator and hopeless for a beginner who means to send S and, after a moment of doubt, has sent E three times. So the telegraph starts on {learning}: a character ends after {characterGap} seconds of quiet and a word after {wordGap}. Switch to {manual} and nothing finishes until you say so. The fuse between the tape and the key shows how long you have left.',
  firstHeading: 'What to send first',
  firstBody:
    'Pick a target above the key and the tape checks it letter by letter as you send. A few words every operator knows are worth trying:',
  sos: '<word>{label}</word> (<code>{code}</code>), the distress signal, which also works sent as one unbroken character.',
  cq: '<word>{label}</word> (<code>{code}</code>), a call to any station listening.',
  regards: '<word>{label}</word> (<code>{code}</code>), best regards, the usual sign-off.',
  love: '<word>{label}</word> (<code>{code}</code>), love and kisses.',
  privacyBody:
    'The text you key is never uploaded, and the telegram you can share at the end is drawn on your own screen. If anonymous counters are on in Settings, the site counts that a word was sent, and which of the four words above turned up; nothing more.',
})
