import { useEffect, useMemo, useState } from 'react'
import { ALL_LETTERS } from '../../data/morseAlphabet'
import { type EvaluatedAchievement, evaluate } from '../../game/achievements'
import { dailyKey } from '../../game/dailyChallenge'
import { SKILLS, type Skill } from '../../game/mastery'
import { MASTERY_RULE, hasSentFirstSignal, nextBestAction } from '../../game/nextAction'
import {
  STREAK_GRACE_DAYS,
  currentStreak,
  isActiveToday,
  levelProgress,
} from '../../game/progression'
import { plural } from '../../data/format'
import { SESSION_MODES, charsPerMinute } from '../../game/session'
import { type DailyRecord, createDailyStore, dailyStreak, resultFor } from '../../storage/daily'
import {
  type ProgressRecord,
  accuracyBySkill,
  createProgressStore,
  masteredCharacters,
  overallMastery,
  weakestSkill,
} from '../../storage/progress'
import { achievementSnapshot } from '../../storage/snapshot'
import {
  type GameId,
  type StatsRecord,
  createStatsStore,
  lifetimeAccuracy,
} from '../../storage/stats'
import { Lamp } from '../ui/Lamp'
import { Readout } from '../ui/Readout'
import { Screen } from '../ui/Screen'
import '../../styles/pkg-g.css'

/**
 * The progress hub (PROJECT.md §20, §49; flow audit P5).
 *
 * It answers "what now?" first, with one computed next step, and only then
 * shows where the learner stands: level, both streaks, each skill, records,
 * game bests and achievements. Every number on it is read from the stores;
 * nothing is estimated and nothing is shown before there is something real to
 * show.
 */

export interface StatsGame {
  id: GameId
  /** From the page registry, passed in by the page. */
  label: string
  href: string
}

export interface StatsScreenProps {
  /** The games that keep a best, labelled from the registry. */
  games?: readonly StatsGame[]
}

/** The practice mode that trains a skill, named exactly as the practice screen names it. */
function skillLabel(skill: Skill): string {
  const mode = (Object.keys(SESSION_MODES) as (keyof typeof SESSION_MODES)[]).find(
    (key) => SESSION_MODES[key].skill === skill,
  )
  return mode ? SESSION_MODES[mode].label : skill
}

const NUMBER = new Intl.NumberFormat('en')
const DAY_MS = 86_400_000

interface Loaded {
  progress: ProgressRecord
  stats: StatsRecord
  daily: DailyRecord
  /**
   * The clock, captured when the records were read. Kept in state rather than
   * read during render: a fresh `Date.now()` on every render changed every
   * memo dependency every time, so nothing was ever memoised.
   */
  now: number
}

export function StatsScreen({ games = [] }: StatsScreenProps) {
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])
  const dailyStore = useMemo(() => createDailyStore(), [])
  const [data, setData] = useState<Loaded | null>(null)

  useEffect(() => {
    const load = () =>
      setData({
        progress: progressStore.read(),
        stats: statsStore.read(),
        daily: dailyStore.read(),
        now: Date.now(),
      })
    load()
    const off = [
      progressStore.subscribe(load),
      statsStore.subscribe(load),
      dailyStore.subscribe(load),
    ]
    return () => off.forEach((fn) => fn())
  }, [progressStore, statsStore, dailyStore])

  if (!data) return <StatsSkeleton />
  return <StatsView data={data} games={games} />
}

function StatsView({ data, games }: { data: Loaded; games: readonly StatsGame[] }) {
  const { progress, stats, daily, now } = data

  const derived = useMemo(() => {
    const snapshot = achievementSnapshot(progress, stats, now)
    const achievements = evaluate(snapshot)
    return {
      snapshot,
      achievements,
      next: nextBestAction(progress, stats, daily, now),
      mastered: masteredCharacters(progress, ALL_LETTERS, now).length,
      power: Math.round(overallMastery(progress, ALL_LETTERS, now) * 100),
      bySkill: accuracyBySkill(progress, ALL_LETTERS, now),
      weakest: weakestSkill(progress, ALL_LETTERS, now),
    }
  }, [progress, stats, daily, now])

  const { snapshot, achievements, next, mastered, power, bySkill, weakest } = derived

  const nothingYet =
    !hasSentFirstSignal(stats) &&
    stats.sessions === 0 &&
    stats.totalAnswers === 0 &&
    snapshot.seen === 0 &&
    daily.results.length === 0

  if (nothingYet) return <FirstRun next={next} achievements={achievements} />

  const level = levelProgress(stats.xp)
  const practiceStreak = currentStreak(stats.streak, now)
  const practicedToday = isActiveToday(stats.streak, now)
  const today = dailyKey(now)
  const dailyToday = resultFor(daily, today) !== null
  // Through yesterday until today's daily is taken, so a streak that is still
  // alive does not read as zero all morning.
  const dailyRun = dailyStreak(daily, dailyToday ? today : dailyKey(now - DAY_MS))
  const minutes = Math.round(stats.practiceMs / 60_000)

  return (
    <div className="space-y-10">
      <NextPanel next={next} />

      {/* Level and both streaks. */}
      <section aria-labelledby="stats-standing" className="space-y-4">
        <h2 id="stats-standing" className="sr-only">
          Level and streaks
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="mf-panel col-span-2 p-5 sm:p-6 md:col-span-1">
            <div className="flex items-center justify-between gap-4">
              <span className="mf-engraved">Level</span>
              <span className="font-mono text-label tracking-label text-muted">
                {NUMBER.format(stats.xp)} XP total
              </span>
            </div>
            <p className="mt-3 font-mono text-readout-xl text-signal tabular-nums">{level.level}</p>
            <div
              className="mf-meter mt-5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={level.span}
              aria-valuenow={level.into}
              aria-label={`Level ${level.level} progress`}
              aria-valuetext={`${level.into} of ${level.span} XP`}
            >
              {/* scaleX, not width: a transform never runs layout. */}
              <span style={{ transform: `scaleX(${level.fraction})` }} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {NUMBER.format(level.into)} / {NUMBER.format(level.span)} XP to level{' '}
              {level.level + 1}
            </p>
          </div>

          <Readout
            label="Practice streak"
            value={<StreakValue days={practiceStreak} />}
            tone={practicedToday ? 'amber' : 'ink'}
            lamp={practicedToday}
            caption={
              <>
                {practicedToday ? 'Today counts.' : 'Practise anything to count today.'} Best{' '}
                {stats.streak.longest}.
              </>
            }
          />
          <Readout
            label="Daily streak"
            value={<StreakValue days={dailyRun} />}
            tone={dailyToday ? 'amber' : 'ink'}
            lamp={dailyToday}
            caption={
              dailyToday ? (
                "Today's daily is done."
              ) : (
                <a href="/daily/" className="underline underline-offset-4">
                  Today&apos;s daily is waiting.
                </a>
              )
            }
          />
        </div>
        <p className="max-w-[72ch] text-sm text-muted">
          Two streaks, two rules. The practice streak counts every day you practise anything here,
          by your own clock, and forgives {plural(STREAK_GRACE_DAYS, 'missed day')}. The daily
          streak counts days in a row you took the daily challenge, which changes at midnight UTC.
        </p>
      </section>

      {/* Skills. */}
      <section aria-labelledby="stats-skills">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="stats-skills" className="font-display text-h2 font-bold text-ink">
            Skills
          </h2>
          <a href="/tree/" className="mf-engraved text-signal">
            See the tree →
          </a>
        </div>
        <p className="mt-2 max-w-[60ch] text-muted">
          Reading a code, hearing it and keying it are separate skills that improve at different
          speeds. A letter is mastered once it has {MASTERY_RULE}.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {SKILLS.map((skill) => {
            const entry = bySkill[skill]
            const isWeakest = weakest === skill
            const pct = entry.accuracy === null ? null : Math.round(entry.accuracy * 100)
            return (
              <div
                key={skill}
                className="mf-panel p-5"
                data-state={isWeakest ? 'weakest' : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="mf-engraved">{skillLabel(skill)}</span>
                  {isWeakest && (
                    <span className="mf-engraved flex items-center gap-2 text-amber">
                      <Lamp on tone="amber" />
                      Furthest behind
                    </span>
                  )}
                </div>
                {/* Never tried reads as a dash, not 0%: the two are not the same. */}
                <p
                  className={[
                    'mt-3 font-mono text-readout tabular-nums',
                    isWeakest ? 'text-amber' : 'text-ink',
                  ].join(' ')}
                >
                  {pct === null ? '—' : `${pct}%`}
                </p>
                <div
                  className="mf-meter mf-meter-sm mt-4"
                  data-tone={isWeakest ? 'amber' : undefined}
                  aria-hidden="true"
                >
                  <span style={{ transform: `scaleX(${entry.accuracy ?? 0})` }} />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {entry.attempts === 0
                    ? 'Not tried yet'
                    : `${NUMBER.format(entry.attempts)} ${entry.attempts === 1 ? 'answer' : 'answers'}`}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Readout
            label="Mastered"
            value={
              <>
                {mastered}
                <span className="text-muted">/{ALL_LETTERS.length}</span>
              </>
            }
            tone={mastered > 0 ? 'signal' : 'ink'}
          />
          <Readout label="Network" value={`${power}%`} />
          <Readout
            label="Accuracy"
            value={stats.totalAnswers > 0 ? `${Math.round(lifetimeAccuracy(stats) * 100)}%` : '—'}
          />
          <Readout
            label="Best speed"
            value={stats.bestWpm > 0 ? `${charsPerMinute({ wpm: stats.bestWpm })}` : '—'}
            caption={stats.bestWpm > 0 ? 'correct characters a minute' : undefined}
          />
        </div>
      </section>

      {/* Records and personal bests. */}
      <section aria-labelledby="stats-records">
        <h2 id="stats-records" className="font-display text-h2 font-bold text-ink">
          Records
        </h2>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Readout label="Sessions" value={NUMBER.format(stats.sessions)} />
          <Readout label="Practised" value={minutes > 0 ? `${NUMBER.format(minutes)} min` : '—'} />
          {games.map((game) => {
            const best = stats.gameBests?.[game.id]
            return (
              <Readout
                key={game.id}
                label={game.label}
                value={best === undefined ? '—' : NUMBER.format(best)}
                caption={
                  best === undefined ? (
                    <a href={game.href} className="underline underline-offset-4">
                      Not played yet
                    </a>
                  ) : (
                    'Personal best'
                  )
                }
              />
            )
          })}
        </div>
      </section>

      <AchievementList achievements={achievements} />

      <p className="text-sm text-muted">
        All of this is stored in this browser and nowhere else. Export a copy from{' '}
        <a href="/settings/" className="text-signal underline underline-offset-4">
          settings
        </a>{' '}
        if you want to keep it or move it to another device.
      </p>
    </div>
  )
}

function StreakValue({ days }: { days: number }) {
  return (
    <>
      {days}
      <span className="ml-2 font-mono text-control text-muted">{days === 1 ? 'day' : 'days'}</span>
    </>
  )
}

/** The one computed next step. First on the page, always. */
function NextPanel({ next }: { next: ReturnType<typeof nextBestAction> }) {
  return (
    <section
      className="mf-instrument grid gap-5 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
      aria-labelledby="stats-next"
    >
      <div>
        <span className="mf-engraved flex items-center gap-2">
          <Lamp on tone="amber" />
          Next on the wire
        </span>
        <h2 id="stats-next" className="mt-3 font-display text-h2 font-bold text-ink">
          {next.label}
        </h2>
        <p className="mt-2 max-w-[56ch] text-muted">{next.reason}</p>
      </div>
      <a href={next.href} className="mf-btn mf-btn-primary mf-btn-lg">
        {next.label} <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}

/** First visit: no tiles of dashes, one clear way in, and what there is to earn. */
function FirstRun({
  next,
  achievements,
}: {
  next: ReturnType<typeof nextBestAction>
  achievements: readonly EvaluatedAchievement[]
}) {
  return (
    <div className="space-y-10">
      <section className="mf-instrument p-4 sm:p-6" aria-labelledby="stats-empty">
        <Screen grid powerOn className="grid place-items-center px-6 py-12 text-center sm:py-16">
          <span className="relative z-[3] mf-engraved flex items-center gap-2">
            <Lamp on={false} />
            Receiver idle
          </span>
          <h2
            id="stats-empty"
            className="relative z-[3] mt-4 font-mono text-[clamp(2.25rem,1.4rem+3.6vw,4.5rem)] leading-none font-bold tracking-label text-signal uppercase mf-phosphor"
          >
            No signal yet
          </h2>
          <p className="relative z-[3] mt-5 max-w-[46ch] text-ink">{next.reason}</p>
          <a href={next.href} className="relative z-[3] mf-btn mf-btn-primary mf-btn-lg mt-8">
            {next.label} <span aria-hidden="true">→</span>
          </a>
        </Screen>
        <p className="mt-4 px-2 text-sm text-muted">
          Your level, streaks, skills and records fill in here as you go.
        </p>
      </section>

      <section aria-labelledby="stats-first-badges">
        <h2 id="stats-first-badges" className="font-display text-h2 font-bold text-ink">
          First badges to earn
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {achievements.slice(0, 3).map((achievement) => (
            <Badge key={achievement.id} achievement={achievement} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function AchievementList({ achievements }: { achievements: readonly EvaluatedAchievement[] }) {
  const earned = achievements.filter((a) => a.isEarned)
  const locked = achievements.filter((a) => !a.isEarned)
  // "Next" is the closest locked ones; with no progress on any, the first in order.
  const nextIds = new Set(
    [...locked]
      .sort((a, b) => b.fraction - a.fraction || achievements.indexOf(a) - achievements.indexOf(b))
      .slice(0, 2)
      .map((a) => a.id),
  )
  const ordered = [
    ...locked.filter((a) => nextIds.has(a.id)),
    ...earned,
    ...locked.filter((a) => !nextIds.has(a.id)),
  ]

  return (
    <section aria-labelledby="stats-achievements">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="stats-achievements" className="font-display text-h2 font-bold text-ink">
          Achievements
        </h2>
        <span className="font-mono text-control tabular-nums text-muted">
          {earned.length} of {achievements.length} earned
        </span>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((achievement) => (
          <Badge
            key={achievement.id}
            achievement={achievement}
            next={nextIds.has(achievement.id)}
          />
        ))}
      </ul>
    </section>
  )
}

function Badge({
  achievement,
  next = false,
}: {
  achievement: EvaluatedAchievement
  next?: boolean
}) {
  const pct = Math.round(achievement.fraction * 100)
  return (
    <li className="mf-badge" data-earned={achievement.isEarned}>
      <span className="mf-badge-icon" aria-hidden="true">
        {achievement.isEarned ? achievement.icon : '🔒'}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-display font-bold text-ink">{achievement.title}</p>
          {achievement.isEarned ? (
            <span className="mf-engraved flex items-center gap-1.5 text-signal">
              <Lamp on />
              Earned
            </span>
          ) : next ? (
            <span className="mf-engraved text-amber">Next</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">{achievement.description}</p>
        <span className="sr-only">
          {achievement.isEarned ? 'Earned.' : `Locked, ${pct} percent of the way.`}
        </span>
        {!achievement.isEarned && achievement.progress && (
          <div className="mt-3 flex items-center gap-3" aria-hidden="true">
            <span className="mf-meter mf-meter-sm flex-1" data-tone={next ? 'amber' : 'dim'}>
              <span style={{ transform: `scaleX(${achievement.fraction})` }} />
            </span>
            <span className="font-mono text-label tabular-nums text-muted">{pct}%</span>
          </div>
        )}
      </div>
    </li>
  )
}

/** Loading: the page's final shape, so nothing jumps when the records arrive. */
function StatsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-10">
      <span className="sr-only">Loading your progress</span>
      <div className="mf-instrument h-[13.5rem] p-6 sm:p-8">
        <span className="mf-engraved">Next on the wire</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="mf-panel h-40" />
        ))}
      </div>
    </div>
  )
}
