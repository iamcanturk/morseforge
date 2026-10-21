import { useEffect, useMemo, useRef, useState } from 'react'
import { SCORE, charsPerMinute, type SessionSummary } from '../../game/session'
import { AUTHOR, SITE } from '../../config/site'
import { prettify } from '../../engine/morseEncoder'
import { ALL_LETTERS, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { currentStreak, dayKey, xpForAnswer } from '../../game/progression'
import { WEAK_SKILL_ACCURACY } from '../../game/nextAction'
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
import { LESSON_STAGES, TEACH_STEPS, currentStageIndex, stepCopy } from '../Lesson/lesson'
import { useT } from '../../i18n/react'
import { renderRich } from '../../i18n/richReact'
import type { Translator } from '../../i18n/translator'
import { achievementCopy } from '../Stats/achievementCopy'
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
export function nextStep(t: Translator, stage: number): { href: string; label: string } {
  if (stage < LESSON_STAGES.length) {
    return {
      href: '/learn/',
      label: stage === 0 ? t('result.startLesson') : t('result.stage', { stage: stage + 1 }),
    }
  }
  return { href: '/daily/', label: t('result.dailyWire') }
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
export function lessonPath(
  t: Translator,
  stage: number,
): { href: string; label: string; line: string } | null {
  const characters = LESSON_STAGES[stage]
  if (!characters) return null
  const steps = TEACH_STEPS.map((step) =>
    stepCopy(t, step).title.toLocaleLowerCase(t.locale.lang),
  ).join(', ')
  return {
    ...nextStep(t, stage),
    line: t('result.pathLine', { stage: stage + 1, characters: t.list(characters), steps }),
  }
}

/**
 * How the score is made, in one line, from the constants `summarize` uses:
 * points per character (weighted by its length), times accuracy squared,
 * times a clamped speed factor.
 */
export function scoreRule(t: Translator): string {
  return t('result.scoreRule', {
    perCorrect: SCORE.perCorrect,
    floor: SCORE.speedFloor,
    ceiling: SCORE.speedCeiling,
  })
}

/** What the result announces when it appears: the headline numbers, in one sentence. */
export function resultAnnouncement(
  t: Translator,
  summary: SessionSummary,
  challenge: boolean,
): string {
  const params = {
    accuracy: Math.round(summary.accuracy * 100),
    correct: summary.correct,
    total: summary.total,
    score: summary.score,
  }
  return challenge ? t('result.announcementChallenge', params) : t('result.announcement', params)
}

function formatSeconds(t: Translator, ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return t('result.secondsShort', { seconds })
  return t('result.minutesShort', {
    minutes: Math.floor(seconds / 60),
    seconds: String(seconds % 60).padStart(2, '0'),
  })
}

export function SessionResult({
  summary,
  challenge,
  unlocked = null,
  earned = [],
  onAgain,
  primaryAction,
  secondaryAction,
  againLabel,
  time = DEFAULT_CHALLENGE.time,
  versus = null,
  share,
  shareBlurb,
  onDrill,
}: SessionResultProps) {
  const t = useT()
  const again = againLabel ?? t('practice.again')
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
    setAnnouncement(resultAnnouncement(t, summary, challenge))
  }, [summary, challenge, t])

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
  const step = nextStep(t, stage)
  const main = primaryAction ?? { label: again, onClick: onAgain }
  // The share is the point of the challenge, so it sits right under the
  // numbers being shared (J-08). A run that was mostly guesses gets the way
  // to learn instead (J-10): nobody should be invited to send a near-zero.
  const lowChallenge = challenge && summary.total > 0 && offersLessonPath(summary)
  const path = lowChallenge ? lessonPath(t, stage) : null
  const shareShown = summary.total > 0 && message !== null && !lowChallenge

  const shareSheet = shareShown && (
    <ShareSheet
      message={message}
      kind={challenge ? 'challenge' : 'practice'}
      card={cardData}
      blurb={shareBlurb ?? t('result.inviteBlurb', { seconds: DEFAULT_CHALLENGE.time })}
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
          {challenge ? t('result.challengeHeading', { seconds: time }) : t('result.reportHeading')}
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
          <span className="mf-readout-label mf-engraved">{t('result.accuracy')}</span>
          <span className="mf-readout-value">{t('result.percent', { value: accuracy })}</span>
        </div>
        <p className="relative z-[3] text-lead text-ink">
          {challenge
            ? t('result.ofDecoded', { correct: summary.correct, total: summary.total })
            : t('result.ofRight', { correct: summary.correct, total: summary.total })}
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
            <p className="mt-3 text-center text-sm text-muted">{t('result.stripNote')}</p>
          </div>
        )}
      </Screen>

      {versus && <VersusPlate versus={versus} className="mt-6" />}

      {lowChallenge && (
        <section aria-labelledby="path-heading" className="mf-panel mt-6 p-5 sm:p-6">
          <h3 id="path-heading" className="mf-engraved flex items-center gap-2">
            <span className="mf-lamp" data-on="true" data-tone="amber" aria-hidden="true" />
            {t('result.nextOnWire')}
          </h3>
          <p className="mt-3 font-display text-h3 font-bold text-ink">{t('result.notThereYet')}</p>
          {path ? (
            <>
              <p className="mt-2 max-w-[60ch] text-muted">{path.line}</p>
              <a
                href={t.href(path.href)}
                className="mf-btn mf-btn-primary mf-btn-lg mt-5 w-full sm:w-auto"
              >
                {path.label} →
              </a>
            </>
          ) : (
            <p className="mt-2 max-w-[60ch] text-muted">{t('result.drillMissed')}</p>
          )}
          <p className="mt-4 max-w-[60ch] text-sm text-muted">{scoreRule(t)}</p>
        </section>
      )}

      {challenge && shareSheet && <div className="mt-6">{shareSheet}</div>}

      <div className="pe-readouts mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label={t('result.score')} value={summary.score} tone="signal" />
        {/* Correct answers a minute. Not WPM: in listening and reading modes
            this is typing speed, and the honest unit says so (DEC-006). */}
        <Readout label={t('result.charsPerMinute')} value={charsPerMinute(summary)} />
        <Readout label={t('result.time')} value={formatSeconds(t, summary.elapsedMs)} />
        <Readout
          label={t('result.streak')}
          value={streak > 0 ? t('result.streakDays', { count: streak }) : '—'}
          tone={streak > 0 ? 'amber' : 'ink'}
          lamp={streak > 0}
        />
      </div>

      {(xpEarned > 0 || unlocked || earned.length > 0) && (
        <ul className="mt-6 grid gap-3" aria-label={t('result.earnedThisSession')}>
          {xpEarned > 0 && (
            <li className="relative flex items-center gap-3">
              <span className="font-mono text-readout text-amber tabular-nums">+{xpEarned}</span>
              <span className="mf-engraved">{t('result.xpBanked')}</span>
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
                <span className="block font-mono text-control uppercase">
                  {t('result.unlocked')}
                </span>
                <span className="pe-paper-muted mt-1 block text-sm">
                  {t('result.unlockedNote')}
                </span>
              </span>
              <span className="mf-stamp mf-stamp-in pe-paper-stamp text-base">
                {t('result.newStamp')}
              </span>
            </li>
          )}
          {earned.map((achievement) => {
            const copy = achievementCopy(t, achievement)
            return (
              <li key={achievement.id} className="mf-tape mf-slip pe-slip">
                <span aria-hidden="true" className="text-3xl">
                  {achievement.icon}
                </span>
                <span>
                  <span className="block font-mono text-control uppercase">{copy.title}</span>
                  <span className="pe-paper-muted mt-1 block text-sm">{copy.description}</span>
                </span>
                <span className="mf-stamp mf-stamp-in pe-paper-stamp text-base">
                  {t('result.received')}
                </span>
              </li>
            )
          })}
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
            {again}
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
          <a href={t.href(step.href)} className="mf-btn mf-btn-ghost mf-btn-lg">
            {step.label} →
          </a>
        )}
      </div>

      {weakest.length > 0 && (
        <section aria-labelledby="weak-heading" className="mt-8 border-t border-line pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 id="weak-heading" className="mf-engraved">
                {t('result.practiseThese')}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {weakest.map(({ character, misses }) => (
                  <li key={character} className="pe-keycap">
                    <span className="font-display text-h3 font-bold">{character}</span>
                    <span className="font-mono text-label tracking-code" aria-hidden="true">
                      {prettify(MORSE_ALPHABET[character] ?? '')}
                    </span>
                    <span className="sr-only">
                      {t('result.missedTimes', {
                        count: misses,
                        code: t.spokenCode(MORSE_ALPHABET[character] ?? ''),
                      })}
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
                {weakest.length === 1
                  ? t('result.drillThis')
                  : t('result.drillThese', { count: weakest.length })}
              </button>
            )}
          </div>
        </section>
      )}

      {summary.total === 0 && (
        <p className="mt-6 text-sm text-muted">
          {renderRich(
            t.rich('result.nothingAnswered'),
            {
              signal: { href: '/settings/#signal', class: 'text-ink underline underline-offset-4' },
            },
            t,
          )}
        </p>
      )}

      {!challenge && shareSheet && <div className="mt-8">{shareSheet}</div>}

      <p className="mt-6 text-sm text-muted">
        {renderRich(
          t.rich('result.savedLocally', { name: AUTHOR.name }),
          {
            author: { href: AUTHOR.url, rel: 'me', class: 'text-ink underline underline-offset-4' },
          },
          t,
        )}
      </p>
    </section>
  )
}
