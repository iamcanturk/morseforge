/**
 * Learner progress (PROJECT.md §5, §6, §21, §22).
 *
 * One record holding, per character, the mastery evidence and the review
 * schedule. Mastery *levels* are deliberately not stored — they are computed
 * from the attempt counts on read, so changing the thresholds re-grades
 * everyone instead of stranding them at a level the current rules would never
 * award.
 */

import { ALL_LETTERS } from '../data/morseAlphabet'
import {
  type Skill,
  type SkillStats,
  SKILLS,
  emptySkillStats,
  isMastered,
  masteryLevel,
  masteryScore,
  recordAttempt,
} from '../game/mastery'
import {
  type DueItem,
  type ReviewState,
  newReviewState,
  review,
  selectDue,
} from '../game/spacedRepetition'
import { Store, type StorageDriver, count, isRecord, num } from './store'

export const PROGRESS_KEY = 'morseforge_progress'
export const PROGRESS_VERSION = 1

export interface CharacterProgress {
  /** Introduced in a lesson, whether or not it has been answered yet. */
  seen: boolean
  skills: SkillStats
  schedule: ReviewState
  /** Epoch ms of the last answer, or null. */
  lastAnsweredAt: number | null
}

export interface ProgressRecord {
  characters: Record<string, CharacterProgress>
}

function emptyCharacterProgress(now: number): CharacterProgress {
  return {
    seen: false,
    skills: emptySkillStats(),
    schedule: newReviewState(now),
    lastAnsweredAt: null,
  }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

function validateSkills(value: unknown): SkillStats {
  const stats = emptySkillStats()
  if (!isRecord(value)) return stats

  for (const skill of SKILLS) {
    const raw = value[skill]
    if (!isRecord(raw)) continue
    const attempts = count(raw['attempts'])
    // Correct can never exceed attempts. A hand-edited export claiming 500
    // correct out of 3 would otherwise show 16,000% accuracy forever.
    stats[skill] = { attempts, correct: Math.min(count(raw['correct']), attempts) }
  }

  return stats
}

function validateSchedule(value: unknown, now: number): ReviewState {
  if (!isRecord(value)) return newReviewState(now)
  return {
    streak: count(value['streak']),
    intervalMs: num(value['intervalMs'], 0, 0),
    dueAt: num(value['dueAt'], now, 0),
    lapses: count(value['lapses']),
    ease: num(value['ease'], 2.5, 1.3, 2.8),
  }
}

function validateProgress(value: unknown): ProgressRecord | null {
  if (!isRecord(value)) return null
  const rawCharacters = value['characters']
  if (!isRecord(rawCharacters)) return { characters: {} }

  const now = Date.now()
  const characters: Record<string, CharacterProgress> = {}

  for (const [character, raw] of Object.entries(rawCharacters)) {
    if (!isRecord(raw)) continue
    characters[character.toUpperCase()] = {
      seen: raw['seen'] === true,
      skills: validateSkills(raw['skills']),
      schedule: validateSchedule(raw['schedule'], now),
      lastAnsweredAt: typeof raw['lastAnsweredAt'] === 'number' ? raw['lastAnsweredAt'] : null,
    }
  }

  return { characters }
}

export function createProgressStore(driver?: StorageDriver): Store<ProgressRecord> {
  return new Store<ProgressRecord>(
    {
      key: PROGRESS_KEY,
      version: PROGRESS_VERSION,
      validate: validateProgress,
      createDefault: () => ({ characters: {} }),
    },
    driver,
  )
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

/** Progress for a character, defaulted if it has never been touched. */
export function getCharacter(
  record: ProgressRecord,
  character: string,
  now: number,
): CharacterProgress {
  return record.characters[character.toUpperCase()] ?? emptyCharacterProgress(now)
}

/** Mark a character as introduced, without recording an attempt. */
export function markSeen(record: ProgressRecord, character: string, now: number): ProgressRecord {
  const key = character.toUpperCase()
  const current = getCharacter(record, key, now)
  if (current.seen) return record

  return {
    characters: { ...record.characters, [key]: { ...current, seen: true } },
  }
}

/**
 * Record an answer: updates the mastery evidence and advances the schedule.
 *
 * Both in one call on purpose — an attempt that updated accuracy but not the
 * schedule (or the reverse) would put the two out of step, and nothing in the
 * UI would reveal it.
 */
export function answer(
  record: ProgressRecord,
  character: string,
  skill: Skill,
  correct: boolean,
  now: number,
): ProgressRecord {
  const key = character.toUpperCase()
  const current = getCharacter(record, key, now)

  return {
    characters: {
      ...record.characters,
      [key]: {
        seen: true,
        skills: recordAttempt(current.skills, skill, correct),
        schedule: review(current.schedule, correct, now),
        lastAnsweredAt: now,
      },
    },
  }
}

export interface CharacterSummary {
  character: string
  level: ReturnType<typeof masteryLevel>
  score: number
  progress: CharacterProgress
}

export function summarize(
  record: ProgressRecord,
  character: string,
  now: number,
): CharacterSummary {
  const progress = getCharacter(record, character, now)
  return {
    character: character.toUpperCase(),
    level: masteryLevel(progress.skills, progress.seen),
    score: masteryScore(progress.skills),
    progress,
  }
}

/** Characters that have reached Mastered, in teaching order. */
export function masteredCharacters(
  record: ProgressRecord,
  characters: readonly string[] = ALL_LETTERS,
  now: number = Date.now(),
): string[] {
  return characters.filter((character) => {
    const progress = getCharacter(record, character, now)
    return isMastered(progress.skills, progress.seen)
  })
}

/**
 * Overall completion, 0..1 — the "⚡ 74% POWER" readout on the Signal Tree
 * (PROJECT.md §17, §20).
 *
 * Averages mastery across the whole alphabet rather than counting only mastered
 * characters, so the meter moves on every practice session. A counter that only
 * ticks at 26 discrete moments would sit still through most of the work.
 */
export function overallMastery(
  record: ProgressRecord,
  characters: readonly string[] = ALL_LETTERS,
  now: number = Date.now(),
): number {
  if (characters.length === 0) return 0
  const total = characters.reduce(
    (sum, character) => sum + masteryScore(getCharacter(record, character, now).skills),
    0,
  )
  return total / characters.length
}

/** The practice queue: what is most in danger of being forgotten. */
export function dueCharacters(
  record: ProgressRecord,
  characters: readonly string[],
  now: number,
  limit: number,
): string[] {
  const items: DueItem<null>[] = characters.map((character) => ({
    character: character.toUpperCase(),
    state: getCharacter(record, character, now).schedule,
    meta: null,
  }))

  return selectDue(items, now, limit).map((item) => item.character)
}
