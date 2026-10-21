/**
 * Progress: the stats screen and the achievements.
 */

import { namespace } from '../define'

/** Titles and lines of the achievements (`src/game/achievements.ts`), by id. */
export const achievements = namespace('achievements', {
  firstSignalTitle: 'First Signal',
  firstSignalDescription: 'Sent your first Morse element.',
  firstRingTitle: 'First Ring',
  firstRingDescription: 'Completed the first lesson stage: {characters}.',
  circuitStartedTitle: 'Circuit Started',
  circuitStartedDescription: 'Met your first {number} characters.',
  lightbulbTitle: 'Lightbulb',
  lightbulbDescription: 'Mastered a character — all three skills, not just the easy one.',
  radioOperatorTitle: 'Radio Operator',
  radioOperatorDescription: 'Answered {cpm} characters a minute correctly in a session.',
  speedDemonTitle: 'Speed Demon',
  speedDemonDescription: 'Answered {cpm} characters a minute correctly in a session.',
  weekOneTitle: 'Week One',
  weekOneDescription: 'Practised {number} days running.',
  cqTitle: 'CQ CQ CQ',
  cqDescription: 'Sent a real message rather than a drill.',
  halfWayTitle: 'Half The Network',
  halfWayDescription: 'Mastered {number} characters.',
  signalMasterTitle: 'Signal Master',
  signalMasterDescription: 'Mastered all {number} letters.',
})

/** The one next step (`src/game/nextAction.ts`), by rule. */
export const nextAction = namespace('nextAction', {
  startLesson: 'Start lesson 1',
  startLessonReason:
    'Lesson 1 teaches {characters}, the {number} shortest characters in the code. Send one back and the first pad of your tree lights up.',
  firstSignal: 'Send your first signal',
  firstSignalReason:
    'You have learned characters by eye and by ear but never keyed one. Tap out any letter on the telegraph key; it takes a few seconds.',
  finishStage: 'Finish stage 1',
  continueStage: 'Continue to stage {stage}',
  stageReason: 'Stage {stage} of {stages} teaches {newCharacters}: {characters}. {progress}',
  newCharacters: { one: '{count} new character', other: '{count} new characters' },
  pickUp: 'It picks up where you left off.',
  stagesDone: { one: '{count} stage done so far.', other: '{count} stages done so far.' },
  daily: "Take today's daily",
  dailyReason: '{lines}, the same for everyone today, and one attempt. {streak}',
  dailyLines: { one: '{count} line', other: '{count} lines' },
  dailyKeeps: 'It keeps your {days}-day daily streak going.',
  dailyStart: 'Take it again tomorrow and you have a streak.',
  practiseRecognition: 'Practise reading',
  practiseListening: 'Practise listening',
  practiseSending: 'Practise sending',
  nounRecognition: 'reading',
  nounListening: 'listening',
  nounSending: 'sending',
  weakestReason:
    'Your {skill} accuracy is {percent}%, the lowest of your three skills. A character counts as mastered with {rule}.',
  rule: 'at least {attempts} tries in each of the three skills and an average of {percent}% across them',
  challenge: 'Take the {seconds}-second challenge',
  challengeReason:
    "Today's daily is done. See how many characters you can copy in {seconds} seconds, then send the link to someone.",
})

export const stats = namespace('stats', {
  levelAndStreaks: 'Level and streaks',
  level: 'Level',
  xpTotal: '{xp} XP total',
  levelProgress: 'Level {level} progress',
  levelValue: '{into} of {span} XP',
  xpToNext: '{into} / {span} XP to level {next}',
  practiceStreak: 'Practice streak',
  todayCounts: 'Today counts.',
  practiseToCount: 'Practise anything to count today.',
  best: 'Best {days}.',
  dailyStreak: 'Daily streak',
  dailyDone: "Today's daily is done.",
  dailyWaiting: "Today's daily is waiting.",
  streakRules:
    'Two streaks, two rules. The practice streak counts every day you practise anything here, by your own clock, and forgives {grace}. The daily streak counts days in a row you took the daily challenge, which changes at midnight UTC.',
  missedDays: { one: '{count} missed day', other: '{count} missed days' },
  skills: 'Skills',
  seeTree: 'See the tree →',
  skillsBody:
    'Reading a code, hearing it and keying it are separate skills that improve at different speeds. A letter is mastered once it has {rule}.',
  furthestBehind: 'Furthest behind',
  percent: '{value}%',
  notTried: 'Not tried yet',
  /** `count` picks the form; `n` is the same number, grouped for display. */
  answers: { one: '{n} answer', other: '{n} answers' },
  mastered: 'Mastered',
  network: 'Network',
  accuracy: 'Accuracy',
  bestSpeed: 'Best speed',
  perMinute: 'correct characters a minute',
  records: 'Records',
  sessions: 'Sessions',
  practised: 'Practised',
  minutes: '{minutes} min',
  notPlayed: 'Not played yet',
  personalBest: 'Personal best',
  storedHere:
    'All of this is stored in this browser and nowhere else. Export a copy from <settings>settings</settings> if you want to keep it or move it to another device.',
  days: { one: 'day', other: 'days' },
  nextOnWire: 'Next on the wire',
  receiverIdle: 'Receiver idle',
  noSignal: 'No signal yet',
  fillsIn: 'Your level, streaks, skills and records fill in here as you go.',
  firstBadges: 'First badges to earn',
  achievements: 'Achievements',
  earnedOf: '{earned} of {total} earned',
  earned: 'Earned',
  next: 'Next',
  earnedSr: 'Earned.',
  lockedSr: 'Locked, {percent} percent of the way.',
  loading: 'Loading your progress',
})
