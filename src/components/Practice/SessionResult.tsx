import { useEffect, useMemo, useRef, useState } from 'react'
import { SCORE, charsPerMinute, type SessionSummary } from '../../game/session'
import { AUTHOR, SITE } from '../../config/site'
import { prettify } from '../../engine/morseEncoder'
import { spokenCode } from '../../engine/spokenCode'
import { ALL_LETTERS, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { currentStreak, dayKey, xpForAnswer } from '../../game/progression'
import { WEAK_SKILL_ACCURACY } from '../../game/nextAction'
import { joinList } from '../../data/format'
import type { Achievement } from '../../game/achievements'
import {
  DEFAULT_CHALLENGE,
  newSeed,
  practiceInvite,
  type ShareMessage,
  type Versus,
} from '../../game/challengeLink'
import { createStatsStore } from '../../storage/stats'
import { createProgressStore, masteredCharacters } from '../../storage/progress'
import { LESSON_STAGES, STEP_COPY, TEACH_STEPS, currentStageIndex } from '../Lesson/lesson'
import { Screen } from '../ui/Screen'
import { Readout } from '../ui/Readout'
import { ShareSheet } from '../Challenge/ShareSheet'
import { VersusPlate } from '../Challenge/VersusPlate'
import type { CardData } from '../Share/resultCard'
import '../../styles/pkg-e.css'

/**
 * The result screen (PROJECT.md §20, §35; TASK-001 §4.1).
 *
 * Accuracy is the headline, not the score. §34 puts accuracy above speed, and a
 * result screen that leads with a big number teaches the opposite of what the
 * scoring is trying to. The score sits beside it, because on a challenge it is
 * the number that gets compared.
 */

export interface ResultAction {
  label: string
  onClick: () => void
}

export interface SessionResultProps {
  summary: SessionSummary
  challenge: boolean
  /** Characters this session unlocked, for methods that unlock on accuracy. */
  unlocked?: string | null
  /** Achievements crossed during this session, shown once, here. */
  earned?: readonly Achievement[]
  onAgain: () => void
  /**
   * Replaces "Again" as the main button, e.g. the lesson's "Next stage".
   * "Again" then stays, as a quieter button beside it, and the result's own
   * "where next" link is dropped: the caller's action is the way on, and a
   * second link to the same place only competes with it.
   */
  primaryAction?: ResultAction
  /** One more quiet button after "Again", e.g. "Back to the stage drill". */
  secondaryAction?: ResultAction
  /** Label for the replay button. Default "Again". */
  againLabel?: string
  /** Challenge length in seconds, for the plate and the card. */
  time?: number
  /** The score on the link the player was sent, if any. */
  versus?: Versus | null
  /**
   * What "Challenge a friend" sends. Absent: an invitation to a fresh
   * challenge. Null: no share sheet at all.
   */
  share?: ShareMessage | null
  /** One line for the share sheet, about what the link carries. */
  shareBlurb?: string
  /** Start a drill on these characters (P10). Absent hides the button. */
  onDrill?: (characters: readonly string[]) => void
}

/**
 * Where to go next: the lesson until it is finished, then the daily wire.
 *
 * `stage` is the lesson's own stage index (`currentStageIndex`, over
 * `LESSON_STAGES`), so "Stage 5" here is stage 5 on /learn/, in the word
 * /learn/ itself uses (J-15). It used to count the tree's four layers, and
 * sent people on stage 5 to the daily.
 */
export function nextStep(stage: number): { href: string; label: string } {
  if (stage < LESSON_STAGES.length) {
    return { href: '/learn/', label: stage === 0 ? 'Start lesson 1' : `Stage ${stage + 1}` }
  }
  return { href: '/daily/', label: "Today's daily wire" }
}

/**
 * Below this accuracy a challenge result offers the lesson instead of a share
 * (J-10, DEC-044). A newcomer who decoded two of seventeen was being invited
 * to send "your 0 to beat", which helps nobody and embarrasses the sender.
 */
export const LOW_ACCURACY = 0.4

/**
 * The bar a result has to clear to be shown as passed: the accuracy a
 * character must average to count as Mastered. Below it the accuracy reads
 * amber, the system's colour for "still learning" (DEC-043), rather than the
 * green that means done.
 */
export const PASS_ACCURACY = WEAK_SKILL_ACCURACY

export function accuracyTone(accuracy: number): 'signal' | 'amber' {
  return accuracy >= PASS_ACCURACY ? 'signal' : 'amber'
}

/** Whether a challenge result gets the lesson path instead of the share sheet. */
export function offersLessonPath(summary: Pick<SessionSummary, 'accuracy'>): boolean {
  return summary.accuracy < LOW_ACCURACY
}

/**
 * The lesson path a low challenge result offers: the stage /learn/ will
 * open, what it teaches, and how. Null once the course is finished, when
 * there is no lesson left to point at.
 */
export function lessonPath(stage: number): { href: string; label: string; line: string } | null {
  const characters = LESSON_STAGES[stage]
  if (!characters) return null
  const steps = TEACH_STEPS.map((step) => STEP_COPY[step].title.toLowerCase()).join(', ')
  return {
    ...nextStep(stage),
    line: `Stage ${stage + 1} of the lesson teaches ${joinList(characters)}, one at a time: ${steps}.`,
  }
}

/**
 * How the score is made, in one line, from the constants `summarize` uses:
 * points per character (weighted by its length), times accuracy squared,
 * times a clamped speed factor.
 */
export const SCORE_RULE = `Score is ${SCORE.perCorrect} points for each character you got, a little more for longer codes, times your accuracy squared, times a speed factor between ${SCORE.speedFloor} and ${SCORE.speedCeiling}. Guessing scores next to nothing.`

/** What the result announces when it appears: the headline numbers, in one sentence. */
export function resultAnnouncement(summary: SessionSummary, challenge: boolean): string {
  const accuracy = Math.round(summary.accuracy * 100)
  const what = challenge ? 'decoded' : 'right'
  return `Session over. Accuracy ${accuracy}%, ${summary.correct} of ${summary.total} ${what}. Score ${summary.score}.`
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

export function SessionResult({
  summary,
  challenge,
  unlocked = null,
  earned = [],
  onAgain,
  primaryAction,
  secondaryAction,
  againLabel = 'Again',
  time = DEFAULT_CHALLENGE.time,
  versus = null,
  share,
  shareBlurb,
  onDrill,
}: SessionResultProps) {
  const accuracy = Math.round(summary.accuracy * 100)

  // Recomputed rather than passed down: it is the same pure function the
  // session used to bank it, so the two cannot disagree.
  const xpEarned = useMemo(
    () =>
      summary.attempts
        .filter((attempt) => attempt.correct)
        .reduce((sum, attempt) => sum + xpForAnswer(attempt.character), 0),
    [summary.attempts],
  )

  // Read after mount: the stores are empty during prerender, and the session
  // that just finished has already written into them by the time this renders.
  const [streak, setStreak] = useState(0)
  const [mastered, setMastered] = useState(0)
  const [stage, setStage] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const [date, setDate] = useState<string | undefined>(undefined)
  const [inviteSeed] = useState(() => newSeed())

  useEffect(() => {
    const now = Date.now()
    const stats = createStatsStore().read()
    const progress = createProgressStore().read()
    setStreak(currentStreak(stats.streak, now))
    setMastered(masteredCharacters(progress, ALL_LETTERS).length)
    setStage(currentStageIndex(progress, now))
    setDate(dayKey(now))
  }, [])

  // The session's screen, and the field or key that had focus, has just
  // unmounted, so focus would fall to the page and a screen reader would say
  // nothing. Focus moves to the heading, and the numbers are read from a live
  // region that was already there when they were written into it.
  useEffect(() => {
    const target = heading.current
    if (target) {
      target.focus({ preventScroll: true })
      if (target.getBoundingClientRect().top < 0) target.scrollIntoView({ block: 'start' })
    }
    setAnnouncement(resultAnnouncement(summary, challenge))
  }, [summary, challenge])

  const cardData = useMemo<CardData>(
    () => ({
      accuracy: summary.accuracy,
      correct: summary.correct,
      total: summary.total,
      wpm: summary.wpm,
      streak,
      mastered,
      challenge,
      score: summary.score,
      date,
      time,
    }),
    [summary, streak, mastered, challenge, date, time],
  )

  const message = useMemo<ShareMessage | null>(() => {
    if (share !== undefined) return share
    return practiceInvite({
      seed: inviteSeed,
      accuracy: summary.accuracy,
      total: summary.total,
      siteUrl: SITE.url,
      siteName: SITE.name,
    })
  }, [share, inviteSeed, summary.accuracy, summary.total])

  const weakest = summary.weakest.slice(0, 8)
  const step = nextStep(stage)
  const main = primaryAction ?? { label: againLabel, onClick: onAgain }
  // The share is the point of the challenge, so it sits right under the
  // numbers being shared (J-08). A run that was mostly guesses gets the way
  // to learn instead (J-10): nobody should be invited to send a near-zero.
  const lowChallenge = challenge && summary.total > 0 && offersLessonPath(summary)
  const path = lowChallenge ? lessonPath(stage) : null
  const shareShown = summary.total > 0 && message !== null && !lowChallenge

  const shareSheet = shareShown && (
    <ShareSheet
      message={message}
      kind={challenge ? 'challenge' : 'practice'}
      card={cardData}
      blurb={
        shareBlurb ??
        `The link opens a fresh ${DEFAULT_CHALLENGE.time}-second test for whoever you send it to. Nothing is stored anywhere.`
      }
    />
  )

  return (
    <section aria-labelledby="result-heading" className="mf-instrument p-5 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h2
          id="result-heading"
          ref={heading}
          tabIndex={-1}
          className="mf-engraved flex items-center gap-2 outline-none"
        >
          <span className="mf-lamp" data-on="true" aria-hidden="true" />
          {challenge ? `${time}-second challenge` : 'Session report'}
        </h2>
        {date && (
          <span className="mf-engraved shrink-0 whitespace-nowrap tabular-nums">{date}</span>
        )}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {/* Accuracy first and largest. Leading with the score would teach people
          to optimise the thing §34 deliberately caps. */}
      <Screen powerOn className="mt-5 grid justify-items-center gap-4 px-5 pt-8 pb-6 sm:px-8">
        <div
          className="pe-accuracy mf-readout mf-readout-xl relative z-[3]"
          data-tone={accuracyTone(summary.accuracy)}
        >
          <span className="mf-readout-label mf-engraved">Accuracy</span>
          <span className="mf-readout-value">{accuracy}%</span>
        </div>
        <p className="relative z-[3] text-lead text-ink">
          {summary.correct} of {summary.total} {challenge ? 'decoded' : 'right'}
        </p>
        {summary.attempts.length > 0 && (
          <div className="relative z-[3] w-full max-w-xl">
            <div className="pe-strip justify-center" aria-hidden="true">
              {summary.attempts.map((attempt, index) => (
                <span key={index} className="pe-mark" data-state={attempt.correct ? 'hit' : 'miss'}>
                  {!attempt.correct && (
                    <svg viewBox="0 0 6 6">
                      <path d="M1 1l4 4M5 1l-4 4" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  )}
                </span>
              ))}
            </div>
            <p className="mt-3 text-center text-sm text-muted">
              Each lamp is one answer, in order. A ring is a miss.
            </p>
          </div>
        )}
      </Screen>

      {versus && <VersusPlate versus={versus} className="mt-6" />}

      {lowChallenge && (
        <section aria-labelledby="path-heading" className="mf-panel mt-6 p-5 sm:p-6">
          <h3 id="path-heading" className="mf-engraved flex items-center gap-2">
            <span className="mf-lamp" data-on="true" data-tone="amber" aria-hidden="true" />
            Next on the wire
          </h3>
          <p className="mt-3 font-display text-h3 font-bold text-ink">
            Not there yet, and that is normal.
          </p>
          {path ? (
            <>
              <p className="mt-2 max-w-[60ch] text-muted">{path.line}</p>
              <a href={path.href} className="mf-btn mf-btn-primary mf-btn-lg mt-5 w-full sm:w-auto">
                {path.label} →
              </a>
            </>
          ) : (
            <p className="mt-2 max-w-[60ch] text-muted">
              Drill the characters you missed, then run it again.
            </p>
          )}
          <p className="mt-4 max-w-[60ch] text-sm text-muted">{SCORE_RULE}</p>
        </section>
      )}

      {challenge && shareSheet && <div className="mt-6">{shareSheet}</div>}

      <div className="pe-readouts mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Score" value={summary.score} tone="signal" />
        {/* Correct answers a minute. Not WPM: in listening and reading modes
            this is typing speed, and the honest unit says so (DEC-006). */}
        <Readout label="Chars / min" value={charsPerMinute(summary)} />
        <Readout label="Time" value={formatSeconds(summary.elapsedMs)} />
        <Readout
          label="Streak"
          value={streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'}` : '—'}
          tone={streak > 0 ? 'amber' : 'ink'}
          lamp={streak > 0}
        />
      </div>

      {(xpEarned > 0 || unlocked || earned.length > 0) && (
        <ul className="mt-6 grid gap-3" aria-label="Earned this session">
          {xpEarned > 0 && (
            <li className="relative flex items-center gap-3">
              <span className="font-mono text-readout text-amber tabular-nums">+{xpEarned}</span>
              <span className="mf-engraved">XP banked</span>
              {/* A copy that rises and fades, for the moment; the static one
                  above is what stays readable (and all there is under reduced
                  motion). */}
              <span
                aria-hidden="true"
                className="mf-rise mf-still:hidden pointer-events-none absolute top-0 left-0 font-mono text-readout text-amber"
              >
                +{xpEarned}
              </span>
            </li>
          )}
          {unlocked && (
            <li className="mf-tape mf-slip pe-slip">
              <span className="font-display text-h2 font-bold">{unlocked}</span>
              <span>
                <span className="block font-mono text-control uppercase">Unlocked</span>
                <span className="pe-paper-muted mt-1 block text-sm">
                  You cleared the bar, so the next step in your order joins the pool.
                </span>
              </span>
              <span className="mf-stamp mf-stamp-in pe-paper-stamp text-base">New</span>
            </li>
          )}
          {earned.map((achievement) => (
            <li key={achievement.id} className="mf-tape mf-slip pe-slip">
              <span aria-hidden="true" className="text-3xl">
                {achievement.icon}
              </span>
              <span>
                <span className="block font-mono text-control uppercase">{achievement.title}</span>
                <span className="pe-paper-muted mt-1 block text-sm">{achievement.description}</span>
              </span>
              <span className="mf-stamp mf-stamp-in pe-paper-stamp text-base">Received</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={main.onClick}
          className={`mf-btn ${path ? 'mf-btn-secondary' : 'mf-btn-primary'} mf-btn-lg grow sm:grow-0`}
        >
          {main.label}
        </button>
        {primaryAction && (
          <button type="button" onClick={onAgain} className="mf-btn mf-btn-secondary mf-btn-lg">
            {againLabel}
          </button>
        )}
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="mf-btn mf-btn-ghost mf-btn-lg"
          >
            {secondaryAction.label}
          </button>
        )}
        {!primaryAction && !path && (
          <a href={step.href} className="mf-btn mf-btn-ghost mf-btn-lg">
            {step.label} →
          </a>
        )}
      </div>

      {weakest.length > 0 && (
        <section aria-labelledby="weak-heading" className="mt-8 border-t border-line pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 id="weak-heading" className="mf-engraved">
                Practise these
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {weakest.map(({ character, misses }) => (
                  <li key={character} className="pe-keycap">
                    <span className="font-display text-h3 font-bold">{character}</span>
                    <span className="font-mono text-label tracking-code" aria-hidden="true">
                      {prettify(MORSE_ALPHABET[character] ?? '')}
                    </span>
                    <span className="sr-only">
                      , {spokenCode(MORSE_ALPHABET[character] ?? '')}, missed {misses} time
                      {misses === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {onDrill && (
              <button
                type="button"
                className="mf-btn mf-btn-secondary"
                onClick={() => onDrill(weakest.map((entry) => entry.character))}
              >
                Drill {weakest.length === 1 ? 'this character' : `these ${weakest.length}`}
              </button>
            )}
          </div>
        </section>
      )}

      {summary.total === 0 && (
        <p className="mt-6 text-sm text-muted">
          Nothing answered, so nothing was saved. If no prompt reached you, check the{' '}
          <a href="/settings/#signal" className="text-ink underline underline-offset-4">
            Signal setting
          </a>
          .
        </p>
      )}

      {!challenge && shareSheet && <div className="mt-8">{shareSheet}</div>}

      <p className="mt-6 text-sm text-muted">
        Saved to this browser only; nothing was sent anywhere. Built by{' '}
        <a href={AUTHOR.url} rel="me" className="text-ink underline underline-offset-4">
          {AUTHOR.name}
        </a>
        .
      </p>
    </section>
  )
}
