import { useEffect, useMemo, useRef, useState } from 'react'
import { useCopySession } from './useCopySession'
import { CopyRound, useCopyRound } from './CopyRound'
import { LineList } from './LineList'
import { copyLineTone } from './copySession'
import { SignalNote } from './SignalNote'
import { SessionResult } from '../Practice/SessionResult'
import { OptionGroup } from '../ui/OptionGroup'
import { Readout } from '../ui/Readout'
import { Segmented } from '../ui/Segmented'
import { TEXT_KINDS, TEXT_SOURCES, isAvailable, type TextKind } from '../../data/practiceText'
import { ALL_DIGITS, ALL_LETTERS } from '../../data/morseAlphabet'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import {
  createProgressStore,
  emptyProgress,
  unlockedCharacters,
  type ProgressRecord,
} from '../../storage/progress'
import { track } from '../../analytics/track'

/**
 * Copy practice (PROJECT.md §13).
 *
 * The exercise between knowing the alphabet and reading a QSO: a whole line
 * arrives at once, you write down what you got, and you find out how much of it
 * was right. Nothing else on the site trains holding characters in your head
 * while the next ones are still arriving, which is the actual bottleneck.
 */

const LINE_COUNTS = [5, 10, 20] as const

type PoolId = 'method' | 'letters' | 'mixed'

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

  const unlocked = useMemo(() => unlockedCharacters(progress), [progress])
  const characters = useMemo(() => {
    if (poolId === 'method') return unlocked
    if (poolId === 'mixed') return [...ALL_LETTERS, ...ALL_DIGITS]
    return [...ALL_LETTERS]
  }, [poolId, unlocked])

  // A pool that shrinks under the chosen kind (switching to "My method" with
  // six characters, say) would otherwise leave an unavailable kind selected.
  useEffect(() => {
    if (!isAvailable(kind, characters)) setKind('groups')
  }, [kind, characters])

  const session = useCopySession({ kind, characters, lines })
  const round = useCopyRound(session, {
    settings,
    wpm: settings.timing.wpm,
    farnsworthWpm: settings.timing.farnsworthWpm,
  })

  // The round this replaces held focus (the answer box or "See how you
  // did"). Hand it to the report's heading, so the result is what a keyboard
  // or screen-reader user meets next rather than <body>.
  const reportHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (session.status === 'finished') reportHeading.current?.focus()
  }, [session.status])

  if (session.status === 'finished' && session.summary) {
    const answered = session.results.length
    return (
      <div className="space-y-8">
        <section className="mf-instrument p-6 sm:p-8" aria-labelledby="copy-lines-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="mf-engraved">Copy report</span>
            <span className="mf-engraved">{TEXT_SOURCES[kind].name}</span>
          </div>
          <h2
            id="copy-lines-heading"
            ref={reportHeading}
            tabIndex={-1}
            className="mt-4 font-display text-h2 font-bold text-ink"
          >
            {session.perfectLines} of {answered} {answered === 1 ? 'line' : 'lines'} copied clean
          </h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted">
            {session.completed
              ? 'A line is clean only if every character in it was right and you added none that were not sent.'
              : `Ended after ${answered} of ${lines} lines. The figures below cover the lines you answered.`}
          </p>

          {answered > 0 && (
            <div className="mt-6">
              <LineList
                label="Lines copied"
                rows={session.results.map((result) => ({
                  text: result.text,
                  grade: result.grade,
                  accuracy: result.grade.accuracy,
                  tone: copyLineTone(result.grade),
                }))}
              />
            </div>
          )}
        </section>

        {/* No share sheet here. Its default invites a friend to a 60-second
            single-character challenge, which is not what was played, and a
            free copy run at self-chosen settings is not comparable with anyone
            else's. The shareable, comparable copy result is the daily wire. */}
        <SessionResult
          summary={session.summary}
          challenge={false}
          earned={session.earned}
          share={null}
          onAgain={() => {
            session.reset()
            track('copy_start', kind)
            session.start()
          }}
        />
      </div>
    )
  }

  if (session.status === 'idle') {
    return (
      <section className="mf-instrument p-5 sm:p-8" aria-labelledby="copy-setup-heading">
        <span className="mf-engraved">Copy desk</span>
        <h2 id="copy-setup-heading" className="mt-3 font-display text-h2 font-bold text-ink">
          What should I send?
        </h2>

        {/* Compact on a phone (V-02): tighter rhythm, and only the chosen
            text kind keeps its hint (mf-f-kinds), so "Start copying" sits
            within the first screen and a bit. */}
        <div className="mt-6 space-y-6 sm:mt-8 sm:space-y-8">
          <div>
            <p id="copy-kind" className="mf-engraved">
              Text
            </p>
            <OptionGroup
              labelledBy="copy-kind"
              label="Text"
              className="mf-f-kinds mt-3"
              columns={2}
              value={kind}
              onChange={setKind}
              options={TEXT_KINDS.map((id) => ({
                value: id,
                title: TEXT_SOURCES[id].name,
                hint: TEXT_SOURCES[id].summary,
                disabled: !isAvailable(id, characters),
                disabledHint: 'Needs more characters than this pool has',
              }))}
            />
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted">
              {TEXT_SOURCES[kind].rationale}
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-[1fr_auto]">
            <div>
              <p id="copy-pool" className="mf-engraved">
                Characters
              </p>
              <Segmented
                labelledBy="copy-pool"
                label="Characters"
                className="mf-f-pool mt-3"
                value={poolId}
                onChange={setPoolId}
                options={[
                  { value: 'method', label: `My method (${unlocked.length})` },
                  { value: 'letters', label: 'A–Z', ariaLabel: 'Letters A to Z' },
                  {
                    value: 'mixed',
                    label: 'A–Z + 0–9',
                    ariaLabel: 'Letters and digits',
                  },
                ]}
              />
            </div>
            <div>
              <p id="copy-lines" className="mf-engraved">
                Lines
              </p>
              <Segmented
                labelledBy="copy-lines"
                label="Lines"
                className="mt-3"
                value={lines}
                onChange={setLines}
                options={LINE_COUNTS.map((count) => ({ value: count, label: String(count) }))}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            track('copy_start', kind)
            session.start()
          }}
          className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block mt-8 sm:mt-10"
        >
          Start copying
        </button>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          Sending at {settings.timing.wpm} WPM
          {settings.timing.farnsworthWpm < settings.timing.wpm &&
            `, spaced out to ${settings.timing.farnsworthWpm}`}
          . Change it in{' '}
          <a href="/settings/" className="text-signal underline underline-offset-4">
            settings
          </a>
          .
        </p>

        <SignalNote signal={settings.signal} unit="line" className="mt-3" />
      </section>
    )
  }

  return (
    <section className="mf-instrument p-5 sm:p-8" aria-label="Copy practice, running">
      <div className="flex items-center justify-between gap-3">
        <span className="mf-engraved">{TEXT_SOURCES[kind].name}</span>
        <button type="button" onClick={session.stop} className="mf-btn mf-btn-danger mf-btn-sm">
          End
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Readout label="Line" value={session.lineNumber} caption={`of ${lines}`} />
        <Readout label="Clean" value={session.perfectLines} tone="signal" />
        <Readout label="WPM" value={settings.timing.wpm} />
      </div>

      <CopyRound
        session={session}
        round={round}
        nextLabel={session.results.length >= lines ? 'See the result' : 'Next line'}
      />
    </section>
  )
}
