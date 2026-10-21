import type { CopyGrade, CopySlot } from '../../game/copy'
import { TAPE_INK_VARS } from './tapeInk'

/**
 * The line as it was sent against the line as it was copied, printed on paper
 * tape and marked character by character.
 *
 * This is the feature, not the percentage. Being told you missed two teaches
 * nothing; seeing *which* two, in position, is what changes what you practise
 * next.
 *
 * Marks are shapes as well as colours: a missed or miscopied character is
 * struck through, an extra one is underlined, and the copied row shows what
 * was typed or a dash — legible without seeing colour at all. Every slot also
 * carries a text label for a screen reader.
 *
 * `compact` drops the row labels and shrinks the type, for a list of lines.
 * Pass `bare` to print onto a tape that already exists around it.
 */
export function AnswerKey({
  grade,
  compact = false,
  bare = false,
}: {
  grade: CopyGrade
  compact?: boolean
  bare?: boolean
}) {
  const body = (
    <div className={`mf-f-key ${compact ? 'mf-f-key-compact' : ''}`}>
      {!compact && (
        <span className="mf-f-key-labels" aria-hidden="true">
          <span>Sent</span>
          <span>You copied</span>
        </span>
      )}
      <p className="mf-f-slots">
        {grade.slots.map((slot, index) => (
          <Slot key={index} slot={slot} />
        ))}
      </p>
    </div>
  )

  if (bare) return body
  return (
    <div className="mf-tape" style={TAPE_INK_VARS}>
      {body}
    </div>
  )
}

function label(slot: CopySlot): string {
  switch (slot.mark) {
    case 'hit':
      return `${slot.expected}, copied`
    case 'miss':
      return `${slot.expected}, missed`
    case 'wrong':
      return `${slot.expected}, copied as ${slot.given}`
    case 'extra':
      return `${slot.given}, not sent`
  }
}

function Slot({ slot }: { slot: CopySlot }) {
  const text = label(slot)
  return (
    <span className="mf-f-slot" data-mark={slot.mark} title={text}>
      <span className="sr-only">{text}. </span>
      <span className="mf-f-sent" aria-hidden="true">
        {slot.expected ?? '·'}
      </span>
      <span className="mf-f-given" aria-hidden="true">
        {slot.given ?? '–'}
      </span>
    </span>
  )
}
