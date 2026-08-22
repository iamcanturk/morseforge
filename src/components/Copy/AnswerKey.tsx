import type { CopyGrade, CopySlot } from '../../game/copy'

/**
 * The line as it was sent, marked up with what happened to each character.
 *
 * This is the feature, not the percentage. Being told you missed two teaches
 * nothing; seeing *which* two, in position, is what changes what you practise
 * next.
 *
 * Colour alone would not carry it, so a wrong character also shows what was
 * typed instead and a missed one shows a dash — the mark is legible without
 * seeing the colour at all, and every slot carries a text label for a screen
 * reader.
 */
export function AnswerKey({ grade, compact = false }: { grade: CopyGrade; compact?: boolean }) {
  return (
    <p className={`flex flex-wrap ${compact ? 'gap-x-1.5' : 'gap-x-2.5'} font-mono`}>
      {grade.slots.map((slot, index) => (
        <Slot key={index} slot={slot} compact={compact} />
      ))}
    </p>
  )
}

function Slot({ slot, compact }: { slot: CopySlot; compact: boolean }) {
  const colour =
    slot.mark === 'hit'
      ? 'var(--color-signal)'
      : slot.mark === 'extra'
        ? 'var(--color-muted)'
        : 'var(--color-danger)'

  const label =
    slot.mark === 'hit'
      ? `${slot.expected}, copied`
      : slot.mark === 'miss'
        ? `${slot.expected}, missed`
        : slot.mark === 'wrong'
          ? `${slot.expected}, copied as ${slot.given}`
          : `${slot.given}, not sent`

  return (
    <span className="inline-flex flex-col items-center leading-none" title={label}>
      <span className="sr-only">{label}. </span>
      <span
        aria-hidden="true"
        className={compact ? 'text-sm' : 'text-2xl'}
        style={{ color: colour, opacity: slot.mark === 'extra' ? 0.5 : 1 }}
      >
        {slot.expected ?? '·'}
      </span>
      {slot.mark !== 'hit' && (
        <span
          aria-hidden="true"
          className={`mt-1 ${compact ? 'text-[9px]' : 'text-[11px]'}`}
          style={{ color: colour }}
        >
          {slot.given ?? '–'}
        </span>
      )}
    </span>
  )
}
