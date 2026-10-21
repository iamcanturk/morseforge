import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ALL_LETTERS, LEARNING_STAGES, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import { track } from '../../analytics/track'
import {
  createProgressStore,
  emptyProgress,
  unlockedCharacters,
  type ProgressRecord,
} from '../../storage/progress'
import { createStatsStore, type StatsRecord } from '../../storage/stats'
import { Lamp } from '../ui/Lamp'
import { Readout } from '../ui/Readout'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { gameShare, shareLine, shareText, type GameIdentity, type RunReport } from './results'
import { shareData } from '../../game/share'
import '../../styles/pkg-h.css'

/**
 * The parts both games share.
 *
 * Two games with the same character picker, the same cabinet, the same
 * game-over report and the same "practise these next" list. Written once,
 * because the alternative is two of each that drift — and the pool picker in
 * particular has to agree with what practice offers or the games become a
 * separate, easier product.
 */

export interface Pool {
  id: string
  label: string
  characters: readonly string[]
}

/** The first `n` stages of the Signal tree, flattened. */
const throughStage = (n: number): string[] => LEARNING_STAGES.slice(0, n).flat()

/** Fixed pools. Every label is counted from the data, never typed. */
const POOLS: readonly Pool[] = [
  { id: 'stage1', label: throughStage(1).join(' '), characters: throughStage(1) },
  { id: 'stage2', label: `First ${throughStage(2).length}`, characters: throughStage(2) },
  { id: 'stage3', label: `First ${throughStage(3).length}`, characters: throughStage(3) },
  { id: 'all', label: `All ${ALL_LETTERS.length}`, characters: ALL_LETTERS },
]

interface PoolContext {
  pool: Pool
  setPoolId: (id: string) => void
  options: readonly Pool[]
}

const Ctx = createContext<PoolContext | null>(null)

/**
 * Offers the learner's own unlocked set first.
 *
 * A game that drops all 26 letters on someone who has been taught six is
 * not hard, it is just unplayable — and they will read that as being bad at
 * Morse rather than as the game being wrong. The set is read live from the
 * progress store, so it grows with every stage the method unlocks.
 */
export function GamePoolProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createProgressStore(), [])
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)
  const [poolId, setPoolId] = useState('method')

  useEffect(() => {
    setProgress(store.read())
    return store.subscribe(setProgress)
  }, [store])

  const value = useMemo<PoolContext>(() => {
    const characters = unlockedCharacters(progress)
    const mine: Pool = { id: 'method', label: `My method (${characters.length})`, characters }
    const options = [mine, ...POOLS]
    return {
      pool: options.find((entry) => entry.id === poolId) ?? mine,
      setPoolId,
      options,
    }
  }, [progress, poolId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGamePool(): Pool {
  return useContext(Ctx)?.pool ?? POOLS[POOLS.length - 1]!
}

export function PoolPicker() {
  const context = useContext(Ctx)
  const id = useId()
  if (!context) return null

  return (
    <div>
      <p id={id} className="mf-engraved">
        Characters
      </p>
      <Segmented
        className="mt-2.5"
        label="Characters"
        labelledBy={id}
        value={context.pool.id}
        onChange={context.setPoolId}
        options={context.options.map((entry) => ({
          value: entry.id,
          label: entry.label,
          disabled: entry.characters.length === 0,
        }))}
      />
      <p className="mt-2 font-mono text-sm tracking-code break-words text-muted">
        {context.pool.characters.join(' ')}
      </p>
    </div>
  )
}

/** The stats record, live: the cabinet shows the best and the result reads it. */
export function useStats(): StatsRecord | null {
  const store = useMemo(() => createStatsStore(), [])
  const [stats, setStats] = useState<StatsRecord | null>(null)
  useEffect(() => {
    setStats(store.read())
    return store.subscribe(setStats)
  }, [store])
  return stats
}

export const formatScore = (value: number): string => Math.round(value).toLocaleString('en')

/* ---- Cabinet -------------------------------------------------------------- */

/** The engraved plate across the top of the cabinet. */
export function PlateRow({
  title,
  status,
  children,
}: {
  title: ReactNode
  status?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="mf-engraved">{title}</span>
      <span className="flex items-center gap-3">
        {status}
        {children}
      </span>
    </div>
  )
}

/** A lamp and a word: ON AIR, STANDBY. */
export function StatusLamp({
  on,
  tone = 'signal',
  children,
}: {
  on: boolean
  tone?: 'signal' | 'amber' | 'danger'
  children: ReactNode
}) {
  return (
    <span className="mf-engraved flex items-center gap-2">
      <Lamp on={on} tone={tone} />
      {children}
    </span>
  )
}

export function HudCell({
  label,
  children,
  sub,
  tone,
}: {
  label: string
  children: ReactNode
  sub?: ReactNode
  tone?: 'danger' | 'amber'
}) {
  return (
    <div className="gm-hud-cell" data-tone={tone}>
      <span className="mf-engraved">{label}</span>
      <span className="gm-hud-value">
        {children}
        {sub !== undefined && <span className="gm-hud-sub">{sub}</span>}
      </span>
    </div>
  )
}

/** Lives as lamps plus the count: three lamps and two are hard to tell apart under pressure. */
export function LivesCell({ lives, of }: { lives: number; of: number }) {
  const left = Math.max(0, lives)
  return (
    <HudCell label="Lives" tone={left <= 1 ? 'danger' : undefined}>
      <span className="gm-lives" aria-hidden="true">
        {Array.from({ length: of }, (_, index) => (
          <Lamp key={index} on={index < left} tone={left <= 1 ? 'danger' : 'signal'} size="lg" />
        ))}
      </span>
      <span>
        {left}
        <span className="hidden text-muted sm:inline">/{of}</span>
        <span className="sr-only"> lives left</span>
      </span>
    </HudCell>
  )
}

/** The setup face of a cabinet: attract screen, rules, pool, best, start. */
export function GameSetup({
  identity,
  console: consoleName,
  preview,
  rules,
  startLabel,
  onStart,
  note,
}: {
  identity: GameIdentity
  console: string
  preview: ReactNode
  rules: readonly ReactNode[]
  startLabel: string
  onStart: () => void
  note?: ReactNode
}) {
  const stats = useStats()
  const best = stats?.gameBests?.[identity.game]

  return (
    <section className="mf-instrument gm-cabinet p-5 sm:p-8" aria-label={`${identity.name} setup`}>
      <PlateRow
        title={`${identity.name} · ${consoleName}`}
        status={
          <StatusLamp on tone="amber">
            Standby
          </StatusLamp>
        }
      />

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        {/* A desk-only preview: on a phone it would push Start below the fold. */}
        <Screen grid className="gm-field gm-preview hidden sm:block" aria-hidden="true">
          {preview}
        </Screen>

        <div className="flex flex-col gap-6">
          <ol className="order-last grid gap-3 lg:order-none">
            {rules.map((rule, index) => (
              <li key={index} className="grid grid-cols-[auto_1fr] gap-3 leading-relaxed">
                <span className="font-mono text-sm text-brass tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-ink">{rule}</span>
              </li>
            ))}
          </ol>

          <PoolPicker />

          {/* Centred, not stretched: a primary button the height of the
              readout beside it read as a slab, not a control. */}
          <div className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,10rem)_1fr]">
            <Readout
              label="Your best"
              value={best === undefined ? '—' : formatScore(best)}
              tone={best === undefined ? 'ink' : 'amber'}
              className="gap-2 p-3"
            />
            <button
              type="button"
              onClick={onStart}
              className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block"
            >
              {startLabel}
            </button>
          </div>

          {note}
        </div>
      </div>
    </section>
  )
}

/* ---- Game over ------------------------------------------------------------ */

/**
 * One lamp per resolved answer, in order: the screenshot element. Hidden from
 * assistive technology; the counts above it carry the same information.
 */
function OutcomeStrip({ outcomes, caption }: { outcomes: readonly boolean[]; caption: string }) {
  if (outcomes.length === 0) return null
  return (
    <div>
      <div className="gm-strip" aria-hidden="true">
        {outcomes.map((hit, index) =>
          hit ? <Lamp key={index} on /> : <span key={index} className="gm-strip-miss" />,
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{caption}</p>
    </div>
  )
}

/** Share text with a copy fallback, offered once there is a result. Dismissible. */
function SharePanel({
  identity,
  score,
  cleared,
}: {
  identity: GameIdentity
  score: number
  /** 0..1. */
  cleared: number
}) {
  const line = shareLine(identity.name, score, cleared)
  const text = shareText(identity, score, cleared)
  const [open, setOpen] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)
  const [manual, setManual] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Probed after hydration: there is no navigator while this is prerendered.
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  useEffect(() => {
    if (manual) field.current?.select()
  }, [manual])

  const flash = useCallback((message: string) => {
    setStatus(message)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus(null), 2400)
  }, [])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      track('share_copy', identity.game)
      flash('Copied. Paste it anywhere.')
    } catch {
      // No clipboard permission (an insecure origin, an old browser): show the
      // text selected, so a long-press or Ctrl+C still gets it out.
      setManual(true)
      flash('Select the text and copy it.')
    }
  }, [flash, identity.game, text])

  const share = useCallback(async () => {
    track('share_open', identity.game)
    try {
      // The game's link once, as the url (DEC-035); the copied text has it too.
      await navigator.share(shareData(gameShare(identity, score, cleared)))
    } catch (error) {
      // Dismissed: the person's choice, nothing to say. Refused: copy
      // instead, which works or says why, rather than a button that did nothing.
      if (error instanceof DOMException && error.name === 'AbortError') return
      await copy()
    }
  }, [identity, score, cleared, copy])

  if (!open) return null

  return (
    <div className="mf-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="mf-engraved">Send it</span>
        <button
          type="button"
          className="mf-btn mf-btn-ghost mf-btn-sm"
          onClick={() => setOpen(false)}
        >
          Not now
        </button>
      </div>

      {manual ? (
        <textarea
          ref={field}
          readOnly
          rows={2}
          value={text}
          aria-label="Your result, to copy"
          className="mf-input mt-3 w-full font-mono text-sm"
        />
      ) : (
        <p className="mf-tape mt-3 text-sm break-words">{line}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {canShare && (
          <button type="button" className="mf-btn mf-btn-primary" onClick={() => void share()}>
            Share
          </button>
        )}
        <button
          type="button"
          className={canShare ? 'mf-btn mf-btn-secondary' : 'mf-btn mf-btn-primary'}
          onClick={() => void copy()}
        >
          Copy text
        </button>
      </div>

      {/* Mounted with or without a message: a live region that appears at the
          same moment as its content is often not announced. */}
      <p role="status" className={status ? 'mt-3 text-sm text-signal' : 'sr-only'}>
        {status ?? ''}
      </p>
    </div>
  )
}

export interface GameOverProps {
  identity: GameIdentity
  /** Shown on the stamp when the run set no record: "Overrun", "Run over". */
  overLabel: string
  quit: boolean
  score: number
  /** 0..1, the "% cleared" both the screen and the share text quote. */
  cleared: number
  /** One line under the score, e.g. "34 of 37 knocked down". */
  caption: string
  plates: readonly { label: string; value: string; tone?: 'signal' | 'amber' | 'danger' }[]
  outcomes: readonly boolean[]
  stripCaption: string
  report: RunReport
  weakest: readonly { character: string; misses: number }[]
  weakestLabel: string
  onAgain: () => void
  onSetup: () => void
}

/** The run report: §4.1's result instrument, for a game. */
export function GameOver({
  identity,
  overLabel,
  quit,
  score,
  cleared,
  caption,
  plates,
  outcomes,
  stripCaption,
  report,
  weakest,
  weakestLabel,
  onAgain,
  onSetup,
}: GameOverProps) {
  const section = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  // The playing field this replaced had focus (the answer box, the key). Hand
  // it to the report's heading so a screen reader starts here, and so a
  // keystroke meant for the game cannot press "Again" by accident.
  useEffect(() => {
    section.current?.scrollIntoView({ block: 'start' })
    heading.current?.focus({ preventScroll: true })
  }, [])

  const firstRecord = report.isNewBest && report.previousBest === null
  const newBest = report.isNewBest && report.previousBest !== null
  const stamp = newBest ? 'New best' : firstRecord ? 'First record' : quit ? 'Run ended' : overLabel
  const stampTone = report.isNewBest ? 'text-signal' : 'text-amber'
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  return (
    <section
      ref={section}
      className="mf-instrument gm-cabinet p-5 sm:p-8"
      aria-labelledby="game-report-title"
    >
      <PlateRow title={`${identity.name} · Run report`}>
        <span className="font-mono text-sm text-muted tabular-nums">{today}</span>
      </PlateRow>

      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="grid content-start gap-5">
          <Screen grid powerOn className="px-6 pt-8 pb-7 text-center">
            <span
              className={`mf-stamp mf-stamp-in gm-stamp absolute top-3 right-3 sm:top-4 sm:right-4 ${stampTone}`}
              aria-hidden="true"
            >
              {stamp}
            </span>
            <h2 id="game-report-title" ref={heading} tabIndex={-1} className="mf-engraved">
              Score
            </h2>
            <p className="mf-phosphor mt-3 font-mono text-readout-xl text-signal tabular-nums">
              {formatScore(score)}
            </p>
            <p className="mt-3 text-base text-ink sm:text-lead">{caption}</p>
            <p className="mt-2 text-sm text-muted">
              {newBest && report.previousBest !== null && (
                <>
                  <strong className="text-signal">New best!</strong> Your previous best was{' '}
                  {formatScore(report.previousBest)}.
                </>
              )}
              {firstRecord && <>Your first recorded run. That is the number to beat.</>}
              {!report.isNewBest && report.previousBest !== null && (
                <>Your best is {formatScore(report.previousBest)}.</>
              )}
              {!report.isNewBest && report.previousBest === null && !report.banked && (
                <>Nothing was answered, so this run was not counted.</>
              )}
            </p>
          </Screen>

          <OutcomeStrip outcomes={outcomes} caption={stripCaption} />

          <div className="grid grid-cols-3 gap-3">
            {plates.map((plate) => (
              <Readout
                key={plate.label}
                label={plate.label}
                value={plate.value}
                tone={plate.tone}
                className="p-3"
              />
            ))}
          </div>
        </div>

        <div className="grid content-start gap-5">
          {report.banked && (
            <ul className="grid gap-3" aria-label="Banked">
              <li className="mf-tape mf-slip flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-lg font-semibold">+{formatScore(report.xp)} XP</span>
                <span className="text-sm">
                  Streak: {report.streak} {report.streak === 1 ? 'day' : 'days'}
                </span>
              </li>
              {report.earned.map((achievement) => (
                <li key={achievement.id} className="relative">
                  <div className="mf-tape mf-slip grid grid-cols-[auto_1fr] items-center gap-3 pr-24">
                    <span className="text-2xl" aria-hidden="true">
                      {achievement.icon}
                    </span>
                    <span className="grid gap-0.5 tracking-normal">
                      <strong className="font-display text-base">{achievement.title}</strong>
                      <span className="font-body text-sm">{achievement.description}</span>
                    </span>
                  </div>
                  <span
                    className="mf-stamp mf-stamp-in gm-stamp gm-stamp-sm absolute top-1/2 right-3 -translate-y-1/2 bg-panel text-signal"
                    aria-hidden="true"
                  >
                    Received
                  </span>
                  <span className="sr-only">Achievement earned.</span>
                </li>
              ))}
            </ul>
          )}

          {weakest.length > 0 && (
            <div>
              <p className="mf-engraved">{weakestLabel}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {weakest.slice(0, 8).map(({ character, misses }) => (
                  <li key={character} className="mf-kbd gap-2 px-2.5 py-1">
                    <span className="font-display text-base font-bold">{character}</span>
                    <span className="tracking-code text-cyan">
                      {prettify(MORSE_ALPHABET[character] ?? '')}
                    </span>
                    <span className="text-muted">×{misses}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                A game is a measurement, not a lesson.{' '}
                <a href="/practice/" className="text-signal underline underline-offset-4">
                  Practice
                </a>{' '}
                is where these get fixed: it waits for you, which is exactly what this does not.
              </p>
            </div>
          )}

          {report.banked && <SharePanel identity={identity} score={score} cleared={cleared} />}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onAgain}
              className="mf-btn mf-btn-primary mf-btn-lg flex-1"
            >
              Again
            </button>
            <button type="button" onClick={onSetup} className="mf-btn mf-btn-secondary mf-btn-lg">
              Change setup
            </button>
          </div>

          <p className="text-sm text-muted">Saved to this browser only.</p>
        </div>
      </div>
    </section>
  )
}
