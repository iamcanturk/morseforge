/**
 * Learner progress (PROJECT.md §5, §6, §21, §22).
 *
 * One record holding, per character, the mastery evidence and the review
 * schedule. Mastery *levels* are deliberately not stored — they are computed
 * from the attempt counts on read, so changing the thresholds re-grades
 * everyone instead of stranding them at a level the current rules would never
 * award.
 */

import { LESSON_STAGES } from '../data/lessonStages'
import { ALL_LETTERS } from '../data/morseAlphabet'
import {
  DEFAULT_METHOD,
  METHODS,
  type MethodId,
  activeCharacters,
  nextUnlockCount,
  shouldUnlock,
} from '../data/methods'
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
  MAX_INTERVAL_MS,
  newReviewState,
  review,
  selectDue,
} from '../game/spacedRepetition'
import { type Store, type StorageDriver, sharedStore, count, isRecord, num, oneOf } from './store'

/** Method ids as a plain tuple, for `oneOf`. */
const METHOD_VALUES = ['signal', 'koch', 'alphabetical'] as const

export const PROGRESS_KEY = 'morseforge_progress'
export const PROGRESS_VERSION = 1

/**
 * Ceiling for any counter read back from storage or an import. Far beyond
 * real practice, and low enough that sums over the alphabet stay exact.
 */
const MAX_COUNT = 1_000_000_000

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
  /**
   * Which teaching order the learner is following.
   *
   * Stored with progress rather than with settings because it is not a
   * preference — it decides which characters exist for them, and resetting
   * progress has to reset it too. A learner who wipes their progress and finds
   * themselves still eighteen characters into Koch has not been reset.
   */
  method: MethodId
  /** Characters unlocked beyond the method's starting set. */
  unlocked: number
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
    const attempts = count(raw['attempts'], 0, MAX_COUNT)
    // Correct can never exceed attempts. A hand-edited export claiming 500
    // correct out of 3 would otherwise show 16,000% accuracy forever.
    stats[skill] = { attempts, correct: Math.min(count(raw['correct'], 0, MAX_COUNT), attempts) }
  }

  return stats
}

function validateSchedule(value: unknown, now: number): ReviewState {
  if (!isRecord(value)) return newReviewState(now)
  return {
    streak: count(value['streak'], 0, MAX_COUNT),
    intervalMs: num(value['intervalMs'], 0, 0, MAX_INTERVAL_MS),
    // No review can be due further out than the longest interval: a date in
    // 2099 would hide the character from practice for good.
    dueAt: num(value['dueAt'], now, 0, now + MAX_INTERVAL_MS),
    lapses: count(value['lapses'], 0, MAX_COUNT),
    ease: num(value['ease'], 2.5, 1.3, 2.8),
  }
}

/**
 * Narrow untrusted data to a progress record, or null if it is not one.
 *
 * Exported for the backup import, which needs "invalid" as an answer rather
 * than the empty record `validateOrDefault` would substitute.
 */
export function validateProgress(value: unknown): ProgressRecord | null {
  if (!isRecord(value)) return null

  const method = oneOf(value['method'], METHOD_VALUES, DEFAULT_METHOD)
  // Clamped to the method's own length: a file naming a long order and then
  // switched to a short one would otherwise claim characters that do not exist.
  const unlocked = Math.min(count(value['unlocked']), METHODS[method].order.length)

  const rawCharacters = value['characters']
  if (!isRecord(rawCharacters)) return { characters: {}, method, unlocked }

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

  return { characters, method, unlocked }
}

/**
 * Whether untrusted data is a whole progress record rather than a fragment.
 *
 * For the import, where `{ method: 'signal' }` must not "restore" an empty
 * character map over real progress. Only `characters` is required: `method`
 * and `unlocked` arrived later without a version bump, so genuine old exports
 * lack them. When present they must have the right type.
 */
export function isCompleteProgress(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value['characters'])) return false
  // Every entry must be a record too. The validator skips a malformed one,
  // so `{ E: 'garbage' }` would otherwise restore E as never practised.
  if (!Object.values(value['characters']).every(isRecord)) return false
  const method = value['method']
  const unlocked = value['unlocked']
  if (method !== undefined && typeof method !== 'string') return false
  return unlocked === undefined || typeof unlocked === 'number'
}

/** A fresh, empty progress record. */
export function emptyProgress(): ProgressRecord {
  return { characters: {}, method: DEFAULT_METHOD, unlocked: 0 }
}

export function createProgressStore(driver?: StorageDriver): Store<ProgressRecord> {
  return sharedStore<ProgressRecord>(
    {
      key: PROGRESS_KEY,
      version: PROGRESS_VERSION,
      validate: validateProgress,
      createDefault: emptyProgress,
    },
    driver,
  )
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

/** The characters the learner's current method has unlocked for them. */
export function unlockedCharacters(record: ProgressRecord): string[] {
  return activeCharacters(METHODS[record.method], record.unlocked)
}

/** Switch method. Unlocks reset, because they count into a different order. */
export function setMethod(record: ProgressRecord, method: MethodId): ProgressRecord {
  if (record.method === method) return record
  return { ...record, method, unlocked: 0 }
}

/**
 * Unlock the next step in the current method: one character for Koch, the
 * whole next stage for the staged methods.
 */
export function unlockNext(record: ProgressRecord): ProgressRecord {
  const next = nextUnlockCount(METHODS[record.method], record.unlocked)
  if (next <= record.unlocked) return record
  return { ...record, unlocked: next }
}

/**
 * The unlock a finished session has earned, if any: the record after at most
 * one `unlockNext`, or the same record when the bar was not cleared.
 *
 * At most one step by construction. The practice screen once re-ran its
 * unlock on every change of `unlocked`, so a single good session cascaded
 * through every stage to all 36 characters. A caller must still apply this
 * once per finished session; it cannot tell one session from the next.
 */
export function unlockForSession(
  record: ProgressRecord,
  session: { accuracy: number; total: number },
): ProgressRecord {
  if (!shouldUnlock(METHODS[record.method], session.accuracy, session.total)) return record
  return unlockNext(record)
}

/** The characters `after` has that `before` did not, in teaching order. */
export function newlyUnlocked(before: ProgressRecord, after: ProgressRecord): string[] {
  const had = new Set(unlockedCharacters(before))
  return unlockedCharacters(after).filter((character) => !had.has(character))
}

/**
 * Make sure at least the first `count` characters of the method are unlocked.
 *
 * Only ever raises. A lesson finished after the practice screen had already
 * unlocked further must not take characters away, and calling this twice for
 * the same lesson must be harmless.
 */
export function unlockThrough(record: ProgressRecord, count: number): ProgressRecord {
  const method = METHODS[record.method]
  const limit = method.order.length - method.startingCount
  const wanted = Math.min(Math.max(Math.floor(count) - method.startingCount, 0), limit)
  if (!Number.isFinite(wanted) || wanted <= record.unlocked) return record
  return { ...record, unlocked: wanted }
}

/**
 * Unlock as far as `taught` covers the method's own order, from the start.
 *
 * For the lesson, which teaches in tree order whatever method is chosen. Under
 * Signal, finishing stage 2 unlocks exactly stage 2. Under Koch, teaching E and
 * T unlocks nothing, because Koch's third character is R and unlocking through
 * to E would hand the learner a dozen characters nobody has shown them.
 */
export function unlockTaught(record: ProgressRecord, taught: readonly string[]): ProgressRecord {
  const method = METHODS[record.method]
  const covered = new Set([...unlockedCharacters(record), ...taught.map((c) => c.toUpperCase())])
  let prefix = 0
  while (prefix < method.order.length && covered.has(method.order[prefix]!)) prefix++
  return unlockThrough(record, prefix)
}

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
    ...record,
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
    ...record,
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
 * How many lesson stages are taught, counting from the first.
 *
 * Over `LESSON_STAGES`, the plan days the lesson screen teaches, so "stage 5"
 * here is stage 5 on /learn/ and on the progress page. It used to count the
 * four tree layers, which put a learner at "stage 3 of 4" while the lesson
 * said "stage 5 of 7".
 *
 * A stage counts once every character in it has been answered correctly at
 * least once (level 2) — the same bar the lesson uses to move on. Counted as a
 * run from stage 1 rather than as a total, so it reads as the lesson's own
 * position: drilling Q alone does not make anyone four stages in.
 */
export function stagesTaught(record: ProgressRecord, now: number): number {
  let taught = 0
  for (const stage of LESSON_STAGES) {
    const complete = stage.every((character) => {
      const entry = getCharacter(record, character, now)
      return masteryLevel(entry.skills, entry.seen) >= 2
    })
    if (!complete) break
    taught++
  }
  return taught
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
/**
 * Accuracy per skill, across every character (PROJECT.md §20).
 *
 * The lifetime figure on the dashboard averages all three, which hides the one
 * thing worth knowing: almost everyone's sending accuracy runs well ahead of
 * their listening, and a single number tells you nothing about which to
 * practise. Returns null for a skill with no attempts rather than 0 — never
 * having tried is not the same as always getting it wrong.
 */
export function accuracyBySkill(
  record: ProgressRecord,
  characters: readonly string[],
  now = Date.now(),
): Record<Skill, { accuracy: number | null; attempts: number }> {
  const totals = Object.fromEntries(
    SKILLS.map((skill) => [skill, { attempts: 0, correct: 0 }]),
  ) as Record<Skill, { attempts: number; correct: number }>

  for (const character of characters) {
    const entry = getCharacter(record, character, now)
    for (const skill of SKILLS) {
      totals[skill].attempts += entry.skills[skill].attempts
      totals[skill].correct += entry.skills[skill].correct
    }
  }

  return Object.fromEntries(
    SKILLS.map((skill) => [
      skill,
      {
        attempts: totals[skill].attempts,
        accuracy:
          totals[skill].attempts === 0 ? null : totals[skill].correct / totals[skill].attempts,
      },
    ]),
  ) as Record<Skill, { accuracy: number | null; attempts: number }>
}

/**
 * The skill furthest behind, or null when there is nothing to compare.
 *
 * Only counts skills with enough attempts to mean anything — two answers is
 * not evidence, and telling someone to drill their "weakest skill" on the
 * strength of one unlucky guess is worse than saying nothing.
 */
export function weakestSkill(
  record: ProgressRecord,
  characters: readonly string[],
  now = Date.now(),
  minimumAttempts = 10,
): Skill | null {
  const bySkill = accuracyBySkill(record, characters, now)
  const eligible = SKILLS.filter(
    (skill) => bySkill[skill].attempts >= minimumAttempts && bySkill[skill].accuracy !== null,
  )
  if (eligible.length < 2) return null

  return eligible.reduce((worst, skill) =>
    (bySkill[skill].accuracy ?? 1) < (bySkill[worst].accuracy ?? 1) ? skill : worst,
  )
}

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
