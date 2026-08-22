import { METHODS, METHOD_IDS, type MethodId, activeCharacters } from '../../data/methods'

/**
 * Choose a teaching order.
 *
 * Each option states its reasoning rather than being presented as a neutral
 * preference, because they are not equivalent — one of them is included mainly
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
  return (
    <fieldset>
      <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">TEACHING ORDER</legend>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {METHOD_IDS.map((id) => {
          const entry = METHODS[id]
          const selected = method === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(id)}
              className="rounded-lg border p-3 text-left transition-colors"
              style={{
                borderColor: selected ? 'var(--color-signal)' : 'var(--color-line)',
                color: selected ? 'var(--color-signal)' : 'var(--color-muted)',
              }}
            >
              <span className="block font-mono text-xs tracking-[0.12em]">
                {entry.name.toUpperCase()}
              </span>
              <span className="mt-1 block text-[11px] leading-snug opacity-80">
                {entry.summary}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">{METHODS[method].rationale}</p>

      <p className="mt-3 font-mono text-[11px] tracking-[0.12em] text-signal-dim">
        {activeCharacters(METHODS[method], unlocked).join(' ')}
      </p>

      {METHODS[method].unlockAccuracy !== null && (
        <p className="mt-2 text-xs text-muted">
          A new character unlocks at {Math.round((METHODS[method].unlockAccuracy ?? 0) * 100)}%
          accuracy over at least 25 answers.
        </p>
      )}
    </fieldset>
  )
}
