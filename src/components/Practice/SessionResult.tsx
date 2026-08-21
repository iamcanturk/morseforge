import { useEffect, useMemo, useState } from 'react'
import type { SessionSummary } from '../../game/session'
import { AUTHOR } from '../../config/site'
import { prettify } from '../../engine/morseEncoder'
import { ALL_LETTERS, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { ShareCard } from '../Share/ShareCard'
import { currentStreak } from '../../game/progression'
import { createStatsStore } from '../../storage/stats'
import { createProgressStore, masteredCharacters } from '../../storage/progress'

/**
 * The result screen (PROJECT.md §20, §35).
 *
 * Accuracy is the headline, not the score. §34 puts accuracy above speed, and a
 * result screen that leads with a big number teaches the opposite of what the
 * scoring is trying to.
 */
export function SessionResult({
  summary,
  challenge,
  onAgain,
}: {
  summary: SessionSummary
  challenge: boolean
  onAgain: () => void
}) {
  const accuracy = Math.round(summary.accuracy * 100)
  const wpm = Math.round(summary.wpm * 10) / 10

  // Read after mount: the stores are empty during prerender, and the session
  // that just finished has already written into them by the time this renders.
  const [streak, setStreak] = useState(0)
  const [mastered, setMastered] = useState(0)

  useEffect(() => {
    const stats = createStatsStore().read()
    setStreak(currentStreak(stats.streak, Date.now()))
    setMastered(masteredCharacters(createProgressStore().read(), ALL_LETTERS).length)
  }, [])

  const cardData = useMemo(
    () => ({
      accuracy: summary.accuracy,
      correct: summary.correct,
      total: summary.total,
      wpm: summary.wpm,
      streak,
      mastered,
      challenge,
    }),
    [summary, streak, mastered, challenge],
  )

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted">
        {challenge ? 'SIXTY SECONDS' : 'SESSION'}
      </h2>

      {/* Accuracy first and largest. Leading with the score would teach people
          to optimise the thing §34 deliberately caps. */}
      <p className="mt-4 font-display text-6xl font-bold text-signal">{accuracy}%</p>
      <p className="mt-1 text-sm text-muted">
        {summary.correct} correct of {summary.total}
      </p>

      <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6">
        <div>
          <dt className="font-mono text-[10px] tracking-[0.16em] text-muted">SPEED</dt>
          <dd className="mt-1 font-display text-xl font-semibold text-ink">{wpm} WPM</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.16em] text-muted">SCORE</dt>
          <dd className="mt-1 font-display text-xl font-semibold text-ink">{summary.score}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.16em] text-muted">
            {streak > 0 ? 'STREAK' : 'TIME'}
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold text-ink">
            {streak > 0 ? `🔥 ${streak}` : `${Math.round(summary.elapsedMs / 1000)}s`}
          </dd>
        </div>
      </dl>

      {summary.weakest.length > 0 && (
        <section className="mt-8 border-t border-line pt-6">
          <h3 className="font-mono text-[10px] tracking-[0.18em] text-muted">PRACTISE THESE</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {summary.weakest.slice(0, 8).map(({ character, misses }) => (
              <li
                key={character}
                className="rounded-lg border border-line px-3 py-2 text-center"
                title={`missed ${misses} time${misses === 1 ? '' : 's'}`}
              >
                <span className="block font-display text-lg font-bold text-danger">
                  {character}
                </span>
                <span className="block font-mono text-[10px] tracking-[0.14em] text-cyan">
                  {prettify(MORSE_ALPHABET[character] ?? '')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.total === 0 && (
        <p className="mt-6 text-sm leading-relaxed text-muted">
          Nothing answered. If the prompts were silent, check that sound is on in settings.
        </p>
      )}

      {summary.total > 0 && (
        <section className="mt-8 border-t border-line pt-6">
          <h3 className="font-mono text-[10px] tracking-[0.18em] text-muted">SHARE IT</h3>
          <div className="mt-4">
            <ShareCard data={cardData} />
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-lg px-6 py-3 font-mono text-xs tracking-[0.14em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          AGAIN
        </button>

        <a
          href="/learn-morse-code-in-7-days/"
          className="rounded-lg border border-line px-6 py-3 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-signal hover:text-signal"
        >
          LEARN MORE CHARACTERS
        </a>
      </div>

      <p className="mt-6 text-xs text-muted">
        Saved to this browser only — nothing was sent anywhere. Built by{' '}
        <a href={AUTHOR.url} rel="me" className="text-ink underline underline-offset-4">
          {AUTHOR.name}
        </a>
        .
      </p>
    </div>
  )
}
