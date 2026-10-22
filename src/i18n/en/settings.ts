/**
 * Settings: the station's control panel, its controls and its backup copy.
 */

import { namespace } from '../define'

export const settings = namespace('settings', {
  eyebrow: 'Applies instantly · Stored in this browser only',
  sections: 'Settings sections',
  // Sections: the panel title, and the shorter word on the rail
  signalTitle: 'Signal',
  signalRail: 'Signal',
  timingTitle: 'Timing',
  timingRail: 'Timing',
  keyTitle: 'Key',
  keyRail: 'Key',
  courseTitle: 'Teaching order',
  courseRail: 'Teaching',
  displayTitle: 'Display & motion',
  displayRail: 'Display',
  dataTitle: 'Data',
  dataRail: 'Data',
  // Signal
  stateSound: 'Sound on',
  stateLamp: 'Silent, by lamp',
  stateBoth: 'Sound and lamp',
  noTone: 'Signal is set to Lamp, so no tone is played. Choose Sound or Both to change it.',
  signalIntro: 'How every Morse signal on the site reaches you: as a tone, as a light, or both.',
  signal: 'Signal',
  signalHint:
    'Sound plays the tone. Lamp flashes a light with the same timing and stays silent. Both does both. Listening practice works in every mode.',
  tone: 'Tone',
  toneHint:
    'The pitch of the sidetone, in hertz. Pick whatever sits most clearly against your own hearing. Now {hz} Hz.',
  toneFrequency: 'Tone frequency',
  hertz: '{hz} hertz',
  volume: 'Volume',
  percent: '{value}%',
  testSignal: 'Test signal',
  testFlash:
    "Flashes {signal}, the operator's traditional test signal, on the lamp in the button, at your speed.",
  testBoth:
    "Sends {signal}, the operator's traditional test signal, as a tone and on the lamp in the button, at your tone, volume and speed.",
  testSound:
    "Sends {signal}, the operator's traditional test signal, at your tone, volume and speed.",
  stop: 'Stop',
  sendSignal: 'Send {signal}',
  iphone:
    '<b>On an iPhone,</b> the ring/silent switch on the side also mutes sound from web pages. If the test signal is silent, check that switch first.',
  // Timing
  timingIntro:
    'How fast Morse is played to you. Character speed shapes each letter; effective speed sets the space around it.',
  preset: 'Preset',
  speedPreset: 'Speed preset',
  speedBeginner: 'Beginner',
  speedNormal: 'Normal',
  speedAdvanced: 'Advanced',
  speedExpert: 'Expert',
  presetLabel: '{name}, {wpm} words per minute',
  characterSpeed: 'Character speed',
  characterSpeedHint:
    'How fast the dots and dashes themselves are sent. Keep this high, even as a beginner.',
  characterSpeedLabel: 'Character speed in words per minute',
  wpm: '{wpm} WPM',
  effectiveSpeed: 'Effective speed',
  effectiveSpeedHint:
    'Farnsworth spacing. Below the character speed, it stretches the gaps between letters, which is what stops you learning to count beeps.',
  effectiveSpeedLabel: 'Effective speed in words per minute',
  off: 'Off',
  referenceNote: '{word} is the standard word that words-per-minute is measured with.',
  playWord: 'Play {word}',
  // The PARIS strip
  stripHeading: '{word} at {wpm} WPM',
  stripHeadingFarnsworth: '{word} at {wpm} / {farnsworth} WPM',
  perWord: '{seconds} s per word',
  stripLabel: '{word} drawn to scale: each bar is a tone, each space is silence.',
  dot: 'Dot',
  letterGap: 'Letter gap',
  wordGap: 'Word gap',
  ms: '{ms} ms',
  // Key
  keyIntro: 'How your keying is read on the telegraph, in lessons and in practice.',
  keyType: 'Key type',
  straightHint: 'A straight key: you time every dot and dash yourself. The way the course teaches.',
  paddlesHintA:
    'Paddles: hold one for a run of dits or dahs, timed exactly at {wpm} WPM; hold both to alternate. Mode A stops with the element it is sending when you let go of a squeeze.',
  paddlesHintB:
    'Paddles: hold one for a run of dits or dahs, timed exactly at {wpm} WPM; hold both to alternate. Mode B adds one more, the opposite element when you let go of a squeeze.',
  swapPaddles: 'Swap paddles',
  swapHint:
    'For a left hand: dahs on the left paddle and the {dit} key, dits on the right paddle and the {dah} key.',
  dotOrDash: 'Dot or dash',
  thresholdHint:
    'On the straight key, hold longer than this and it sends a dash. For reference, at {wpm} WPM a dot lasts {dot} ms and a dash {dash} ms.',
  thresholdLabel: 'Dot or dash threshold in milliseconds',
  patience: 'Time to finish a character',
  patienceCustom:
    'Your current timing was set by hand or by an import. Pick one to return to a preset.',
  patienceHint:
    'How long you may pause mid-character before it counts as finished. This is thinking time, not speed.',
  patienceAuto: 'Finishes a character after {characterGap} s of quiet, a word after {wordGap} s.',
  patienceManual: 'Never finishes on its own: you press {key} to finish each character.',
  keys: 'Keys',
  keysHint: 'Select a key, then press the one you want. Escape keeps the old one.',
  actionKey: 'Morse key',
  actionAlternative: 'Second key',
  actionSubmit: 'Finish character',
  actionCancel: 'Cancel',
  actionDit: 'Dit paddle',
  actionDah: 'Dah paddle',
  conflicts: '{actions} share a key, so only one of them will work.',
  restoreKeys: 'Restore default keys',
  adapterPreset: 'Use Left/Right Ctrl (USB paddle adapters)',
  adapterHint:
    'For adapters that type Left Ctrl for one paddle and Right Ctrl for the other, such as the VBand one. Ctrl shortcuts still work, but Ctrl no longer finishes a character while paddles are on, so give Finish character a key of its own.',
  // Teaching order
  courseIntro:
    'Which order new characters arrive in. The practice screen has the same choice; this is the place to set it once.',
  order: 'Order',
  yourSet: 'Your set now',
  setNoUnlock: '{characters}. This order does not unlock on score.',
  setUnlock:
    '{characters}. More arrive when a practice session long enough to count scores {percent}% or better.',
  characterCount: { one: '{count} character', other: '{count} characters' },
  currentSet: 'Current set: {characters}',
  // Display & motion
  theme: 'Theme',
  themeHint:
    'Dark is the station at night; light is the telegram form. The same switch sits in the header.',
  animation: 'Animation',
  animationHint:
    'Following the system is usually right. The overrides exist because the system setting is all or nothing.',
  motionReducedSystem: 'Motion is reduced, as your system asks.',
  motionReduced: 'Motion is reduced.',
  motionOnSystem: 'Motion is on, as your system allows.',
  motionOn: 'Motion is on.',
  motionSystem: 'System',
  motionFull: 'Full',
  motionReduce: 'Reduced',
  // Data
  dataIntro:
    'Everything lives in this browser and nowhere else. Clearing your browser data erases it, so keep a backup if it matters to you.',
  inBrowser: 'In this browser',
  sectionProgress: 'learning progress',
  sectionSettings: 'settings',
  sectionStats: 'stats',
  sectionDaily: 'daily results',
  sectionProgressHint: 'Every character you have met, its accuracy and when it is due',
  sectionSettingsHint: 'Signal, tone, speed, keys, motion and usage counts',
  sectionStatsHint: 'XP, level, streak, sessions and achievements',
  sectionDailyHint: 'Your daily challenge results and their streak',
  nothingYet: 'Nothing yet',
  changed: 'Changed',
  defaults: 'Defaults',
  levelXp: 'Level {level} · {xp} XP',
  results: { one: '{count} result', other: '{count} results' },
  restored: 'Restored',
  rejected: 'Rejected',
  notSaved: 'Not saved',
  notInFile: 'Not in file',
  exportBackup: 'Export backup',
  importBackup: 'Import backup',
  exported: 'Saved {file}, with your {sections}.',
  unreadable: 'That file could not be opened, so nothing was changed.',
  erased:
    'Erased. This browser holds no progress now, and every setting is back to its default except anonymous usage counts, which stay {state}, as you had them. Your Google Analytics choice is kept too.',
  on: 'on',
  offWord: 'off',
  counters: 'Anonymous usage counts',
  countersHint:
    'A tally of which screens get used: no identifier, no progress, nothing you typed. Never sent if your browser asks not to be tracked.',
  // Google Analytics (TASK-039). One honest sentence, then where the choice stands.
  ga: 'Google Analytics',
  gaHint:
    'Counts visits and which pages are used, with a cookie, and only while allowed here. Ad features stay off either way.',
  gaAllowed: 'Allowed',
  gaNotAllowed: 'Not allowed',
  gaUndecided: 'Not chosen yet, so it is off.',
  gaBrowserSignal:
    'Off, because your browser asks sites not to track you. Allow it here only if you want to.',
  gaNowAllowed: 'Google Analytics allowed. You can switch it off here at any time.',
  gaNowOff: 'Google Analytics is off, and its cookies are deleted from this browser.',
  install: 'Install',
  installed: 'Installed. MorseForge now opens from your apps, and works offline.',
  notInstalled: 'Not installed. The button stays here if you change your mind.',
  noOffer: 'This browser is not offering installation right now.',
  standalone: 'You are using the installed app. It works offline.',
  installHint: 'Add MorseForge to your apps. It opens in its own window and works offline.',
  appleHint: 'On iPhone and iPad: Share → Add to Home Screen.',
  installButton: 'Install MorseForge',
  erase: 'Erase everything',
  eraseHint:
    'Removes progress, stats, daily results and settings from this browser. You will be asked first.',
  restoreTitle: 'Restore from this backup?',
  cancel: 'Cancel',
  restore: 'Restore',
  restoreBody: 'This file holds your {sections}.',
  restoreBodyDated: 'This file, exported {date}, holds your {sections}.',
  restoreNote:
    'Restoring replaces those in this browser. A section that fails validation is skipped, and what you have now is kept for it.',
  eraseTitle: 'Erase everything in this browser?',
  exportFirst: 'Export a backup first',
  eraseKeeps:
    'Your theme stays, and so do your choices about anonymous usage counts (now {state}) and Google Analytics.',
  saved: 'Saved {file}',
  // Import and reset summaries
  notBackup: 'Nothing restored. This file is not a MorseForge backup, so nothing was changed.',
  couldNotSave: 'Could not save {sections} in this browser, so what was here is unchanged.',
  nothingRestored: 'Nothing restored.',
  failedValidationKept:
    'The {sections} in this file did not pass validation, so nothing in this browser was changed.',
  failedValidation: 'The {sections} in this file did not pass validation.',
  restoredSections: 'Restored {sections}.',
  rejectedSections:
    'Rejected {sections}: incomplete or from a newer version, so the copy in this browser was kept.',
  historyFor: { one: 'history for {count} character', other: 'history for {count} characters' },
  levelAndXp: 'level {level} and {xp} XP',
  streakDays: 'a {days}-day streak',
  dailyResults: { one: '{count} daily result', other: '{count} daily results' },
  resetSettings: 'every setting except the anonymous usage counts goes back to its default',
  resetNothing: 'There is no progress stored yet, so only the settings change: {settings}.',
  resetErases:
    'This erases {parts}, and {settings}. There is no other copy, so it cannot be undone.',
  // Controls
  keySpace: 'Space',
  keyCtrl: 'Ctrl',
  keyCtrlLeft: 'Left Ctrl',
  keyCtrlRight: 'Right Ctrl',
  keyEsc: 'Esc',
  tabRefused: 'Tab moves between controls, so it cannot be a Morse key. Pick another key.',
  keyRefused:
    '{key} belongs to the browser and other shortcuts, so it cannot be bound. Pick another key.',
  keyTaken: '{key} is already bound to {action}. Only one of them will work until you change one.',
  captureListening: '{label}. Press the new key, or Escape to keep {key}.',
  captureIdle: '{label}: {key}. Activate, then press a key to rebind.',
  pressKey: 'Press a key',
  cannotUndo: 'Cannot be undone',
  confirm: 'Confirm',
})
