import { useEffect, useMemo, useRef, useState } from 'react'
import { useCopySession, type CopyResult } from '../Copy/useCopySession'
import { CopyRound, useCopyRound } from '../Copy/CopyRound'
import { SignalNote } from '../Copy/SignalNote'
import { bringIntoView } from '../Copy/bringIntoView'
import { LineList, ToneSquare } from '../Copy/LineList'
import { TAPE_INK_VARS } from '../Copy/tapeInk'
import { sessionXp } from '../Copy/copySession'
import { DailyHistory } from './DailyHistory'
import { DailyShare } from './DailyShare'
import { dailyBrief, learnedCount } from './dailyBrief'
import { Readout } from '../ui/Readout'
import { Screen } from '../ui/Screen'
import { Lamp } from '../ui/Lamp'
import { useInstallPrompt } from '../ui/install'
import {
  LINES,
  dailyAlphabet,
  dailyChallenge,
  dailyKey,
  msUntilNext,
  type DailyChallenge,
} from '../../game/dailyChallenge'
import { dailyNumber, lineTone, percent, scoreDaily, summarizeDaily } from '../../game/dailyShare'
import type { Achievement } from '../../game/achievements'
import { TEXT_SOURCES } from '../../data/practiceText'
import { ALL_LETTERS } from '../../data/morseAlphabet'
import {
  createDailyStore,
  dailyStreakStatus,
  emptyDaily,
  recordDaily,
  resultFor,
  type DailyRecord,
  type DailyResult,
} from '../../storage/daily'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import { createProgressStore, emptyProgress, type ProgressRecord } from '../../storage/progress'
import { track } from '../../analytics/track'

/**
 * The daily wire (PROJECT.md §19).
 *
 * Everyone gets the same lines at the same speed, generated from the UTC date.
 * There is no backend and nothing is fetched, so it works offline and cannot
 * go down.
 *
 * Speed comes from the challenge, not from your settings — the point is that it
 * is the same for everyone. The Signal setting still applies (DEC-045): with
 * Lamp the wire flashes in silence, so a deaf learner gets the same wire, and
 * the tone and volume apply because a challenge that ignored them would just
 * be loud.
 *
 * One attempt a day. A run is scored over every line of the day, so stopping
 * early cannot score better than finishing; a stopped run is recorded as
 * incomplete, which is never a pass, and still counts for the streak.
 */
export function DailyScreen() {
  const store = useMemo(() => createDailyStore(), [])
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])

  const [record, setRecord] = useState<DailyRecord>(emptyDaily)
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)
  const [ready, setReady] = useState(false)

  // The date is read after mount, not during render: this page is prerendered
  // at build time, and baking that day's challenge into the HTML would serve
  // everyone the build date's challenge forever.
  const [liveDay, setLiveDay] = useState<string | null>(null)
  const [runDay, setRunDay] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setRecord(store.read())
    setSettings(settingsStore.read())
    setProgress(progressStore.read())
    setLiveDay(dailyKey())
    setRemaining(msUntilNext())
    setReady(true)
    const off = [
      store.subscribe(setRecord),
      settingsStore.subscribe(setSettings),
      progressStore.subscribe(setProgress),
    ]
    return () => off.forEach((fn) => fn())
  }, [store, settingsStore, progressStore])

  // Once a minute: this is a "come back tomorrow" countdown, and a per-second
  // timer would keep the tab awake to change a number nobody is watching. A
  // tab coming back from the background (a phone unlocked the next morning)
  // re-reads at once, since its timers were frozen while it was away.
  useEffect(() => {
    const refresh = () => {
      setRemaining(msUntilNext())
      setLiveDay(dailyKey())
    }
    const timer = setInterval(refresh, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  /** Set when Start found that midnight UTC had passed, and opened the new wire instead. */
  const [rolledOver, setRolledOver] = useState(false)

  // A run belongs to the day it started on. Without this clamp, a run that
  // crossed midnight UTC swapped its lines for the next day's mid-session and
  // was recorded under a date it was not played on.
  const [status, setStatus] = useState<'idle' | 'active'>('idle')
  const today = status === 'active' ? runDay : liveDay
  const challenge = useMemo(() => (today === null ? null : dailyChallenge(today)), [today])

  const session = useCopySession({
    kind: challenge?.kind ?? 'groups',
    characters: ALL_LETTERS,
    lines: challenge?.prompts.length ?? LINES,
    prompts: challenge?.prompts,
  })

  const round = useCopyRound(session, {
    settings,
    wpm: challenge?.wpm ?? 18,
    farnsworthWpm: challenge?.farnsworthWpm ?? 9,
  })

  // Bank the attempt the moment it finishes — once per finished session,
  // whatever re-renders follow. `recordDaily` also refuses a second write for
  // the same day, so a reload cannot improve the score.
  const { summary } = session
  const recorded = useRef<object | null>(null)
  useEffect(() => {
    if (session.status !== 'finished' || !summary || today === null || challenge === null) return
    if (recorded.current === summary) return
    recorded.current = summary

    const outcome = scoreDaily(
      challenge.prompts,
      session.results.map((result) => result.grade),
      challenge.passMark,
    )
    track('daily_finish', outcome.passed ? 'pass' : outcome.completed ? 'fail' : 'incomplete')
    store.update((current) =>
      recordDaily(current, {
        date: today,
        accuracy: outcome.accuracy,
        score: summary.score,
        passed: outcome.passed,
        lines: outcome.lines,
        completed: outcome.completed,
      }),
    )
  }, [session.status, session.results, summary, today, challenge, store])

  // The run screen this replaces held focus (the answer box, "See how you
  // did", the Give up dialog). Hand it to the result's heading so a keyboard
  // or screen-reader user lands on the result instead of on <body>.
  const resultHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (session.status === 'finished') resultHeading.current?.focus({ preventScroll: false })
  }, [session.status])

  if (!ready || challenge === null || today === null) {
    // As tall as the set-up it turns into (IDLE_HEIGHT), so hydrating does
    // not push the questions below it down the page (V-20).
    return (
      <section className={`mf-instrument p-5 sm:p-8 ${IDLE_HEIGHT}`} aria-busy="true">
        <span className="mf-engraved">Daily wire</span>
        <Screen className="mt-5 grid min-h-48 place-items-center p-8">
          <span className="mf-engraved flex items-center gap-2">
            <Lamp on tone="amber" /> Tuning in to today&rsquo;s wire
          </span>
        </Screen>
      </section>
    )
  }

  const streak = dailyStreakStatus(record, today)
  const stored = resultFor(record, today)
  const nextIn = formatCountdown(remaining)
  const nextIsUp = liveDay !== null && liveDay !== today

  const header = <WireHeader today={today} streak={streak} />

  /* Finished just now, or on an earlier visit. */
  if (session.status === 'finished' || (session.status === 'idle' && stored)) {
    const live = session.status === 'finished' ? session.results : null
    const result: DailyResult =
      stored ??
      (() => {
        // The first render after finishing, before the store write lands.
        const outcome = scoreDaily(
          challenge.prompts,
          session.results.map((r) => r.grade),
          challenge.passMark,
        )
        return {
          date: today,
          accuracy: outcome.accuracy,
          score: session.summary?.score ?? 0,
          passed: outcome.passed,
          lines: outcome.lines,
          completed: outcome.completed,
        }
      })()

    return (
      <section className="mf-instrument p-5 sm:p-8" aria-labelledby="daily-result-heading">
        <h2 id="daily-result-heading" ref={resultHeading} tabIndex={-1} className="sr-only">
          Today&rsquo;s result: {percent(result.accuracy)}%
          {result.completed === false ? ', incomplete' : result.passed ? ', passed' : ''}
        </h2>
        {header}
        <DailyResultView
          challenge={challenge}
          result={result}
          live={live}
          earned={session.status === 'finished' ? session.earned : []}
          xp={
            session.status === 'finished' && session.summary
              ? sessionXp(session.summary.attempts)
              : 0
          }
          streak={streak.days}
        />

        <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-[auto_1fr] sm:items-end">
          {nextIsUp ? (
            <div className="grid gap-3">
              <span className="mf-engraved flex items-center gap-2">
                <Lamp on /> The next wire is up
              </span>
              <button
                type="button"
                className="mf-btn mf-btn-primary"
                onClick={() => {
                  session.reset()
                  setStatus('idle')
                }}
              >
                Open today&rsquo;s wire
              </button>
            </div>
          ) : (
            <Readout
              label="Next wire in"
              value={nextIn}
              caption="Midnight UTC, the same moment for everyone."
            />
          )}
          <p className="text-sm leading-relaxed text-muted sm:text-right">
            One attempt a day: retrying until it went well would make the score meaningless. The
            streak counts showing up, not passing.
          </p>
        </div>

        <div className="mt-8">
          <DailyHistory record={record} today={today} />
        </div>

        <a href="/copy/" className="mf-btn mf-btn-secondary mf-btn-block mt-8">
          Practise as much as you like
        </a>
      </section>
    )
  }

  /* Not started. */
  if (session.status === 'idle') {
    const source = TEXT_SOURCES[challenge.kind]
    const brief = dailyBrief(
      challenge,
      learnedCount(progress, dailyAlphabet(challenge.kind), Date.now()),
    )
    return (
      <section
        className={`mf-instrument p-5 sm:p-8 ${IDLE_HEIGHT}`}
        aria-labelledby="daily-ready-heading"
      >
        {header}

        {/* The telegram says what the wire is (J-06): which characters, how
            fast. The why of the kind follows from sm up; on a phone it
            would push Start below the first screen (V-02). */}
        <div className="mf-tape mt-5 px-5 pb-5 sm:mt-6 sm:px-7" style={TAPE_INK_VARS}>
          <p className="mf-f-line-no">Telegram · today&rsquo;s traffic</p>
          <h2
            id="daily-ready-heading"
            className="mt-2 font-display text-h2 font-bold tracking-normal text-[var(--tape-hit)]"
          >
            {challenge.prompts.length} lines of {source.name.toLowerCase()}
          </h2>
          <p className="mt-2 max-w-[60ch] font-body text-base leading-relaxed tracking-normal text-[var(--tape-hit)]">
            {brief.set}
          </p>
          <p className="mt-2 hidden max-w-[60ch] font-body text-sm leading-relaxed tracking-normal text-[var(--tape-quiet)] sm:block">
            {source.rationale}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 sm:mt-5">
          <Readout label="Speed" value={challenge.wpm} caption="WPM" />
          <Readout label="Spacing" value={challenge.farnsworthWpm} caption="WPM" />
          <Readout label="To pass" value={`${percent(challenge.passMark)}%`} tone="signal" />
        </div>

        <p className="mt-5 text-sm leading-relaxed text-ink sm:mt-6">
          {brief.readiness} {brief.streak}
        </p>

        <button
          type="button"
          onClick={() => {
            // `today` can be up to a minute stale, or much more after a
            // frozen tab. Starting on it after midnight UTC would play, and
            // record, yesterday's wire. Show the new one instead.
            const day = dailyKey()
            if (day !== today) {
              setLiveDay(day)
              setRemaining(msUntilNext())
              setRolledOver(true)
              return
            }
            setRolledOver(false)
            track('daily_start', challenge.kind)
            setRunDay(today)
            setStatus('active')
            setConfirming(false)
            session.start()
          }}
          // Open in every Signal mode (DEC-045): with Lamp the wire flashes.
          className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block mt-4"
        >
          Start today&rsquo;s wire
        </button>

        {rolledOver && (
          <p className="mt-4 text-sm leading-relaxed text-amber" role="status">
            Midnight UTC has passed, so this is the new wire. Press start again to begin it.
          </p>
        )}

        <p className="mt-4 text-sm leading-relaxed text-muted">
          One attempt. The speed is set by the wire, not by your settings: that is what makes it the
          same for everyone. Next wire in {nextIn}.
        </p>

        <SignalNote signal={settings.signal} unit="line" className="mt-3" />

        <div className="mt-8">
          <DailyHistory record={record} today={today} />
        </div>
      </section>
    )
  }

  /* Running. */
  const answered = session.results.length
  // Once the last line is answered the run is complete: there is nothing left
  // to give up, only the result to see.
  const canGiveUp = answered < challenge.prompts.length
  return (
    <section className="mf-instrument p-5 sm:p-8" aria-label="Daily wire, running">
      <div className="flex items-center justify-between gap-3">
        <span className="mf-engraved">
          Wire No. {dailyNumber(today)} · {challenge.wpm} WPM
        </span>
        {canGiveUp && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mf-btn mf-btn-danger mf-btn-sm"
            aria-expanded={confirming}
            aria-controls={confirming ? 'daily-give-up' : undefined}
          >
            Give up
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <Readout
          label="Line"
          value={session.lineNumber}
          caption={`of ${challenge.prompts.length}`}
        />
        <RunSquares
          results={session.results}
          total={challenge.prompts.length}
          passMark={challenge.passMark}
        />
      </div>

      {confirming && canGiveUp && (
        <GiveUp
          answered={answered}
          total={challenge.prompts.length}
          onKeep={() => {
            setConfirming(false)
            const field = round.input.current
            bringIntoView(field?.closest('section') ?? null, field)
          }}
          onGiveUp={() => {
            setConfirming(false)
            session.stop()
          }}
        />
      )}

      <CopyRound
        session={session}
        round={round}
        nextLabel={answered >= challenge.prompts.length ? 'See how you did' : 'Next line'}
      />
    </section>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * The height of the not-started view, reserved by the server-rendered
 * placeholder so hydrating moves nothing below it (V-20). Just under the
 * set-up's measured height with no history (792 px at 390, 774 to 825 px
 * from 640 to 1440), and the set-up carries the same minimum, so the island
 * can only grow on hydration, never shrink.
 */
const IDLE_HEIGHT = 'min-h-[46rem] sm:min-h-[48rem]'

function formatCountdown(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

/** "Daily wire No. 62 · 2026-10-21 UTC" on the left, the streak lamp on the right. */
function WireHeader({
  today,
  streak,
}: {
  today: string
  streak: { days: number; doneToday: boolean }
}) {
  const caption =
    streak.days === 0
      ? 'Today can be day one.'
      : streak.doneToday
        ? 'Counted for today.'
        : 'Play today to keep it.'

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="mf-engraved">Daily wire</p>
        <p className="mt-1 font-mono text-h3 tabular-nums text-ink">
          No. {dailyNumber(today)}
          <span className="text-muted"> · {today} UTC</span>
        </p>
      </div>
      <div className="mf-readout min-w-44" data-tone={streak.days > 0 ? 'amber' : undefined}>
        <span className="mf-readout-label mf-engraved">
          <Lamp on={streak.days > 0 && streak.doneToday} tone="amber" />
          Daily streak
        </span>
        <span className="mf-readout-value text-h2">
          {streak.days > 0 && <span aria-hidden="true">🔥 </span>}
          {streak.days}
          <span className="text-control text-muted"> {streak.days === 1 ? 'day' : 'days'}</span>
        </span>
        <span className="text-sm text-muted">{caption}</span>
      </div>
    </div>
  )
}

/** Progress through the run: one square per line, dashed until it is answered. */
function RunSquares({
  results,
  total,
  passMark,
}: {
  results: readonly CopyResult[]
  total: number
  passMark: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => {
        const result = results[index]
        return (
          <ToneSquare
            key={index}
            large
            // The grade, not its accuracy: a padded line is 100% accurate
            // but not clean, and must not light up as one.
            tone={result ? lineTone(result.grade, passMark) : 'pending'}
          />
        )
      })}
    </div>
  )
}

function GiveUp({
  answered,
  total,
  onKeep,
  onGiveUp,
}: {
  answered: number
  total: number
  onKeep: () => void
  onGiveUp: () => void
}) {
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => keep.current?.focus(), [])

  return (
    <div
      id="daily-give-up"
      role="alertdialog"
      aria-labelledby="daily-give-up-title"
      aria-describedby="daily-give-up-body"
      className="mf-panel mt-5 p-5"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onKeep()
      }}
    >
      <p id="daily-give-up-title" className="font-display text-h3 font-bold text-ink">
        Give up today&rsquo;s wire?
      </p>
      <p id="daily-give-up-body" className="mt-2 text-sm leading-relaxed text-muted">
        It still counts as today&rsquo;s attempt and keeps your streak, but it is marked incomplete:
        the {total - answered} {total - answered === 1 ? 'line' : 'lines'} you have not answered
        count as missed, and there is no second go today.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button ref={keep} type="button" className="mf-btn mf-btn-primary" onClick={onKeep}>
          Keep going
        </button>
        <button type="button" className="mf-btn mf-btn-danger" onClick={onGiveUp}>
          Give up
        </button>
      </div>
    </div>
  )
}

const STAMP = {
  passed: { text: 'Passed', className: 'text-signal' },
  short: { text: 'On the wire', className: 'text-amber' },
  incomplete: { text: 'Incomplete', className: 'text-amber' },
} as const

function DailyResultView({
  challenge,
  result,
  live,
  earned,
  xp,
  streak,
}: {
  challenge: DailyChallenge
  result: DailyResult
  /** The graded lines, when the run finished on this visit. */
  live: readonly CopyResult[] | null
  earned: readonly Achievement[]
  xp: number
  streak: number
}) {
  const lines = result.lines
  const summary = lines
    ? summarizeDaily({
        date: result.date,
        lines,
        accuracy: result.accuracy,
        passMark: challenge.passMark,
        streak,
        completed: result.completed,
        totalLines: challenge.prompts.length,
      })
    : null
  const completed = result.completed !== false
  const stamp = !completed ? STAMP.incomplete : result.passed ? STAMP.passed : STAMP.short
  const bar = percent(challenge.passMark)

  const verdict = !completed
    ? `Stopped early. Lines not answered count as missed, so this is scored over all ${challenge.prompts.length}.`
    : result.passed
      ? `Over the ${bar}% bar.`
      : `Short of the ${bar}% bar. It is the same wire for everyone today, at a speed nobody chose, so it is not just you.`

  return (
    <>
      <div className="relative mt-6">
        <Screen powerOn grid className="grid place-items-center px-6 py-10 sm:py-12">
          <Readout
            size="xl"
            label="Accuracy"
            value={`${percent(result.accuracy)}%`}
            caption={
              summary
                ? `${summary.overBar} of ${summary.total} lines over the bar · ${summary.clean} clean`
                : undefined
            }
          />
        </Screen>
        <span
          className={`mf-stamp mf-stamp-in absolute -top-3 right-3 bg-panel sm:right-6 ${stamp.className}`}
        >
          {stamp.text}
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">{verdict}</p>

      {summary && (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {summary.tones.map((tone, index) => (
              <ToneSquare key={index} tone={tone} large />
            ))}
          </div>
          <p className="mf-f-legend">
            <span>
              <ToneSquare tone="perfect" /> Clean
            </span>
            <span>
              <ToneSquare tone="pass" /> Over the bar
            </span>
            <span>
              <ToneSquare tone="under" /> Under
            </span>
          </p>
        </div>
      )}

      {(earned.length > 0 || xp > 0) && (
        <ul className="mt-6 space-y-3" aria-label="Earned on this wire">
          {xp > 0 && (
            <li className="font-mono text-control text-amber">
              <span className="mf-slip inline-block">+{xp} XP</span>
            </li>
          )}
          {earned.map((achievement) => (
            <li
              key={achievement.id}
              className="mf-tape mf-slip flex items-center gap-4 px-5 pb-4"
              style={TAPE_INK_VARS}
            >
              <span aria-hidden="true" className="text-3xl">
                {achievement.icon}
              </span>
              <span className="min-w-0 flex-1 font-body tracking-normal">
                <span className="block font-display text-h3 font-bold">{achievement.title}</span>
                <span className="mt-0.5 block text-sm text-[var(--tape-quiet)]">
                  {achievement.description}
                </span>
              </span>
              <span className="mf-f-received">Received</span>
            </li>
          ))}
        </ul>
      )}

      {lines && (
        <div className="mt-6">
          <DailyShare
            input={{
              date: result.date,
              lines,
              accuracy: result.accuracy,
              passMark: challenge.passMark,
              streak,
              completed: result.completed,
              totalLines: challenge.prompts.length,
              wpm: challenge.wpm,
            }}
          />
        </div>
      )}

      <InstallOffer />

      <section className="mt-8" aria-labelledby="daily-lines-heading">
        <h3 id="daily-lines-heading" className="mf-engraved">
          The wire, line by line
        </h3>
        <div className="mt-3">
          <LineList
            label="Lines of today's wire"
            rows={challenge.prompts.map((prompt, index) => {
              const grade = live?.[index]?.grade
              const accuracy = grade?.accuracy ?? lines?.[index] ?? 0
              return {
                text: prompt,
                grade,
                accuracy,
                // A live grade knows whether the line was clean; a stored
                // line score already does.
                tone: lineTone(grade ?? lines?.[index] ?? 0, challenge.passMark),
              }
            })}
          />
        </div>
      </section>
    </>
  )
}

/**
 * "Install" after a finished wire, only when the browser offers it. Nothing is
 * shown otherwise, and it is one quiet line, not a banner.
 */
function InstallOffer() {
  const handle = useInstallPrompt()
  const [gone, setGone] = useState(false)
  if (!handle || gone) return null
  return (
    <p className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted">
      Keep the wire on your home screen; it works offline.
      <button
        type="button"
        className="mf-btn mf-btn-secondary mf-btn-sm"
        onClick={() => void handle.prompt().finally(() => setGone(true))}
      >
        Install
      </button>
    </p>
  )
}
