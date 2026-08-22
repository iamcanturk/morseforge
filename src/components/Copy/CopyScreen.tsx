import { useEffect, useMemo, useState } from 'react'
import { useCopySession } from './useCopySession'
import { CopyRound, useCopyRound } from './CopyRound'
import { AnswerKey } from './AnswerKey'
import { SessionResult } from '../Practice/SessionResult'
import { TEXT_KINDS, TEXT_SOURCES, isAvailable, type TextKind } from '../../data/practiceText'
import { ALL_DIGITS, ALL_LETTERS } from '../../data/morseAlphabet'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import {
  createProgressStore,
  emptyProgress,
  unlockedCharacters,
  type ProgressRecord,
} from '../../storage/progress'

/**
 * Copy practice (PROJECT.md §13).
 *
 * The exercise between knowing the alphabet and reading a QSO: a whole line
 * arrives at once, you write down what you got, and you find out how much of it
 * was right. Nothing else on the site trains holding characters in your head
 * while the next ones are still arriving, which is the actual bottleneck.
 */

const LINE_COUNTS = [5, 10, 20] as const

const POOLS = [
  { id: 'method', label: 'My method' },
  { id: 'letters', label: 'A–Z' },
  { id: 'mixed', label: 'A–Z + 0–9' },
] as const

type PoolId = (typeof POOLS)[number]['id']

export function CopyScreen() {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])

  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)

  const [kind, setKind] = useState<TextKind>('groups')
  const [poolId, setPoolId] = useState<PoolId>('letters')
  const [lines, setLines] = useState<number>(10)

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => {
    setProgress(progressStore.read())
    return progressStore.subscribe(setProgress)
  }, [progressStore])

  const characters = useMemo(() => {
    if (poolId === 'method') return unlockedCharacters(progress)
    if (poolId === 'mixed') return [...ALL_LETTERS, ...ALL_DIGITS]
    return [...ALL_LETTERS]
  }, [poolId, progress])

  const session = useCopySession({ kind, characters, lines })
  const round = useCopyRound(session, {
    wpm: settings.timing.wpm,
    farnsworthWpm: settings.timing.farnsworthWpm,
    enabled: settings.audio.enabled,
    frequency: settings.audio.frequency,
    volume: settings.audio.volume,
  })

  if (session.status === 'finished' && session.summary) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold tracking-tight">
            {session.perfectLines} of {session.results.length} lines copied clean
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Character accuracy is below. A line counts as clean only if every character in it was
            right and you added none that were not sent.
          </p>

          <ul className="mt-5 space-y-2">
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
        </div>

        <SessionResult
          summary={session.summary}
          challenge={false}
          earned={session.earned}
          onAgain={() => {
            session.reset()
            session.start()
          }}
        />
      </div>
    )
  }

  if (session.status === 'idle') {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">What should I send?</h2>

        <div className="mt-6 space-y-6">
          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">TEXT</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {TEXT_KINDS.map((id) => {
                const source = TEXT_SOURCES[id]
                const selected = kind === id
                const available = isAvailable(id, characters)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    disabled={!available}
                    onClick={() => setKind(id)}
                    className="rounded-lg border p-3 text-left transition-colors disabled:opacity-40"
                    style={{
                      borderColor: selected ? 'var(--color-signal)' : 'var(--color-line)',
                      color: selected ? 'var(--color-signal)' : 'var(--color-muted)',
                    }}
                  >
                    <span className="block font-mono text-xs tracking-[0.12em]">
                      {source.name.toUpperCase()}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug opacity-80">
                      {available ? source.summary : 'Needs more characters'}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {TEXT_SOURCES[kind].rationale}
            </p>
          </fieldset>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">
              CHARACTERS
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {POOLS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={poolId === entry.id}
                  onClick={() => setPoolId(entry.id)}
                  className="rounded-lg border px-3 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
                  style={{
                    borderColor: poolId === entry.id ? 'var(--color-signal)' : 'var(--color-line)',
                    color: poolId === entry.id ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  {entry.label.toUpperCase()}
                  {entry.id === 'method' && ` (${unlockedCharacters(progress).length})`}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">LINES</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {LINE_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={lines === count}
                  onClick={() => setLines(count)}
                  className="rounded-lg border px-4 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
                  style={{
                    borderColor: lines === count ? 'var(--color-signal)' : 'var(--color-line)',
                    color: lines === count ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <button
          type="button"
          onClick={session.start}
          className="mt-8 w-full rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          START COPYING
        </button>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Sending at {settings.timing.wpm} WPM
          {settings.timing.farnsworthWpm < settings.timing.wpm &&
            `, spaced out to ${settings.timing.farnsworthWpm}`}
          . Change it in{' '}
          <a href="/settings/" className="text-signal underline underline-offset-4">
            settings
          </a>
          .
        </p>

        {!settings.audio.enabled && (
          <p className="mt-3 text-xs text-amber">
            Sound is off in settings, so nothing will be sent.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          LINE {session.lineNumber} / {lines}
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          {session.perfectLines} CLEAN
        </span>
        <button
          type="button"
          onClick={session.stop}
          className="font-mono text-[10px] tracking-[0.14em] text-muted hover:text-danger"
        >
          END
        </button>
      </div>

      <CopyRound
        session={session}
        round={round}
        nextLabel={session.results.length >= lines ? 'SEE THE RESULT' : 'NEXT LINE'}
      />
    </div>
  )
}
