import { useEffect, useMemo, useState } from 'react'
import { useCopySession } from '../Copy/useCopySession'
import { CopyRound, useCopyRound } from '../Copy/CopyRound'
import { AnswerKey } from '../Copy/AnswerKey'
import { dailyChallenge, dailyKey, msUntilNext } from '../../game/dailyChallenge'
import { TEXT_SOURCES } from '../../data/practiceText'
import { ALL_LETTERS } from '../../data/morseAlphabet'
import {
  createDailyStore,
  dailyStreak,
  emptyDaily,
  recordDaily,
  resultFor,
  type DailyRecord,
} from '../../storage/daily'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'

/**
 * The daily challenge (PROJECT.md §19).
 *
 * Everyone gets the same eight lines at the same speed, generated from the UTC
 * date. There is no backend and nothing is fetched, so it works offline and
 * cannot go down.
 *
 * Speed comes from the challenge, not from your settings — the point is that it
 * is the same for everyone. Sound settings still apply, because a challenge
 * that ignored your volume would just be loud.
 */
export function DailyScreen() {
  const store = useMemo(() => createDailyStore(), [])
  const settingsStore = useMemo(() => createSettingsStore(), [])

  const [record, setRecord] = useState<DailyRecord>(emptyDaily)
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [ready, setReady] = useState(false)

  // The date is read after mount, not during render: this page is prerendered
  // at build time, and baking that day's challenge into the HTML would serve
  // everyone the build date's challenge forever.
  const [today, setToday] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number>(0)

  useEffect(() => {
    setRecord(store.read())
    setSettings(settingsStore.read())
    setToday(dailyKey())
    setRemaining(msUntilNext())
    setReady(true)
    const off = [store.subscribe(setRecord), settingsStore.subscribe(setSettings)]
    return () => off.forEach((fn) => fn())
  }, [store, settingsStore])

  // Ticks once a minute: this is a "come back tomorrow" countdown, and a
  // per-second timer would keep the tab awake to change a number nobody is
  // watching.
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(msUntilNext())
      setToday(dailyKey())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const challenge = useMemo(() => (today === null ? null : dailyChallenge(today)), [today])

  const session = useCopySession({
    kind: challenge?.kind ?? 'groups',
    characters: ALL_LETTERS,
    lines: challenge?.prompts.length ?? 8,
    prompts: challenge?.prompts,
  })

  const round = useCopyRound(session, {
    wpm: challenge?.wpm ?? 18,
    farnsworthWpm: challenge?.farnsworthWpm ?? 9,
    enabled: settings.audio.enabled,
    frequency: settings.audio.frequency,
    volume: settings.audio.volume,
  })

  const alreadyDone = today === null ? null : resultFor(record, today)

  // Bank the attempt the moment it finishes. `recordDaily` refuses a second
  // write for the same day, so a reload cannot improve the score.
  const { status, summary } = session
  useEffect(() => {
    if (status !== 'finished' || !summary || today === null || challenge === null) return
    store.update((current) =>
      recordDaily(current, {
        date: today,
        accuracy: summary.accuracy,
        score: summary.score,
        passed: summary.total > 0 && summary.accuracy >= challenge.passMark,
      }),
    )
  }, [status, summary, today, challenge, store])

  if (!ready || challenge === null || today === null) {
    return <p className="font-mono text-xs tracking-[0.16em] text-muted">LOADING TODAY</p>
  }

  const streak = dailyStreak(record, today)
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const countdown = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

  const heading = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className="font-mono text-[10px] tracking-[0.18em] text-muted">{today} · UTC</span>
      <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
        {streak > 0 ? `🔥 ${streak} DAY${streak === 1 ? '' : 'S'}` : 'NO RUN YET'}
      </span>
    </div>
  )

  /* Finished, either just now or on an earlier visit. */
  if (session.status === 'finished' && session.summary) {
    const passed = session.summary.accuracy >= challenge.passMark
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        {heading}

        <p
          className="mt-6 font-display text-5xl font-bold"
          style={{ color: passed ? 'var(--color-signal)' : 'var(--color-ink)' }}
        >
          {Math.round(session.summary.accuracy * 100)}%
        </p>
        <p className="mt-1 text-sm text-muted">
          {passed
            ? `Passed — the bar was ${Math.round(challenge.passMark * 100)}%.`
            : `Short of the ${Math.round(challenge.passMark * 100)}% bar. It is the same challenge for everyone today, so it is not just you.`}
        </p>

        <ul className="mt-6 space-y-2">
          {session.results.map((result, index) => (
            <li
              key={`${result.text}-${index}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line px-3 py-2"
            >
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
              <AnswerKey grade={result.grade} compact />
              <span
                className="ml-auto font-mono text-[11px] tabular-nums"
                style={{
                  color: result.grade.perfect ? 'var(--color-signal)' : 'var(--color-muted)',
                }}
              >
                {Math.round(result.grade.accuracy * 100)}%
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm leading-relaxed text-muted">
          Next challenge in {countdown}. One attempt a day — retrying until it went well would make
          the score meaningless, and the streak counts showing up rather than passing.
        </p>

        <a
          href="/copy/"
          className="mt-6 block w-full rounded-lg border px-6 py-3 text-center font-mono text-xs tracking-[0.14em]"
          style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
        >
          PRACTISE AS MUCH AS YOU LIKE
        </a>
      </div>
    )
  }

  /* Already attempted today, in an earlier visit. */
  if (session.status === 'idle' && alreadyDone) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        {heading}

        <p className="mt-6 font-display text-2xl font-bold tracking-tight">
          You have done today&rsquo;s.
        </p>
        <p
          className="mt-4 font-display text-5xl font-bold"
          style={{ color: alreadyDone.passed ? 'var(--color-signal)' : 'var(--color-ink)' }}
        >
          {Math.round(alreadyDone.accuracy * 100)}%
        </p>
        <p className="mt-1 text-sm text-muted">
          {alreadyDone.passed
            ? 'Passed.'
            : `Short of the ${Math.round(challenge.passMark * 100)}% bar.`}{' '}
          Next one in {countdown}.
        </p>

        <History record={record} today={today} />

        <a
          href="/copy/"
          className="mt-6 block w-full rounded-lg px-6 py-3.5 text-center font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          KEEP PRACTISING
        </a>
      </div>
    )
  }

  /* Not started. */
  if (session.status === 'idle') {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        {heading}

        <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">
          {challenge.prompts.length} lines of {TEXT_SOURCES[challenge.kind].name.toLowerCase()}
        </h2>
        <p className="mt-3 leading-relaxed text-muted">{TEXT_SOURCES[challenge.kind].rationale}</p>

        <dl className="mt-6 grid grid-cols-3 gap-4">
          {[
            { label: 'SPEED', value: `${challenge.wpm} WPM` },
            { label: 'SPACED TO', value: `${challenge.farnsworthWpm}` },
            { label: 'TO PASS', value: `${Math.round(challenge.passMark * 100)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-line p-4">
              <dt className="font-mono text-[10px] tracking-[0.16em] text-muted">{label}</dt>
              <dd className="mt-1.5 font-display text-xl font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <History record={record} today={today} />

        <button
          type="button"
          onClick={session.start}
          className="mt-8 w-full rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          START TODAY&rsquo;S
        </button>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          One attempt. The speed is set by the challenge, not by your settings — that is the point
          of everyone getting the same one. Next challenge in {countdown}.
        </p>

        {!settings.audio.enabled && (
          <p className="mt-3 text-xs text-amber">
            Sound is off in settings, so nothing will be sent.
          </p>
        )}
      </div>
    )
  }

  /* Running. */
  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          LINE {session.lineNumber} / {challenge.prompts.length}
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          {challenge.wpm} WPM
        </span>
        <button
          type="button"
          onClick={session.stop}
          className="font-mono text-[10px] tracking-[0.14em] text-muted hover:text-danger"
        >
          GIVE UP
        </button>
      </div>

      <CopyRound
        session={session}
        round={round}
        nextLabel={
          session.results.length >= challenge.prompts.length ? 'SEE HOW YOU DID' : 'NEXT LINE'
        }
      />
    </div>
  )
}

/**
 * The last fortnight, oldest to newest.
 *
 * Attempted days are marked whether or not they passed — the streak counts
 * showing up, and a strip that only lit on a pass would say the opposite.
 */
function History({ record, today }: { record: DailyRecord; today: string }) {
  const days: { date: string; result: ReturnType<typeof resultFor> }[] = []
  const cursor = new Date(`${today}T00:00:00Z`)
  cursor.setUTCDate(cursor.getUTCDate() - 13)

  for (let i = 0; i < 14; i++) {
    const date = cursor.toISOString().slice(0, 10)
    days.push({ date, result: resultFor(record, date) })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  if (days.every((day) => day.result === null)) return null

  return (
    <div className="mt-6">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted">LAST 14 DAYS</p>
      <ol className="mt-3 flex flex-wrap gap-1.5">
        {days.map(({ date, result }) => (
          <li
            key={date}
            title={
              result === null
                ? `${date}: not attempted`
                : `${date}: ${Math.round(result.accuracy * 100)}%${result.passed ? ', passed' : ''}`
            }
            className="h-6 w-6 rounded"
            style={{
              background:
                result === null
                  ? 'var(--color-line)'
                  : result.passed
                    ? 'var(--color-signal)'
                    : 'var(--color-signal-dim)',
              opacity: result === null ? 0.5 : 1,
            }}
          >
            <span className="sr-only">
              {result === null
                ? `${date}: not attempted.`
                : `${date}: ${Math.round(result.accuracy * 100)} percent${result.passed ? ', passed' : ''}.`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
