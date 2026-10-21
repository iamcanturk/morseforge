import type { CSSProperties } from 'react'
import type { Versus } from '../../game/challengeLink'
import { useT } from '../../i18n/react'
import '../../styles/pkg-e.css'

/**
 * "You 372 / them 340", and nothing more judgemental than that (flow audit
 * P1). Their number is labelled for what it is: whatever the link said. There
 * is no server to check it against, and pretending otherwise would be the
 * fake number this product promises not to show.
 */
export function VersusPlate({ versus, className }: { versus: Versus; className?: string }) {
  const t = useT()
  // Both numbers are sized for the longer one, so a four-digit score on a
  // phone stays in its column instead of running into the slash.
  const digits = Math.max(String(versus.you).length, String(versus.them).length, 3)
  const size = { '--pe-digits': digits } as CSSProperties
  return (
    <section
      aria-label={t('challenge.versusLabel', { you: versus.you, them: versus.them })}
      className={['mf-panel p-5 sm:p-6', className ?? ''].filter(Boolean).join(' ')}
    >
      <div className="pe-versus" style={size}>
        <div>
          <span className="mf-engraved flex items-center gap-2">
            <span className="mf-lamp" data-on="true" aria-hidden="true" />
            {t('challenge.you')}
          </span>
          <span className="pe-versus-value mt-2 block font-mono text-readout-xl text-signal tabular-nums">
            {versus.you}
          </span>
        </div>
        <span aria-hidden="true" className="pb-3 font-display text-h2 font-bold text-muted">
          /
        </span>
        <div className="text-right">
          <span className="mf-engraved flex items-center justify-end gap-2">
            {t('challenge.them')}
            <span className="mf-lamp" data-on="true" data-tone="amber" aria-hidden="true" />
          </span>
          <span className="pe-versus-value mt-2 block font-mono text-readout-xl text-amber tabular-nums">
            {versus.them}
          </span>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        {versus.sameSequence ? t('challenge.versusSame') : t('challenge.versusOlder')}
      </p>
    </section>
  )
}
