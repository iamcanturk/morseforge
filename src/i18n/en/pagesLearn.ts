/**
 * The prose around the lessons: /learn/.
 */

import { namespace } from '../define'

export const learnPage = namespace('learnPage', {
  howHeading: 'How the lessons work',
  seeIt:
    "<b>See it.</b> Every character starts on the screen with its dots and dashes, and with where it sits on the <tree>Morse code tree</tree>: a dot branches one way, a dash the other, so the code stops looking arbitrary. Read it once. Learning a picture of the code is the habit that caps most learners' speed, which is <chart>why you can't learn Morse code from a chart</chart>.",
  hearIt:
    '<b>Hear it.</b> Then it plays as a real tone at your own speed, with a lamp that flashes in time, so the step still works with the sound off. This is the version you will actually be reading, so listen for the rhythm rather than counting the beeps.',
  sendIt:
    '<b>Send it.</b> Last, you key it yourself: hold Space, or press and hold the on-screen key on a phone. The moment your code matches, the lesson accepts it, and a wrong code tells you what you sent. With no keyboard or no sound you can skip sending; the drill still checks every character by ear.',
  coversHeading: 'What the course covers',
  coversBody:
    'There are {stages} stages, one for each day of the plan, and together they teach all {letters} letters and {digits} digits ({characters} characters). The first teaches {first}: {codes}.',
  /** "E is ·" in the list of the first stage's codes. */
  firstCode: '{character} is {code}',
  /** "Stage 3: three elements, dot-first (S, U, R and W)". */
  stageLine: 'Stage {stage}: {title} ({characters})',
  drillBody:
    'After each stage comes a short listening drill, at least {minDrill} prompts, over everything taught so far. Finishing a stage also adds its characters to practice under the default {method} method, and every send you get right earns XP and counts toward your streak. Your progress stays in this browser, and the lesson picks up at the first stage you have not finished.',
  planHeading: 'Prefer to read the whole plan?',
  planBody:
    'The plan lays out every day: which characters, why they come in that order, what to practise, and the words you can send by the end of it. It is the same order as these lessons, about {planTime} in total.',
})
