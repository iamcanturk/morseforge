import { percent } from '../../game/dailyShare'
import { resultFor, type DailyRecord, type DailyResult } from '../../storage/daily'
import { TAPE_INK_VARS } from '../Copy/tapeInk'

/** Days on the strip: two weeks, today last. */
export const HISTORY_STRIP_DAYS = 14

interface Day {
  date: string
  result: DailyResult | null
  today: boolean
}

/** The last fortnight, oldest first, ending on `today`. Pure, for the strip. */
export function historyDays(record: DailyRecord, today: string): Day[] {
  const cursor = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(cursor.getTime())) return []
  cursor.setUTCDate(cursor.getUTCDate() - (HISTORY_STRIP_DAYS - 1))
  const days: Day[] = []
  for (let i = 0; i < HISTORY_STRIP_DAYS; i++) {
    const date = cursor.toISOString().slice(0, 10)
    days.push({ date, result: resultFor(record, date), today: date === today })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

const describe = ({ date, result, today }: Day): string => {
  if (result) {
    const how = result.completed === false ? 'incomplete' : result.passed ? 'passed' : 'played'
    return `${date}: ${percent(result.accuracy)} percent, ${how}.`
  }
  return today ? `${date}, today: not played yet.` : `${date}: not played.`
}

/**
 * A punched-tape strip, one hole per day.
 *
 * A hole is punched for every day attempted, pass or not: the streak counts
 * showing up, and a strip that only lit on a pass would say the opposite.
 * Today, if still open, is a dashed ring rather than a gap.
 */
export function DailyHistory({ record, today }: { record: DailyRecord; today: string }) {
  const days = historyDays(record, today)
  if (days.every((day) => day.result === null)) return null

  return (
    <section aria-labelledby="daily-history-heading">
      <h3 id="daily-history-heading" className="mf-engraved">
        Last {HISTORY_STRIP_DAYS} days
      </h3>
      <div className="mf-tape mt-3" style={TAPE_INK_VARS}>
        <ol className="mf-f-holes justify-between">
          {days.map((day) => (
            <li
              key={day.date}
              className="mf-f-hole"
              data-state={day.result ? 'done' : day.today ? 'open' : 'missed'}
              data-today={day.today}
              title={describe(day)}
            >
              <span className="sr-only">{describe(day)}</span>
            </li>
          ))}
        </ol>
        <div className="mf-f-legend mf-f-legend-tape" aria-hidden="true">
          <span>
            <span className="mf-f-hole" data-state="done" /> Played
          </span>
          <span>
            <span className="mf-f-hole" data-state="missed" /> Not played
          </span>
          <span className="ml-auto">Today →</span>
        </div>
      </div>
    </section>
  )
}
