import { useEffect, useMemo, useState } from 'react'
import { ALL_LETTERS } from '../../data/morseAlphabet'
import { evaluate } from '../../game/achievements'
import { currentStreak, levelProgress } from '../../game/progression'
import {
  createProgressStore,
  emptyProgress,
  masteredCharacters,
  overallMastery,
  type ProgressRecord,
} from '../../storage/progress'
import {
  createStatsStore,
  defaultStats,
  lifetimeAccuracy,
  type StatsRecord,
} from '../../storage/stats'
import { achievementSnapshot } from '../../storage/snapshot'

/**
 * The stats dashboard (PROJECT.md §20, §49).
 *
 * XP, levels and achievements were all being computed and stored, and none of
 * them were rendered anywhere — learners had been earning them invisibly. This
 * is where they finally surface.
 */
export function StatsScreen() {
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])

  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)
  const [stats, setStats] = useState<StatsRecord>(defaultStats)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setProgress(progressStore.read())
    setStats(statsStore.read())
    setReady(true)
    const off = [progressStore.subscribe(setProgress), statsStore.subscribe(setStats)]
    return () => off.forEach((fn) => fn())
  }, [progressStore, statsStore])

  const now = Date.now()
  const mastered = useMemo(
    () => masteredCharacters(progress, ALL_LETTERS, now).length,
    [progress, now],
  )

  // Built by the same function the result screen uses, so the two can never
  // disagree about whether something has been earned.
  const achievements = useMemo(
    () => evaluate(achievementSnapshot(progress, stats, now)),
    [progress, stats, now],
  )
  const level = levelProgress(stats.xp)
  const streak = currentStreak(stats.streak, now)
  const accuracy = Math.round(lifetimeAccuracy(stats) * 100)
  const power = Math.round(overallMastery(progress, ALL_LETTERS, now) * 100)
  const minutes = Math.round(stats.practiceMs / 60_000)
  const earned = achievements.filter((a) => a.isEarned).length

  if (!ready) {
    return <p className="font-mono text-xs tracking-[0.16em] text-muted">LOADING</p>
  }

  const nothingYet = stats.sessions === 0 && stats.elementsSent === 0

  return (
    <div className="space-y-12">
      {/* Level and XP. */}
      <section className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted">LEVEL</span>
            <p className="font-display text-5xl font-bold text-signal">{level.level}</p>
          </div>
          <p className="font-mono text-xs text-muted">
            {level.into} / {level.span} XP to level {level.level + 1}
          </p>
        </div>

        <div
          className="mt-4 h-2 overflow-hidden rounded-full"
          style={{ background: 'var(--color-line)' }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level.fraction * 100)}
          aria-label={`Level ${level.level} progress`}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${level.fraction * 100}%`, background: 'var(--color-signal)' }}
          />
        </div>

        <p className="mt-3 font-mono text-[11px] tracking-[0.14em] text-signal-dim">
          {stats.xp} XP TOTAL
        </p>
      </section>

      {/* The §20 numbers. */}
      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">Where you are</h2>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'STREAK', value: streak > 0 ? `🔥 ${streak}` : '—' },
            { label: 'MASTERED', value: `${mastered} / 26` },
            { label: 'NETWORK', value: `⚡ ${power}%` },
            { label: 'ACCURACY', value: stats.totalAnswers > 0 ? `${accuracy}%` : '—' },
            {
              label: 'BEST SPEED',
              value: stats.bestWpm > 0 ? `${Math.round(stats.bestWpm)} WPM` : '—',
            },
            { label: 'PRACTISED', value: minutes > 0 ? `${minutes} min` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-line bg-panel p-4">
              <dt className="font-mono text-[10px] tracking-[0.16em] text-muted">{label}</dt>
              <dd className="mt-1.5 font-display text-2xl font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        {nothingYet && (
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Nothing here yet. A single session fills most of this in.
          </p>
        )}
      </section>

      {/* Achievements. */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold tracking-tight">Achievements</h2>
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted">
            {earned} / {achievements.length}
          </span>
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {achievements.map((achievement) => (
            <li
              key={achievement.id}
              className="rounded-xl border p-4 transition-colors"
              style={{
                borderColor: achievement.isEarned ? 'var(--color-signal)' : 'var(--color-line)',
                background: 'var(--color-panel)',
              }}
            >
              <div className="flex items-start gap-3">
                {/* Dimmed rather than hidden while locked: knowing what is left
                    is the point of a list like this. */}
                <span
                  aria-hidden="true"
                  className="text-2xl"
                  style={{ opacity: achievement.isEarned ? 1 : 0.3 }}
                >
                  {achievement.icon}
                </span>
                <div className="min-w-0">
                  <p
                    className="font-display text-sm font-semibold"
                    style={{
                      color: achievement.isEarned ? 'var(--color-signal)' : 'var(--color-muted)',
                    }}
                  >
                    {achievement.title}
                    {/* Earned state was carried by colour and opacity alone, so
                        it read identically to a locked one both to a screen
                        reader and to anyone who cannot separate the greens. */}
                    <span className="sr-only">
                      {achievement.isEarned
                        ? ', earned'
                        : `, locked, ${Math.round(achievement.fraction * 100)} percent`}
                    </span>
                    {achievement.isEarned && (
                      <span aria-hidden="true" className="ml-2 font-mono text-[10px]">
                        ✓
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {achievement.description}
                  </p>

                  {!achievement.isEarned && achievement.fraction > 0 && (
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(achievement.fraction * 100)}
                      aria-label={`${achievement.title} progress`}
                      className="mt-2.5 h-1 overflow-hidden rounded-full"
                      style={{ background: 'var(--color-line)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${achievement.fraction * 100}%`,
                          background: 'var(--color-signal-dim)',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-muted">
        All of this is stored in this browser and nowhere else. Export a copy from{' '}
        <a href="/settings/" className="text-signal underline underline-offset-4">
          settings
        </a>{' '}
        if you care about keeping it.
      </p>
    </div>
  )
}
