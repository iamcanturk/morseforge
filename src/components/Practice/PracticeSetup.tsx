import { SESSION_MODES, type SessionMode } from '../../game/session'
import type { MethodId } from '../../data/methods'
import { useT } from '../../i18n/react'
import type { Translator } from '../../i18n/translator'
import { methodCopy, modeCopy } from './copy'
import type { ProgressRecord } from '../../storage/progress'
import type { SignalMode } from '../../storage/settings'
import { Segmented } from '../ui/Segmented'
import { MethodPicker } from './MethodPicker'
import { signalNote } from './practice'
import '../../styles/pkg-e.css'

/**
 * The practice set-up: a compact instrument, not a form.
 *
 * Mode and characters are the two choices that change what a session is, so
 * they sit on the face. How you answer and which teaching order fills "My
 * method" are set once and rarely touched, so they live under Adjust. One
 * line above START says what is about to run, so nobody has to read the
 * controls back to know.
 */

export type PracticeLayout = 'flat' | 'tree'

export interface PoolChoice<Id extends string = string> {
  id: Id
  label: string
  characters: readonly string[]
}

export interface PracticeSetupProps<Id extends string> {
  mode: SessionMode
  onMode: (mode: SessionMode) => void
  pools: readonly PoolChoice<Id>[]
  poolId: Id
  onPool: (id: Id) => void
  layout: PracticeLayout
  onLayout: (layout: PracticeLayout) => void
  progress: ProgressRecord
  onMethod: (method: MethodId) => void
  onStart: () => void
  /** How listening prompts will reach the learner (DEC-045). */
  signal: SignalMode
}

const MODES = Object.keys(SESSION_MODES) as SessionMode[]

function layouts(t: Translator): { value: PracticeLayout; label: string; hint: string }[] {
  return [
    { value: 'flat', label: t('practice.layoutTyping'), hint: t('practice.layoutTypingHint') },
    { value: 'tree', label: t('practice.layoutTree'), hint: t('practice.layoutTreeHint') },
  ]
}

export function PracticeSetup<Id extends string>({
  mode,
  onMode,
  pools,
  poolId,
  onPool,
  layout,
  onLayout,
  progress,
  onMethod,
  onStart,
  signal,
}: PracticeSetupProps<Id>) {
  const t = useT()
  const LAYOUTS = layouts(t)
  const pool = pools.find((entry) => entry.id === poolId) ?? pools[0]
  const layoutEntry = LAYOUTS.find((entry) => entry.value === layout) ?? LAYOUTS[0]!
  const modeText = modeCopy(t, mode)
  const summary = [modeText.label, pool?.label ?? '', layoutEntry.label].filter(Boolean).join(' · ')
  const note = mode === 'listening' ? signalNote(t, signal) : null

  return (
    <section aria-labelledby="setup-heading" className="mf-instrument p-5 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h2 id="setup-heading" className="mf-engraved flex items-center gap-2">
          <span className="mf-lamp" data-on="true" aria-hidden="true" />
          {t('practice.setupHeading')}
        </h2>
        <span className="mf-engraved hidden sm:inline">
          {t('methods.order', { name: methodCopy(t, progress.method).name })}
        </span>
      </div>

      <div className="mt-6 grid gap-6">
        <div>
          <h3 id="mode-label" className="mf-engraved">
            {t('practice.mode')}
          </h3>
          <Segmented
            label={t('practice.mode')}
            labelledBy="mode-label"
            className="mt-3"
            value={mode}
            onChange={onMode}
            options={MODES.map((id) => ({ value: id, label: modeCopy(t, id).label }))}
          />
          <p className="mt-2 text-sm text-muted">{modeText.prompt}.</p>
        </div>

        <div>
          <h3 id="pool-label" className="mf-engraved">
            {t('practice.characters')}
          </h3>
          <Segmented
            label={t('practice.characters')}
            labelledBy="pool-label"
            className="mt-3"
            value={poolId}
            onChange={onPool}
            options={pools.map((entry) => ({ value: entry.id, label: entry.label }))}
          />
          {pool && (
            <ul
              className="mt-3 flex flex-wrap gap-1.5"
              aria-label={t('practice.characterCount', { count: pool.characters.length })}
            >
              {pool.characters.map((character) => (
                <li key={character} className="mf-kbd">
                  {character}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <details className="pe-details mt-6 border-t border-line pt-4">
        <summary className="flex min-h-11 items-center justify-between gap-3">
          <span className="font-mono text-control text-ink uppercase">{t('practice.adjust')}</span>
          <span className="flex items-center gap-2 text-sm text-muted">
            {t('practice.adjustHint')}
            <svg
              className="pe-chevron"
              viewBox="0 0 12 12"
              width="12"
              height="12"
              aria-hidden="true"
            >
              <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
        </summary>

        <div className="mt-4 grid gap-6">
          <div>
            <h3 id="layout-label" className="mf-engraved">
              {t('practice.answerBy')}
            </h3>
            <Segmented
              label={t('practice.answerBy')}
              labelledBy="layout-label"
              className="mt-3"
              value={layout}
              onChange={onLayout}
              options={LAYOUTS.map((entry) => ({ value: entry.value, label: entry.label }))}
            />
            <p className="mt-2 text-sm text-muted">{layoutEntry.hint}</p>
          </div>

          <MethodPicker method={progress.method} unlocked={progress.unlocked} onChange={onMethod} />
        </div>
      </details>

      <div className="mt-6 grid gap-3">
        <p className="mf-engraved text-center" aria-hidden="true">
          {summary}
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block"
          aria-label={t('practice.startSummary', { summary })}
        >
          {t('practice.start')}
        </button>
      </div>

      {note && (
        <p className="mt-4 text-sm text-muted" role="note">
          {note}{' '}
          <a href={t.href('/settings/#signal')} className="text-ink underline underline-offset-4">
            {t('practice.changeInSettings')}
          </a>
          .
        </p>
      )}
    </section>
  )
}
