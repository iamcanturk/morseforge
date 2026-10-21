import type { CopyGrade } from '../../game/copy'
import { percent, type LineTone } from '../../game/dailyShare'
import { AnswerKey } from './AnswerKey'
import { TAPE_INK_VARS } from './tapeInk'

/**
 * Lines of a finished session, one strip of tape each.
 *
 * With a grade, the line is the marked-up answer key. Without one — a daily
 * result read back after a reload, when only the per-line accuracy was kept —
 * it is the line as sent, which is what the learner needs to look up.
 */

export interface LineRow {
  text: string
  grade?: CopyGrade
  accuracy: number
  tone: LineTone
}

const TONE_LABEL: Record<LineTone, string> = {
  perfect: 'clean',
  pass: 'over the bar',
  under: 'under the bar',
}

export function ToneSquare({
  tone,
  large = false,
}: {
  tone: LineTone | 'pending'
  large?: boolean
}) {
  return (
    <span
      className={`mf-f-tone ${large ? 'mf-f-tone-lg' : ''}`}
      data-tone={tone}
      aria-hidden="true"
    />
  )
}

export function LineList({ rows, label }: { rows: readonly LineRow[]; label: string }) {
  return (
    <ol className="space-y-2" aria-label={label}>
      {rows.map((row, index) => (
        <li key={`${row.text}-${index}`} className="mf-tape mf-f-line" style={TAPE_INK_VARS}>
          <span className="sr-only">
            Line {index + 1}, {percent(row.accuracy)}%, {TONE_LABEL[row.tone]}:
          </span>
          <span className="mf-f-line-no" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="min-w-0">
            {row.grade ? (
              <AnswerKey grade={row.grade} compact bare />
            ) : (
              <span className="mf-f-line-text">{row.text}</span>
            )}
          </span>
          <span className="mf-f-line-score" aria-hidden="true">
            {percent(row.accuracy)}%
            <ToneSquare tone={row.tone} />
          </span>
        </li>
      ))}
    </ol>
  )
}
