import { useEffect, useRef, type MouseEvent, type ReactNode, type Ref } from 'react'
import { Fuse, KeyingLead, MorseKey, POINTER_TAGS, PendingSpeech } from './MorseKey'
import type { PaddleControls, useMorseKey } from './useMorseKey'
import { prettify } from '../../engine/morseEncoder'
import type { SettingsRecord } from '../../storage/settings'
import { keyName } from './keyName'
import { releaseFocus } from './releaseFocus'
import { keyLabel as keyCap } from './keyCopy'
import { useT } from '../../i18n/react'
import { renderRich } from '../../i18n/richReact'
import { browserDockEnvironment, publishStickyDock } from './stickyDock'
import '../../styles/pkg-c.css'

/**
 * The whole sending desk in one component: paper tape, fuse, brass key and the
 * buttons that go with it (audit X8, §3.7).
 *
 * The same block used to be written out four times — lesson, two practice
 * branches and the telegraph — each with its own idea of where the pending
 * code went and what "finish character" looked like. This is the one version.
 * It holds no state: everything comes from the `useMorseKey` handle, so the
 * screen that owns the hook still owns the session.
 *
 * Layout, top to bottom: tape → status line → fuse → key → actions. Every row
 * has a fixed height, so nothing that prints, stamps or announces can move the
 * key out from under a finger that is holding it.
 */

export type KeyStationAction = 'finish' | 'word' | 'undo' | 'clear'

type MorseKeyHandle = ReturnType<typeof useMorseKey>

export interface KeyStationProps {
  morseKey: MorseKeyHandle
  settings: SettingsRecord
  /**
   * What the tape prints. `pending`: the character being keyed and what it
   * would decode to (drills, where the answer goes elsewhere). `decoded`:
   * everything sent so far with the pending code punched on the end (the
   * telegraph). `false`: no tape.
   */
  tape?: 'pending' | 'decoded' | false
  actions?: readonly KeyStationAction[]
  /** D1 "signal detected": a flash over the tape and the lamp beside it. */
  moment?: 'detected' | null
  /** Change it to replay the moment; the flash restarts when it re-keys. */
  momentKey?: number
  /** Printed along the top edge of the tape, e.g. the "send this" target. */
  tapeHeader?: ReactNode
  /** Laid over the tape without moving it, e.g. a rubber stamp. */
  tapeOverlay?: ReactNode
  /** The one line under the tape. Defaults to how to key. */
  status?: ReactNode
  /** What an empty `decoded` tape says. */
  emptyTape?: ReactNode
  /**
   * Keep the tape in view under the header while scrolling, below `lg` and
   * only on a screen at least 37.5rem tall (pkg-c.css). While it sticks, its
   * height is added to the page's scroll padding, so focus never lands
   * behind it.
   */
  stickyTape?: boolean
  /**
   * Buzz on key-down where the device can. Defaults to the interface-feedback
   * setting (`audio.uiSounds`) until Settings has a switch of its own.
   */
  haptics?: boolean
  disabled?: boolean
  /** Told after the station has acted, so the screen can follow up. */
  onAction?: (action: KeyStationAction) => void
  keyRef?: Ref<HTMLButtonElement>
  className?: string
}

/** How much decoded text the tape keeps in the DOM. The rest has scrolled off. */
const TAPE_CHARACTERS = 80

/** The bound key as a label: "SPACE", "ENTER", "K". */
export { keyName }

export { releaseFocus } from './releaseFocus'

export function KeyStation({
  morseKey,
  settings,
  tape = 'pending',
  actions = ['finish'],
  moment = null,
  momentKey = 0,
  tapeHeader,
  tapeOverlay,
  status,
  emptyTape,
  stickyTape = false,
  haptics,
  disabled = false,
  onAction,
  keyRef,
  className,
}: KeyStationProps) {
  const { state } = morseKey
  const autoCommit = settings.timing.autoCommit
  const dock = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = dock.current
    if (!stickyTape || !element) return
    return publishStickyDock(element, browserDockEnvironment())
  }, [stickyTape, tape])
  const t = useT()
  const keyLabel = keyCap(t, settings.keys.key)
  const commitLabel = keyCap(t, settings.keys.submit ?? 'Control')
  const showCountdown = autoCommit && state.pending !== '' && !state.isDown

  const act = (action: KeyStationAction) => (event: MouseEvent<HTMLButtonElement>) => {
    releaseFocus(event)
    if (action === 'finish') morseKey.commitCharacter()
    if (action === 'word') {
      // Through `commitCharacter` first: `commitWord` resolves the pending
      // character too, but without telling `onCharacter`, and a screen that
      // counts characters would miss the last one of every word.
      morseKey.commitCharacter()
      morseKey.commitWord()
    }
    if (action === 'undo') morseKey.cancelPending()
    if (action === 'clear') morseKey.reset()
    onAction?.(action)
  }

  const nothingSent = state.text === '' && state.pending === ''

  return (
    <div className={['flex flex-col', className ?? ''].join(' ')}>
      {tape && (
        <div ref={dock} className="kc-tape-dock" data-sticky={stickyTape || undefined}>
          <div className="mf-tape kc-tape">
            {moment === 'detected' && <span key={momentKey} className="mf-flash" />}
            {tapeHeader && <div className="kc-tape-header">{tapeHeader}</div>}

            {/* The live region exists before its content does, or the first
                announcement is dropped. */}
            <span role="status" className="sr-only">
              {state.pending && <PendingSpeech pending={state.pending} preview={state.preview} />}
            </span>

            {tape === 'decoded' ? (
              <DecodedLine text={state.text} pending={state.pending} empty={emptyTape} />
            ) : (
              <PendingLine pending={state.pending} preview={state.preview} />
            )}

            {tapeOverlay}
          </div>
        </div>
      )}

      <div className="mt-3 flex min-h-11 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm leading-snug text-muted">
          {status ?? (
            <KeyingHint
              autoCommit={autoCommit}
              commitLabel={commitLabel}
              paddles={morseKey.paddles}
            />
          )}
        </div>
        <span
          className="flex shrink-0 items-center gap-2 pt-0.5"
          data-on={moment === 'detected'}
          aria-hidden="true"
        >
          <span className="mf-lamp" data-on={moment === 'detected'} />
          <span
            className={[
              'mf-engraved hidden sm:inline',
              moment === 'detected' ? 'text-signal' : '',
            ].join(' ')}
          >
            {t('key.signalDetected')}
          </span>
        </span>
      </div>

      <Fuse progress={state.commitProgress} active={showCountdown} className="mt-2 w-full" />

      <MorseKey
        isDown={state.isDown}
        pending={state.pending}
        preview={state.preview}
        commitProgress={state.commitProgress}
        autoCommit={autoCommit}
        keyLabel={keyLabel}
        commitLabel={commitLabel}
        disabled={disabled}
        pointerHandlers={morseKey.pointerHandlers}
        readout={false}
        hint={false}
        haptics={haptics ?? settings.audio.uiSounds}
        frequency={settings.audio.frequency}
        muted={!settings.audio.enabled || settings.audio.volume === 0}
        keyRef={keyRef}
        paddles={morseKey.paddles}
        toneOn={state.toneOn}
        className="mt-3"
      />

      {actions.length > 0 && (
        <div className="kc-actions mt-4">
          {actions.includes('finish') && (
            <button
              type="button"
              onClick={act('finish')}
              disabled={disabled || state.pending === ''}
              className={[
                'mf-btn mf-btn-sm',
                autoCommit ? 'mf-btn-secondary' : 'mf-btn-primary',
              ].join(' ')}
            >
              {t('key.finish')}
              <span className="max-sm:hidden">{t('key.finishCharacter')}</span>
              {/* Not below `sm` either: two buttons share a 390px row there,
                  and the key name pushed the label out of its button. There
                  the label itself is "Finish": in full it filled its half of
                  the row edge to edge, and spilled at 360px (V-10). */}
              <kbd className="mf-kbd max-sm:hidden pointer-coarse:hidden">{commitLabel}</kbd>
            </button>
          )}
          {actions.includes('word') && (
            <button
              type="button"
              onClick={act('word')}
              disabled={disabled || nothingSent}
              className="mf-btn mf-btn-secondary mf-btn-sm"
            >
              {t('key.newWord')}
            </button>
          )}
          {actions.includes('undo') && (
            <button
              type="button"
              onClick={act('undo')}
              disabled={disabled || state.pending === ''}
              className="mf-btn mf-btn-ghost mf-btn-sm"
            >
              {t('key.undo')}
            </button>
          )}
          {actions.includes('clear') && (
            <button
              type="button"
              onClick={act('clear')}
              disabled={disabled || nothingSent}
              className="mf-btn mf-btn-danger mf-btn-sm"
            >
              {t('key.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The default status line: how to key, in the terms of the current mode. */
export function KeyingHint({
  autoCommit,
  commitLabel,
  paddles = null,
}: {
  autoCommit: boolean
  commitLabel: string
  paddles?: PaddleControls | null
}) {
  const t = useT()
  return (
    <p>
      <KeyingLead paddles={paddles} />{' '}
      {autoCommit
        ? t('key.stationPause')
        : renderRich(t.rich('key.stationManual', { key: commitLabel }), POINTER_TAGS)}
    </p>
  )
}

/**
 * The telegraph's tape: decoded text running right to left like a ticker, the
 * newest character always at the right edge, with the code being keyed
 * punched on the end.
 *
 * Characters are keyed by their absolute position, so only a newly printed
 * one mounts and strikes on; the rest stay put. The text is a polite live
 * region, so each printed character is read out as it lands.
 */
function DecodedLine({
  text,
  pending,
  empty,
}: {
  text: string
  pending: string
  empty?: ReactNode
}) {
  const t = useT()
  const start = Math.max(0, text.length - TAPE_CHARACTERS)
  const shown = [...text.slice(start)]
  const blank = text === '' && pending === ''

  return (
    <div className="kc-tape-line" data-empty={blank}>
      {/* Always mounted, empty or not: a live region that appears together
          with its first content is usually not announced, and the first
          character is the one that matters most. */}
      <output
        aria-live="polite"
        aria-label={t('key.decoded')}
        className={blank ? 'sr-only' : 'kc-ticker'}
      >
        {shown.map((character, index) => (
          <span key={start + index} className="kc-char mf-strike">
            {character === ' ' ? '\u00a0' : character}
          </span>
        ))}
      </output>
      {blank ? (
        <span className="kc-tape-empty">{empty ?? t('key.printsHere')}</span>
      ) : (
        <span className="kc-punch" aria-hidden="true" data-on={pending !== ''}>
          {pending ? prettify(pending) : ''}
        </span>
      )}
    </div>
  )
}

/** The drill tape: just the character in progress and what it would be. */
function PendingLine({ pending, preview }: { pending: string; preview: string | null }) {
  const t = useT()
  return (
    <div className="kc-tape-line kc-tape-line-centre" aria-hidden="true">
      {pending ? (
        <>
          <span className="kc-pending-code">{prettify(pending)}</span>
          <span className="kc-pending-preview">
            {preview ? t('key.preview', { preview }) : t('key.previewUnknown')}
          </span>
        </>
      ) : (
        <span className="kc-tape-empty">{t('key.ready')}</span>
      )}
    </div>
  )
}
