import { useEffect, useMemo, useState } from 'react'
import { CF_ANALYTICS_TOKEN } from '../../config/site'

/**
 * The author's panel.
 *
 * Reads a JSON file that a scheduled script on the server writes by tallying
 * nginx's own access log. There is no API and no database — the log is the
 * store, and this is a view of it.
 *
 * Everything shown here is a count. No IP, no user agent string, no path a
 * single person took. The summariser hashes the address with a per-day salt
 * before counting it and never writes the address itself, so this file could
 * be made public tomorrow without exposing anyone.
 */

interface DaySummary {
  date: string
  /** Distinct hashed addresses. */
  visitors: number
  pageviews: number
  /** Event name → count. */
  events: Record<string, number>
  /** Path → count. */
  pages: Record<string, number>
  /** Referrer host → count. */
  referrers: Record<string, number>
}

interface Summary {
  generatedAt: string
  days: DaySummary[]
}

const RANGES = [
  { id: 7, label: '7 DAYS' },
  { id: 30, label: '30 DAYS' },
] as const

export function PanelScreen() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<number>(7)

  useEffect(() => {
    let cancelled = false
    fetch('/panel/data.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<Summary>
      })
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const window = useMemo(() => (summary?.days ?? []).slice(0, days), [summary, days])

  const totals = useMemo(() => {
    const events: Record<string, number> = {}
    const pages: Record<string, number> = {}
    const referrers: Record<string, number> = {}
    let visitors = 0
    let pageviews = 0

    for (const day of window) {
      // Summed rather than deduplicated: the summariser only knows distinct
      // visitors within a day, so this is "visits", and it is labelled as such
      // rather than being passed off as unique people over a month.
      visitors += day.visitors
      pageviews += day.pageviews
      for (const [key, value] of Object.entries(day.events))
        events[key] = (events[key] ?? 0) + value
      for (const [key, value] of Object.entries(day.pages)) pages[key] = (pages[key] ?? 0) + value
      for (const [key, value] of Object.entries(day.referrers))
        referrers[key] = (referrers[key] ?? 0) + value
    }

    return { events, pages, referrers, visitors, pageviews }
  }, [window])

  if (error !== null) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold tracking-tight">No summary yet</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          <code className="text-signal-dim">/panel/data.json</code> answered {error}. That is
          expected until the summariser has run once — it is a cron job on the server, not something
          this page can start.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-elevated p-4 font-mono text-xs">
          ssh morsecp &apos;bash ~/analytics/summarise.sh&apos;
        </pre>
      </div>
    )
  }

  if (summary === null) {
    return <p className="font-mono text-xs tracking-[0.16em] text-muted">READING THE LOG</p>
  }

  const peak = Math.max(1, ...window.map((day) => day.pageviews))

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              aria-pressed={days === range.id}
              onClick={() => setDays(range.id)}
              className="rounded-lg border px-4 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
              style={{
                borderColor: days === range.id ? 'var(--color-signal)' : 'var(--color-line)',
                color: days === range.id ? 'var(--color-signal)' : 'var(--color-muted)',
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted">
          BUILT {summary.generatedAt}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'VISITS', value: totals.visitors },
          { label: 'PAGEVIEWS', value: totals.pageviews },
          {
            label: 'SESSIONS RUN',
            value:
              (totals.events['practice_start'] ?? 0) +
              (totals.events['copy_start'] ?? 0) +
              (totals.events['daily_start'] ?? 0) +
              (totals.events['challenge_start'] ?? 0),
          },
          { label: 'DAYS OF DATA', value: window.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line bg-panel p-4">
            <dt className="font-mono text-[10px] tracking-[0.16em] text-muted">{label}</dt>
            <dd className="mt-1.5 font-display text-2xl font-semibold text-ink">
              {value.toLocaleString('en')}
            </dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">By day</h2>
        <ol className="mt-5 space-y-1.5">
          {window.map((day) => (
            <li key={day.date} className="flex items-center gap-3">
              <span className="w-24 shrink-0 font-mono text-[11px] text-muted">{day.date}</span>
              <span
                className="h-4 rounded"
                style={{
                  width: `${Math.max(2, (day.pageviews / peak) * 100)}%`,
                  background: 'var(--color-signal)',
                }}
              />
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {day.pageviews} · {day.visitors} visits
              </span>
            </li>
          ))}
        </ol>
      </section>

      <Breakdown title="What they did" entries={totals.events} empty="No events counted yet." />
      <Breakdown title="Pages" entries={totals.pages} limit={15} />
      <Breakdown
        title="Where they came from"
        entries={totals.referrers}
        empty="Nothing but direct traffic."
      />

      {CF_ANALYTICS_TOKEN && (
        <p className="text-sm leading-relaxed text-muted">
          Cloudflare Web Analytics counts the same traffic independently, with bot filtering this
          does not do.{' '}
          <a
            href="https://dash.cloudflare.com/?to=/:account/web-analytics"
            className="text-signal underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
          >
            Open the dashboard
          </a>
          . It cannot be pulled in here: reading it needs an API token, and a token in a static page
          is a public token.
        </p>
      )}
    </div>
  )
}

function Breakdown({
  title,
  entries,
  limit = 20,
  empty = 'Nothing yet.',
}: {
  title: string
  entries: Record<string, number>
  limit?: number
  empty?: string
}) {
  const rows = Object.entries(entries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
  const peak = Math.max(1, ...rows.map(([, count]) => count))

  return (
    <section>
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ol className="mt-5 space-y-1.5">
          {rows.map(([key, count]) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-56 shrink-0 truncate font-mono text-[11px] text-ink" title={key}>
                {key}
              </span>
              <span
                className="h-4 rounded"
                style={{
                  width: `${Math.max(2, (count / peak) * 100)}%`,
                  background: 'var(--color-signal-dim)',
                }}
              />
              <span className="font-mono text-[11px] tabular-nums text-muted">{count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
