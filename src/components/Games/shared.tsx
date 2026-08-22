import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ALL_LETTERS, LEARNING_STAGES } from '../../data/morseAlphabet'
import {
  createProgressStore,
  emptyProgress,
  unlockedCharacters,
  type ProgressRecord,
} from '../../storage/progress'

/**
 * The parts both games share.
 *
 * Two games with the same character picker, the same game-over card and the
 * same "practise these next" list. Written once, because the alternative is
 * two of each that drift — and the pool picker in particular has to agree with
 * what practice offers or the games become a separate, easier product.
 */

export interface Pool {
  id: string
  label: string
  characters: readonly string[]
}

const POOLS: readonly Pool[] = [
  { id: 'stage1', label: 'E T', characters: LEARNING_STAGES[0]! },
  {
    id: 'stage2',
    label: 'First 6',
    characters: [...LEARNING_STAGES[0]!, ...LEARNING_STAGES[1]!],
  },
  {
    id: 'stage3',
    label: 'First 14',
    characters: [...LEARNING_STAGES[0]!, ...LEARNING_STAGES[1]!, ...LEARNING_STAGES[2]!],
  },
  { id: 'all', label: 'All 26', characters: ALL_LETTERS },
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
 * A game that drops all 26 characters on someone who has been taught six is
 * not hard, it is just unplayable — and they will read that as being bad at
 * Morse rather than as the game being wrong.
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
    const mine: Pool = {
      id: 'method',
      label: `My method (${unlockedCharacters(progress).length})`,
      characters: unlockedCharacters(progress),
    }
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
  return useContext(Ctx)?.pool ?? { id: 'all', label: 'All 26', characters: ALL_LETTERS }
}

export function PoolPicker() {
  const context = useContext(Ctx)
  if (!context) return null

  return (
    <fieldset>
      <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">CHARACTERS</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {context.options.map((entry) => {
          const selected = context.pool.id === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={selected}
              disabled={entry.characters.length === 0}
              onClick={() => context.setPoolId(entry.id)}
              className="rounded-lg border px-3 py-2 font-mono text-xs tracking-[0.12em] transition-colors disabled:opacity-40"
              style={{
                borderColor: selected ? 'var(--color-signal)' : 'var(--color-line)',
                color: selected ? 'var(--color-signal)' : 'var(--color-muted)',
              }}
            >
              {entry.label.toUpperCase()}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** The card at the end of a run. */
export function GameOver({
  title,
  stats,
  weakest,
  onAgain,
  onQuit,
}: {
  title: string
  stats: readonly { label: string; value: string }[]
  weakest: readonly { character: string; misses: number }[]
  onAgain: () => void
  onQuit: () => void
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line p-4">
            <dt className="font-mono text-[10px] tracking-[0.16em] text-muted">{label}</dt>
            <dd className="mt-1.5 font-display text-2xl font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {weakest.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted">WHAT GOT PAST YOU</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {weakest.slice(0, 8).map(({ character, misses }) => (
              <li
                key={character}
                className="rounded-lg border px-3 py-1.5 font-mono text-xs"
                style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
              >
                {character}
                <span className="ml-2 text-muted">×{misses}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            A game is a measurement, not a lesson.{' '}
            <a href="/practice/" className="text-signal underline underline-offset-4">
              Practice
            </a>{' '}
            is where these get fixed — it waits for you, which is exactly what this does not.
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="flex-1 rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          AGAIN
        </button>
        <button
          type="button"
          onClick={onQuit}
          className="rounded-lg border border-line px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-muted transition-colors hover:border-signal hover:text-signal"
        >
          CHANGE SETUP
        </button>
      </div>
    </div>
  )
}
