import { describe, expect, it } from 'vitest'
import {
  HERO_TARGETS,
  advance,
  codeOf,
  commitSignal,
  HERO_IN_VIEW_THRESHOLD,
  describeCode,
  doneHeadline,
  doneStop,
  hasSentBefore,
  initialHero,
  instructionFor,
  keysFromPage,
  nextStop,
  shouldCommit,
  targetOf,
  wrongMessage,
  type HeroState,
} from './hero'
import { LEARNING_STAGES, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { FACTS } from '../../config/facts'
import {
  HEAR_FIRST_HASH,
  LESSON_ORDER,
  LESSON_STAGES,
  currentStageIndex,
  entryPosition,
} from '../Lesson/lesson'
import { IN_VIEW_THRESHOLD } from '../MorseKey/useInView'
import { answer, emptyProgress, type ProgressRecord } from '../../storage/progress'
import { defaultStats } from '../../storage/stats'

const NOW = Date.UTC(2026, 9, 21, 12)

/** Send each target in turn, correctly, through the machine. */
function sendAll(targets: readonly string[]): HeroState {
  let state = initialHero()
  for (const target of targets) {
    state = advance(commitSignal(state, codeOf(target), targets), targets)
  }
  return state
}

describe('HERO_TARGETS', () => {
  it('is E, T, then A: the plan’s first day, then the letter they spell together', () => {
    expect(HERO_TARGETS).toEqual(['E', 'T', 'A'])
    expect(HERO_TARGETS.slice(0, 2)).toEqual([...FACTS.planFirstDayCharacters])
    expect(HERO_TARGETS.slice(0, 2)).toEqual([...LEARNING_STAGES[0]!])
    expect(codeOf('A')).toBe(MORSE_ALPHABET.E! + MORSE_ALPHABET.T!)
  })

  it('opens with a single element, so the very first press can succeed', () => {
    expect(codeOf(HERO_TARGETS[0]!)).toHaveLength(1)
  })
})

describe('shouldCommit (the instant-commit rule)', () => {
  it('commits the moment the pending code equals the target', () => {
    for (const target of HERO_TARGETS) expect(shouldCommit(codeOf(target), target)).toBe(true)
  })

  it('commits a code that can no longer become the target', () => {
    expect(shouldCommit(MORSE_ALPHABET.T!, 'E')).toBe(true)
    expect(shouldCommit(MORSE_ALPHABET.E!, 'T')).toBe(true)
    // A starts with a dot; a dash first is already wrong.
    expect(shouldCommit(MORSE_ALPHABET.T!, 'A')).toBe(true)
    // Overshooting the target is wrong too.
    expect(shouldCommit(MORSE_ALPHABET.I!, 'E')).toBe(true)
  })

  it('waits while the pending code is still on the way to the target', () => {
    expect(shouldCommit(MORSE_ALPHABET.E!, 'A')).toBe(false)
  })

  it('never commits without a target or without anything keyed', () => {
    expect(shouldCommit(MORSE_ALPHABET.E!, null)).toBe(false)
    expect(shouldCommit('', 'E')).toBe(false)
    expect(shouldCommit(MORSE_ALPHABET.E!, '#')).toBe(false)
  })
})

describe('the step machine', () => {
  it('starts on the first target, waiting', () => {
    const state = initialHero()
    expect(state).toEqual({ step: 0, phase: 'await', sent: '', attempt: null })
    expect(targetOf(state)).toBe('E')
  })

  it('detects a right signal, then moves to the next step', () => {
    const detected = commitSignal(initialHero(), codeOf('E'))
    expect(detected.phase).toBe('detected')
    expect(detected.sent).toBe('E')
    expect(detected.attempt).toEqual({ code: codeOf('E'), character: 'E' })

    const next = advance(detected)
    expect(next.phase).toBe('await')
    expect(targetOf(next)).toBe('T')
  })

  it('names a wrong signal and stays on the same step, with nothing taken away', () => {
    const wrong = commitSignal(initialHero(), codeOf('T'))
    expect(wrong.phase).toBe('wrong')
    expect(wrong.step).toBe(0)
    expect(wrong.sent).toBe('')
    expect(wrong.attempt).toEqual({ code: codeOf('T'), character: 'T' })

    const again = advance(wrong)
    expect(again.phase).toBe('await')
    expect(targetOf(again)).toBe('E')
  })

  it('records a code that is not a character as such', () => {
    const wrong = commitSignal(initialHero(), '.-.-.-.-')
    expect(wrong.attempt?.character).toBeNull()
  })

  it('finishes after the last target and stops asking', () => {
    const done = sendAll(HERO_TARGETS)
    expect(done.phase).toBe('done')
    expect(done.sent).toBe(HERO_TARGETS.join(''))
    expect(targetOf(done)).toBeNull()
    // Signals after the drill are free sending, not answers.
    expect(commitSignal(done, codeOf('E'))).toBe(done)
    expect(advance(done)).toBe(done)
  })

  it('ignores an empty commit', () => {
    const state = initialHero()
    expect(commitSignal(state, '')).toBe(state)
  })

  it('works for any target list, not only the default', () => {
    const targets = ['S', 'O']
    const done = sendAll(targets)
    expect(done.sent).toBe('SO')
    expect(done.phase).toBe('done')
  })
})

describe('copy', () => {
  it('describes codes in words a first-timer can act on', () => {
    expect(describeCode(codeOf('E'))).toBe('one short tap')
    expect(describeCode(codeOf('T'))).toBe('one long press')
    expect(describeCode(codeOf('A'))).toBe('a short tap, then a long press')
    expect(describeCode('')).toBe('')
  })

  it('gives each step an instruction from its own code', () => {
    expect(instructionFor('E')).toBe('Tap the key once')
    expect(instructionFor('T')).toBe('Hold the key down')
    expect(instructionFor('A')).toBe('tap, then hold')
  })

  it('says what a miss was, and how the target goes', () => {
    expect(wrongMessage({ code: codeOf('T'), character: 'T' }, 'E')).toBe(
      'That was T. E is one short tap.',
    )
    expect(wrongMessage({ code: codeOf('E'), character: 'E' }, 'A')).toBe(
      'That was E. A is a short tap, then a long press.',
    )
    expect(wrongMessage({ code: '.-.-.-.-', character: null }, 'T')).toBe(
      'That was not a letter yet. T is one long press.',
    )
  })

  it('counts the letters sent in words', () => {
    expect(doneHeadline(HERO_TARGETS.join(''))).toBe('Three letters sent')
    expect(doneHeadline('E')).toBe('One letter sent')
  })
})

describe('returning visitors', () => {
  it('counts anyone who has keyed before, here or elsewhere', () => {
    expect(hasSentBefore(defaultStats())).toBe(false)
    expect(hasSentBefore({ ...defaultStats(), firstSignalAt: NOW })).toBe(true)
    expect(hasSentBefore({ ...defaultStats(), elementsSent: 4 })).toBe(true)
  })

  it('sends a new learner to the first lesson stage', () => {
    expect(nextStop(emptyProgress(), NOW)).toMatchObject({
      href: '/learn/',
      label: 'Start the lesson',
      detail: `Stage 1 of ${LESSON_STAGES.length}: E and T.`,
    })
  })

  it('picks up at the stage after the hero’s drill, as /learn/ will', () => {
    let progress: ProgressRecord = emptyProgress()
    for (const character of HERO_TARGETS) {
      progress = answer(progress, character, 'sending', true, NOW)
    }
    const stop = nextStop(progress, NOW)
    expect(stop.href).toBe('/learn/')
    expect(stop.label).toBe('Continue the lesson')
    expect(stop.detail).toBe(`Stage 2 of ${LESSON_STAGES.length}: I, A, N and M.`)
  })

  /** Progress with every character of the first `stages` lesson stages answered. */
  function throughStage(stages: number): ProgressRecord {
    let progress: ProgressRecord = emptyProgress()
    for (const character of LESSON_STAGES.slice(0, stages).flat()) {
      progress = answer(progress, character, 'sending', true, NOW)
    }
    return progress
  }

  it('names the same stage, out of the same total, as the lesson does', () => {
    for (const done of [0, 2, 4, 6]) {
      const progress = throughStage(done)
      expect(currentStageIndex(progress, NOW)).toBe(done)
      const stop = nextStop(progress, NOW)
      expect(stop.href).toBe('/learn/')
      expect(stop.detail).toMatch(new RegExp(`^Stage ${done + 1} of ${LESSON_STAGES.length}: `))
    }
  })

  it('after four stages, offers stage 5 rather than calling the course done', () => {
    const stop = nextStop(throughStage(4), NOW)
    expect(stop.href).toBe('/learn/')
    expect(stop.detail).toBe(`Stage 5 of ${LESSON_STAGES.length}: H, V, F, L, P and J.`)
  })

  it('keeps someone with every letter but no digits on the lesson', () => {
    let progress: ProgressRecord = emptyProgress()
    for (const character of LEARNING_STAGES.flat()) {
      progress = answer(progress, character, 'sending', true, NOW)
    }
    const stop = nextStop(progress, NOW)
    expect(stop.href).toBe('/learn/')
    expect(stop.detail).toBe(
      `Stage ${LESSON_STAGES.length} of ${LESSON_STAGES.length}: ${LESSON_STAGES.at(-1)!
        .join(', ')
        .replace(/, ([^,]*)$/, ' and $1')}.`,
    )
  })

  it('sends someone who has finished every stage to practice', () => {
    const progress = throughStage(LESSON_STAGES.length)
    expect(nextStop(progress, NOW)).toMatchObject({ href: '/practice/' })
    expect(LESSON_ORDER.length).toBe(FACTS.letterCount + FACTS.digitCount)
    expect(nextStop(progress, NOW).detail).toContain(`all ${LESSON_ORDER.length} characters`)
  })
})

describe('the finished drill (DEC-044)', () => {
  /** What the hero leaves behind once E, T and A are sent. */
  function afterHero(): ProgressRecord {
    let progress: ProgressRecord = emptyProgress()
    for (const character of HERO_TARGETS) {
      progress = answer(progress, character, 'sending', true, NOW)
    }
    return progress
  }

  it('sends the visitor to hear stage 1, not on to stage 2', () => {
    const stop = doneStop(afterHero(), NOW)
    expect(stop).toEqual({
      href: `/learn/${HEAR_FIRST_HASH}`,
      label: 'Hear E and T',
      detail: `Stage 1 of ${LESSON_STAGES.length}, by ear.`,
    })
    // Never "Next: Stage 2 … A": the letter they just sent.
    expect(`${stop.label} ${stop.detail}`).not.toMatch(/Stage 2|\bA\b/)
  })

  it('lands where the lesson opens for that hash: stage 1, the first character, Hear it', () => {
    const progress = afterHero()
    const hash = doneStop(progress, NOW).href.replace('/learn/', '')
    expect(entryPosition(progress, NOW, hash)).toEqual({
      stage: 0,
      characterIndex: 0,
      step: 'hear',
    })
  })

  it('falls back to the next stop once stage 1 has been heard', () => {
    let progress = afterHero()
    for (const character of LESSON_STAGES[0]!) {
      progress = answer(progress, character, 'listening', true, NOW)
    }
    expect(doneStop(progress, NOW)).toEqual(nextStop(progress, NOW))
  })
})

describe('Space typed at the page (J-03)', () => {
  const space = {
    key: ' ',
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
  }
  const keys = [' ']
  const here = { focusOnPage: true, inView: true }

  it('keys the station when nothing has focus and the station is in view', () => {
    expect(keysFromPage(space, keys, here)).toBe(true)
  })

  it('leaves Space to scroll when the station is out of view', () => {
    expect(keysFromPage(space, keys, { ...here, inView: false })).toBe(false)
  })

  it('never takes a key from a focused control', () => {
    expect(keysFromPage(space, keys, { ...here, focusOnPage: false })).toBe(false)
  })

  it('ignores held modifiers, repeats, other keys and handled events', () => {
    expect(keysFromPage({ ...space, shiftKey: true }, keys, here)).toBe(false)
    expect(keysFromPage({ ...space, ctrlKey: true }, keys, here)).toBe(false)
    expect(keysFromPage({ ...space, metaKey: true }, keys, here)).toBe(false)
    expect(keysFromPage({ ...space, altKey: true }, keys, here)).toBe(false)
    expect(keysFromPage({ ...space, repeat: true }, keys, here)).toBe(false)
    expect(keysFromPage({ ...space, defaultPrevented: true }, keys, here)).toBe(false)
    expect(keysFromPage({ ...space, key: 'a' }, keys, here)).toBe(false)
  })

  it('uses the same in-view share as every other keyed screen', () => {
    expect(HERO_IN_VIEW_THRESHOLD).toBe(IN_VIEW_THRESHOLD)
  })
})
