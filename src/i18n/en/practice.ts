/**
 * Practice, the timed challenge, the result screen and sharing.
 */

import { namespace } from '../define'

/** The three session modes (`src/game/session.ts`). */
export const modes = namespace('modes', {
  listeningLabel: 'Listen',
  listeningPrompt: 'Hear it, then name it',
  recognitionLabel: 'Read',
  recognitionPrompt: 'Read the dots and dashes',
  sendingLabel: 'Send',
  sendingPrompt: 'Key the character yourself',
})

/**
 * The teaching orders (`src/data/methods.ts`). The rationales are opinions on
 * purpose: "the weakest of the three" stays that blunt in every language.
 */
export const methods = namespace('methods', {
  signalName: 'Signal Tree',
  signalSummary: 'Shortest characters first, one layer of the tree per stage',
  signalRationale:
    'Follows the structure of the code itself: {first}, then every two-element character, then every three. You finish each stage having completed a whole layer of the Morse tree, which is why the tree lights up in rings rather than at random. Best if you want the alphabet to make sense rather than just be memorised.',
  kochName: 'Koch',
  kochSummary: 'Two characters at full speed, add one at {percent}% accuracy',
  kochRationale:
    'Ludwig Koch’s method, and what most clubs and courses teach. It starts at your target speed with just {first} — hard, dissimilar characters — and adds one more only once you are hitting {percent}%. Nothing ever slows down, so you never learn to count elements. Harder at the start and faster overall.',
  alphabeticalName: 'Alphabetical',
  alphabeticalSummary: '{firstLetter} to {lastLetter}, then {firstDigit} to {lastDigit}',
  alphabeticalRationale:
    'The order you already know, which makes it easy to track what you have covered. It is the weakest of the three for actually learning: {firstThree} sound nothing alike in difficulty, so the load jumps around unpredictably. Included because people ask for it.',
  /** "Signal Tree order", in the set-up's corner. */
  order: '{name} order',
  heading: 'Teaching order',
  yourCharacters: 'Your characters so far',
  unlockRule:
    'More join after a session at {percent}% accuracy over at least {attempts} answers, on the My method pool.',
})

export const practice = namespace('practice', {
  // Set-up
  setupHeading: 'Practice set-up',
  mode: 'Mode',
  characters: 'Characters',
  characterCount: { one: '{count} character', other: '{count} characters' },
  adjust: 'Adjust',
  adjustHint: 'Answer by, teaching order',
  answerBy: 'Answer by',
  layoutTyping: 'Typing',
  layoutTypingHint: 'Type the character.',
  layoutTree: 'The tree',
  layoutTreeHint: 'Pick it on the Morse tree, or key it.',
  start: 'Start',
  startSummary: 'Start: {summary}',
  poolMethod: 'My method ({count})',
  poolFirst: 'First {count}',
  poolAll: 'All {count}',
  signalLamp: 'Signal is set to Lamp: each character flashes instead of sounding.',
  signalBoth: 'Signal is set to Both: each character sounds and flashes.',
  changeInSettings: 'Change it in settings',
  // A preset that waits for the learner
  ready: 'Ready · {mode} · {count} prompts',
  // Running
  session: 'Practice session',
  right: 'Right',
  time: 'Time',
  timeUrgent: 'Time !',
  seconds: '{seconds}s',
  secondsLeft: '{seconds} seconds left',
  secondsLeftHurry: '{seconds} seconds left, hurry',
  prompt: 'Prompt',
  accuracy: 'Accuracy',
  end: 'End',
  receiving: 'Receiving',
  rxListen: 'RX · listen',
  rxWatch: 'RX · watch',
  read: 'Read',
  txSend: 'TX · send',
  correctShown: '✓ {character} · correct',
  youSaidShown: '✕ You said {given}',
  missedShown: '✕ Missed',
  itWasInline: ' · it was ',
  itWas: 'It was',
  playAgain: 'Play again',
  answerLabel: 'What character was that?',
  enter: 'Enter',
  treeHint: 'Tap a node, or key it and watch the path light up as you go.',
  finishCharacter: 'Finish character',
  // What the polite live region reads after an answer
  speechCorrect: '{character}, correct.',
  speechYouSaid: 'You said {given}.',
  speechMissed: 'Missed.',
  speechItWas: '{said} It was {character}.',
  speechItWasCode: '{said} It was {character}, {code}.',
  // Leaving a result
  backToChallenge: 'Back to the challenge',
  backToDrill: 'Back to the stage drill',
  backToSetup: 'Back to set-up',
  drillAgain: 'Drill again',
  playChallengeAgain: 'Play again',
  again: 'Again',
  challengeBlurb:
    'The link carries this exact run: the same {count} letters in the same order at {wpm} WPM. Nothing is stored anywhere.',
  challengeBlurbScore:
    'The link carries this exact run: the same {count} letters in the same order at {wpm} WPM, with your {score} to beat. Nothing is stored anywhere.',
})

export const result = namespace('result', {
  challengeHeading: '{seconds}-second challenge',
  reportHeading: 'Session report',
  announcement: 'Session over. Accuracy {accuracy}%, {correct} of {total} right. Score {score}.',
  announcementChallenge:
    'Session over. Accuracy {accuracy}%, {correct} of {total} decoded. Score {score}.',
  accuracy: 'Accuracy',
  percent: '{value}%',
  ofRight: '{correct} of {total} right',
  ofDecoded: '{correct} of {total} decoded',
  stripNote: 'Each lamp is one answer, in order. A ring is a miss.',
  nextOnWire: 'Next on the wire',
  notThereYet: 'Not there yet, and that is normal.',
  drillMissed: 'Drill the characters you missed, then run it again.',
  scoreRule:
    'Score is {perCorrect} points for each character you got, a little more for longer codes, times your accuracy squared, times a speed factor between {floor} and {ceiling}. Guessing scores next to nothing.',
  pathLine: 'Stage {stage} of the lesson teaches {characters}, one at a time: {steps}.',
  startLesson: 'Start lesson 1',
  stage: 'Stage {stage}',
  dailyWire: "Today's daily wire",
  score: 'Score',
  charsPerMinute: 'Chars / min',
  time: 'Time',
  streak: 'Streak',
  streakDays: { one: '{count} day', other: '{count} days' },
  secondsShort: '{seconds}s',
  minutesShort: '{minutes}m {seconds}s',
  earnedThisSession: 'Earned this session',
  xpBanked: 'XP banked',
  unlocked: 'Unlocked',
  unlockedNote: 'You cleared the bar, so the next step in your order joins the pool.',
  newStamp: 'New',
  received: 'Received',
  practiseThese: 'Practise these',
  missedTimes: { one: ', {code}, missed {count} time', other: ', {code}, missed {count} times' },
  drillThis: 'Drill this character',
  drillThese: 'Drill these {count}',
  nothingAnswered:
    'Nothing answered, so nothing was saved. If no prompt reached you, check the <signal>Signal setting</signal>.',
  savedLocally:
    'Saved to this browser only; nothing was sent anywhere. Built by <author>{name}</author>.',
  inviteBlurb:
    'The link opens a fresh {seconds}-second test for whoever you send it to. Nothing is stored anywhere.',
})

export const challenge = namespace('challenge', {
  theirRun: 'Their run, your turn',
  test: '{seconds}-second test',
  watchType: 'Watch · type what you see',
  listenType: 'Listen · type what you hear',
  seconds: 'seconds',
  flashIntro:
    'One character flashes at a time. Type the letter you saw; the next one follows a moment later.',
  playIntro:
    'One character plays at a time. Type the letter you heard; the next one follows a moment later.',
  describeTime: '{seconds} seconds',
  describeWpm: '{wpm} WPM',
  describeLetters: '{count} letters',
  describeCharacters: '{count} characters',
  startButton: 'Start the {seconds} seconds',
  lettersHeading: 'The letters in this run',
  letterCount: '{count} letters',
  changeInSettings: 'Change it in settings',
  newToMorseBeep:
    'New to Morse code? {short} is one short beep and {long} is one long one. <learn>Learn your first letters</learn> before the clock starts.',
  newToMorseFlash:
    'New to Morse code? {short} is one short flash and {long} is one long one. <learn>Learn your first letters</learn> before the clock starts.',
  incomingWire: 'Incoming wire',
  incomingRun: 'Incoming wire · run {run}',
  theirScore: 'Their score: <score>{score}</score>',
  someoneSent: 'Someone sent you this run',
  claimed: 'Claimed by the link. Nothing checks it; it is whatever the URL says.',
  beat: 'Beat {score}',
  sameRun: 'Same run',
  sameSequence: 'You get the same characters, in the same order, at the same speed.',
  olderLink:
    'This is an older link without a fixed sequence: the speed and length match, but your characters will be your own draw.',
  versusLabel: 'You {you}, them {them}',
  you: 'You',
  them: 'Them',
  versusSame:
    'Their score is the one the link claims; nothing checks it. The characters, their order and the speed were the same for you both.',
  versusOlder:
    'Their score is the one the link claims; nothing checks it. That link is older than fixed sequences, so the characters you heard were not the same as theirs.',
})

export const share = namespace('share', {
  sendIt: 'Send it',
  hide: 'Hide the share options',
  challengeFriend: 'Challenge a friend',
  copyLink: 'Copy link',
  linkLabel: 'Challenge link',
  linkCopied: 'Link copied.',
  messageCopied: 'Message and link copied. Paste it anywhere.',
  copyBlocked: 'Copying was blocked. The link is selected: copy it from the box.',
  imageCard: 'Image card',
  imageCardHint: 'For posting a picture',
  imageFailed: 'The image could not be made in this browser.',
  imageSaved: 'Saved {file}',
  imageNotReady: 'The image is still being made. Try again in a moment.',
  imageRefused: 'Sharing the image was refused here. Save it instead, or use the link above.',
  shareImage: 'Share image',
  saveImage: 'Save image',
})
