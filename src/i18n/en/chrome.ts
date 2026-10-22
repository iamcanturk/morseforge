/**
 * The site's frame: layout, header, footer, navigation, theme, FAQ heading,
 * breadcrumbs, the language switcher and the shared formatters.
 */

import { namespace } from '../define'

export const layout = namespace('layout', {
  skipToContent: 'Skip to content',
  browserRequirements: 'Requires JavaScript and Web Audio support',
  featureTree: 'Interactive Morse code tree',
  featureAudio: 'Real CW audio with adjustable WPM and Farnsworth spacing',
  featureKey: 'Keyboard straight key or iambic paddles (modes A and B), decoded live',
  featureRepetition: 'Spaced repetition practice',
  featureOffline: 'Works offline, no account required',
})

export const header = namespace('header', {
  home: '{site} home',
  mainNav: 'Main',
  allTools: 'All tools',
  menu: 'Menu',
  settings: 'Settings',
  source: 'Star on GitHub',
  /** The GitHub button's name and tooltip: "Star MorseForge on GitHub". */
  github: 'Star {site} on GitHub',
  chipContinue: 'Continue',
  chipProgress: 'Progress',
  /** The streak as the chip shows it: "5d". */
  chipDays: '{days}d',
  chipStreak: '{days}-day streak',
  chipPractisedToday: ', practised today',
})

export const nav = namespace('nav', {
  learn: 'Learn',
  practice: 'Practice',
  telegraph: 'Telegraph',
  daily: 'Daily',
  send: 'Send',
  progress: 'Progress',
  groupLearn: 'Learn',
  groupPractise: 'Practise',
  groupLookup: 'Look up',
})

export const footer = namespace('footer', {
  home: '{site} home',
  builtBy: 'Built by <author>{name}</author> — your progress stays on your device.',
  /** The operator's sign-off, "73", then what it means. */
  signOff: '{code} — best regards',
  allPages: 'All pages',
  projectLinks: 'Project and author links',
  settings: 'Settings',
  privacy: 'Privacy',
  source: 'Star on GitHub',
  /** Above the row of the author's profiles. */
  follow: 'Follow {name}',
  /** A profile link's name: "Can Türk on Instagram". */
  profile: '{name} on {network}',
  /** The author's own site, as a link name. */
  site: '{name}: {host}',
  promises: 'No account · No ads · Works offline',
})

export const theme = namespace('theme', {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
  /** What `system` resolves to, in the button's name: "…, dark now". */
  resolvedDark: 'dark',
  resolvedLight: 'light',
  colourTheme: 'Colour theme',
  buttonName: 'Colour theme: {choice}',
  buttonNameSystem: 'Colour theme: {choice}, {resolved} now',
  followSystem: 'Follow system theme',
  darkTheme: 'Dark theme',
  lightTheme: 'Light theme',
})

export const faq = namespace('faq', {
  heading: 'Common questions',
})

export const crumbs = namespace('crumbs', {
  label: 'Breadcrumb',
})

export const switcher = namespace('switcher', {
  label: 'Language',
})

export const format = namespace('format', {
  /**
   * Number words from zero to twenty, separated by `|`. Prose says "seven
   * days" rather than "7 days" for small counts. A language that prefers
   * digits can mark this untranslated and digits are used instead.
   */
  numberWords:
    'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty',
  dots: { one: '{word} dot', other: '{word} dots' },
  dashes: { one: '{word} dash', other: '{word} dashes' },
  and: 'and',
  or: 'or',
  /** A code read aloud for a screen reader: "dot dash", "break" between words. */
  dotWord: 'dot',
  dashWord: 'dash',
  breakWord: 'break',
})
