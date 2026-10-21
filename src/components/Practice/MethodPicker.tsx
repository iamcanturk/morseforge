import { METHODS, METHOD_IDS, type MethodId, activeCharacters } from '../../data/methods'
import { useT } from '../../i18n/react'
import { OptionGroup } from '../ui/OptionGroup'
import { methodCopy, unlockRule } from './copy'

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
  const t = useT()
  const entry = METHODS[method]
  const characters = activeCharacters(entry, unlocked)
  const copy = methodCopy(t, method)
  const rule = unlockRule(t, method)

  return (
    <div>
      <h3 id="method-label" className="mf-engraved">
        {t('methods.heading')}
      </h3>

      <OptionGroup
        label={t('methods.heading')}
        labelledBy="method-label"
        className="mt-3"
        columns={3}
        value={method}
        onChange={onChange}
        options={METHOD_IDS.map((id) => {
          const option = methodCopy(t, id)
          return { value: id, title: option.name, hint: option.summary }
        })}
      />

      <p className="mt-3 text-sm text-muted">{copy.rationale}</p>

      <p
        className="mt-3 flex flex-wrap items-center gap-1.5"
        aria-label={t('methods.yourCharacters')}
      >
        {characters.map((character) => (
          <span key={character} className="mf-kbd">
            {character}
          </span>
        ))}
      </p>

      {rule !== null && <p className="mt-2 text-sm text-muted">{rule}</p>}
    </div>
  )
}
