import {
  METHODS,
  METHOD_IDS,
  MIN_UNLOCK_ATTEMPTS,
  type MethodId,
  activeCharacters,
} from '../../data/methods'
import { OptionGroup } from '../ui/OptionGroup'

/**
 * Choose a teaching order.
 *
 * Each option states its reasoning rather than being presented as a neutral
 * preference, because they are not equivalent: one of them is included mainly
 * because people ask for it, and the page says so. A picker that hid that would
 * be pretending all three are equally good advice.
 */
export function MethodPicker({
  method,
  unlocked,
  onChange,
}: {
  method: MethodId
  unlocked: number
  onChange: (next: MethodId) => void
}) {
  const entry = METHODS[method]
  const characters = activeCharacters(entry, unlocked)

  return (
    <div>
      <h3 id="method-label" className="mf-engraved">
        Teaching order
      </h3>

      <OptionGroup
        label="Teaching order"
        labelledBy="method-label"
        className="mt-3"
        columns={3}
        value={method}
        onChange={onChange}
        options={METHOD_IDS.map((id) => ({
          value: id,
          title: METHODS[id].name,
          hint: METHODS[id].summary,
        }))}
      />

      <p className="mt-3 text-sm text-muted">{entry.rationale}</p>

      <p className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Your characters so far">
        {characters.map((character) => (
          <span key={character} className="mf-kbd">
            {character}
          </span>
        ))}
      </p>

      {entry.unlockAccuracy !== null && (
        <p className="mt-2 text-sm text-muted">
          More join after a session at {Math.round(entry.unlockAccuracy * 100)}% accuracy over at
          least {MIN_UNLOCK_ATTEMPTS} answers, on the My method pool.
        </p>
      )}
    </div>
  )
}
