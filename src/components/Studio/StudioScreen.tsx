import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MODES, SIZES, extensionFor, fileName, keyedElements, layout, type ModeId } from './scene'
import { drawCaption, drawFrame, drawLogo, readPalette } from './draw'
import { AudioEngine } from '../../engine/audioEngine'
import { encode, prettify } from '../../engine/morseEncoder'
import { buildTimeline, estimateDuration } from '../../engine/timingEngine'
import { isEncodable } from '../../data/morseAlphabet'

/**
 * The promo video studio.
 *
 * Renders a message as Morse — audio and picture together — and records the
 * canvas and the audio into one file. Everything happens in this tab: there is
 * no upload, no queue and no service to pay for, which is also why the export
 * is WebM rather than MP4. The browser records what it can encode.
 *
 * Held to the same bar as the rest of the site rather than treated as a private
 * toy: the frame maths is in `scene.ts` and tested, because a visualiser that
 * looks right at 1920×1080 and puts the logo off the edge at 1080×1920 is the
 * normal way this goes wrong.
 */

const DEFAULT_MESSAGE = 'CQ CQ DE MORSEFORGE'

/** Long enough to read, short enough that nobody waits on a render. */
const MAX_MESSAGE = 60

type Phase = 'idle' | 'playing' | 'recording'

export function StudioScreen() {
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [mode, setMode] = useState<ModeId>('keying')
  const [sizeId, setSizeId] = useState(SIZES[0]!.id)
  const [showLogo, setShowLogo] = useState(true)
  const [showCaption, setShowCaption] = useState(true)
  const [wpm, setWpm] = useState(15)
  const [phase, setPhase] = useState<Phase>('idle')
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canvas = useRef<HTMLCanvasElement>(null)
  const audio = useRef<AudioEngine | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const raf = useRef<number | null>(null)
  const startedAt = useRef(0)
  const stopPlayback = useRef<(() => void) | null>(null)

  const size = SIZES.find((entry) => entry.id === sizeId) ?? SIZES[0]!

  const unsupported = useMemo(
    () => [...new Set([...message.toUpperCase()])].filter((c) => c !== ' ' && !isEncodable(c)),
    [message],
  )

  const morse = useMemo(
    () => (unsupported.length > 0 ? '' : encode(message)),
    [message, unsupported],
  )

  const timing = useMemo(() => ({ wpm, farnsworthWpm: wpm }), [wpm])
  const elements = useMemo(
    () => (morse ? keyedElements(buildTimeline(morse, timing)) : []),
    [morse, timing],
  )
  const durationMs = useMemo(
    () => (morse ? estimateDuration(message, timing) : 0),
    [message, morse, timing],
  )

  /** Draw one frame. Also used to paint the still preview before anything runs. */
  const paint = useCallback(
    (elapsedMs: number) => {
      const element = canvas.current
      const context = element?.getContext('2d')
      if (!element || !context) return

      const frame = layout(element.width, element.height)
      const palette = readPalette(element)

      const bins = analyser.current?.frequencyBinCount ?? 0
      const frequency = new Uint8Array(bins)
      const waveform = new Uint8Array(bins)
      if (analyser.current) {
        analyser.current.getByteFrequencyData(frequency)
        analyser.current.getByteTimeDomainData(waveform)
      } else {
        waveform.fill(128)
      }

      let level = 0
      for (const value of frequency) level = Math.max(level, value / 255)

      drawFrame(context, {
        mode,
        frame,
        palette,
        frequency,
        waveform,
        level,
        elements,
        elapsedMs,
      })

      if (showLogo) drawLogo(context, frame, palette)
      if (showCaption && morse) drawCaption(context, frame, palette, message, prettify(morse))
    },
    [mode, elements, showLogo, showCaption, message, morse],
  )

  // Repaint the still preview whenever a setting changes, so the frame on
  // screen is always the frame that would be exported.
  useEffect(() => {
    if (phase === 'idle') paint(0)
  }, [paint, phase, size])

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      void audio.current?.dispose()
    },
    [],
  )

  // Revoke the previous object URL rather than leaking one per export.
  useEffect(() => {
    return () => {
      if (download) URL.revokeObjectURL(download.url)
    }
  }, [download])

  const prepareAudio = useCallback(async () => {
    audio.current ??= new AudioEngine({ frequency: 600, volume: 0.2 })
    await audio.current.resume()

    const context = audio.current.context
    if (!context) return null

    if (!analyser.current) {
      analyser.current = context.createAnalyser()
      analyser.current.fftSize = 2048
      // Smoothed a little: raw bins at 60fps read as noise rather than as a
      // signal rising and falling.
      analyser.current.smoothingTimeConstant = 0.72
      audio.current.tap(analyser.current)
    }
    return context
  }, [])

  const loop = useCallback(() => {
    paint(performance.now() - startedAt.current)
    raf.current = requestAnimationFrame(loop)
  }, [paint])

  const stopEverything = useCallback(() => {
    stopPlayback.current?.()
    stopPlayback.current = null
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    if (recorder.current?.state === 'recording') recorder.current.stop()
    setPhase('idle')
  }, [])

  const preview = useCallback(async () => {
    if (!morse) return
    setError(null)
    await prepareAudio()
    setPhase('playing')
    startedAt.current = performance.now()
    raf.current = requestAnimationFrame(loop)

    const playback = await audio.current!.play(morse, timing)
    stopPlayback.current = playback.stop
    await playback.finished

    // A beat of silence at the end so the last element is not cut off.
    setTimeout(() => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      raf.current = null
      setPhase('idle')
      paint(0)
    }, 600)
  }, [morse, timing, prepareAudio, loop, paint])

  const record = useCallback(async () => {
    if (!morse || !canvas.current) return
    setError(null)

    const context = await prepareAudio()
    if (!context) {
      setError('This browser would not start an audio context.')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('This browser has no MediaRecorder, so it cannot record. Chrome or Firefox will.')
      return
    }

    // The recorder needs the audio as a stream, which means a second
    // destination alongside the speakers.
    const destination = context.createMediaStreamDestination()
    audio.current!.tap(destination)

    const videoStream = canvas.current.captureStream(60)
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ])

    /*
     * MP4 first, and not for compatibility — for correctness.
     *
     * MediaRecorder's WebM output carries no duration in its header; it is a
     * live muxer and never goes back to write one. Anything that then wants a
     * frame rate computes frames ÷ duration, gets a duration near zero, and
     * concludes the video runs at several hundred frames per second. X rejects
     * the upload outright: "maximum frame rate 60, actual 991". The file was
     * always 60fps — the container simply never said so.
     *
     * An MP4 is finalised with a real duration and a real frame rate, so it
     * uploads without argument. WebM stays as the fallback for browsers that
     * cannot record MP4, with a note on the page about remuxing it.
     */
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) {
      setError('This browser cannot record video. Chrome, Edge or Safari will.')
      return
    }

    const chunks: Blob[] = []
    const media = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    recorder.current = media
    media.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    })

    const finished = new Promise<Blob>((resolve) => {
      media.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })), {
        once: true,
      })
    })

    // requestAnimationFrame stops in a hidden tab, and Web Audio does not — so
    // switching away mid-record yields a frozen picture over continuing sound,
    // and nothing about the resulting file says so. Watched rather than
    // prevented: aborting would throw away a recording the user may be happy
    // with, and there is no way to keep the canvas painting at full rate.
    let wentHidden = false
    const watchVisibility = () => {
      if (document.hidden) wentHidden = true
    }
    document.addEventListener('visibilitychange', watchVisibility)

    setPhase('recording')
    startedAt.current = performance.now()
    raf.current = requestAnimationFrame(loop)
    media.start()

    const playback = await audio.current!.play(morse, timing)
    stopPlayback.current = playback.stop
    await playback.finished

    // Hold the last frame briefly rather than cutting on the final element.
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    media.stop()
    document.removeEventListener('visibilitychange', watchVisibility)

    if (wentHidden) {
      setError(
        'This tab lost focus while recording. The browser stops drawing a hidden tab, so the picture may be frozen for part of the file — the sound will be fine. Record again with this tab in front.',
      )
    }

    const blob = await finished
    setDownload((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return {
        url: URL.createObjectURL(blob),
        name: fileName(message, size, mode, extensionFor(mimeType)),
      }
    })
    setPhase('idle')
    paint(0)
  }, [morse, timing, prepareAudio, loop, paint, message, size, mode])

  const busy = phase !== 'idle'
  const seconds = Math.round(durationMs / 100) / 10

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-line bg-panel p-4 sm:p-6">
        {/* Sized by its own intrinsic ratio, clamped on both axes. `w-full`
            with a max-height does not do this: it holds the box at full width
            and letterboxes the drawing inside it, so a 9:16 export previewed
            as a wide frame — the one thing the preview exists to show. */}
        <canvas
          ref={canvas}
          width={size.width}
          height={size.height}
          className="mx-auto block rounded-lg"
          style={{
            background: '#080b10',
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '62vh',
          }}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => (busy ? stopEverything() : void preview())}
            disabled={!morse}
            className="rounded-lg border px-5 py-2.5 font-mono text-xs tracking-[0.14em] disabled:opacity-40"
            style={{
              borderColor: busy ? 'var(--color-danger)' : 'var(--color-cyan)',
              color: busy ? 'var(--color-danger)' : 'var(--color-cyan)',
            }}
          >
            {busy ? '■ STOP' : '▶ PREVIEW'}
          </button>

          <button
            type="button"
            onClick={() => void record()}
            disabled={!morse || busy}
            className="rounded-lg px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-void disabled:opacity-40"
            style={{ background: 'var(--color-signal)' }}
          >
            {phase === 'recording' ? '● RECORDING' : '● RECORD'}
          </button>

          <span className="font-mono text-[10px] tracking-[0.14em] text-muted">
            {size.width}×{size.height} · {seconds}s
          </span>

          {phase === 'recording' && (
            <span className="font-mono text-[10px] tracking-[0.14em] text-amber">
              KEEP THIS TAB IN FRONT
            </span>
          )}
        </div>

        {download && (
          <p className="mt-4 text-center">
            <a
              href={download.url}
              download={download.name}
              className="inline-block rounded-lg border px-5 py-2.5 font-mono text-xs tracking-[0.14em]"
              style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
            >
              ↓ {download.name}
            </a>
          </p>
        )}

        <p role="status" className={error ? 'mt-4 text-center text-xs text-danger' : 'sr-only'}>
          {error ?? ''}
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <div className="space-y-6">
          <div>
            <label
              htmlFor="studio-message"
              className="font-mono text-[10px] tracking-[0.18em] text-muted"
            >
              MESSAGE
            </label>
            <input
              id="studio-message"
              value={message}
              maxLength={MAX_MESSAGE}
              onChange={(event) => setMessage(event.target.value)}
              className="mt-3 w-full rounded-lg border border-line bg-elevated px-4 py-3 font-mono text-lg tracking-[0.08em] uppercase outline-none focus:border-signal"
            />
            <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-signal-dim">
              {unsupported.length > 0
                ? `Morse has no code for: ${unsupported.join(' ')}`
                : prettify(morse).slice(0, 160) || '—'}
            </p>
          </div>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">LOOK</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {MODES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={mode === entry.id}
                  onClick={() => setMode(entry.id)}
                  className="rounded-lg border p-3 text-left transition-colors"
                  style={{
                    borderColor: mode === entry.id ? 'var(--color-signal)' : 'var(--color-line)',
                    color: mode === entry.id ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  <span className="block font-mono text-xs tracking-[0.12em]">
                    {entry.label.toUpperCase()}
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug opacity-80">
                    {entry.description}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">SIZE</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {SIZES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={sizeId === entry.id}
                  onClick={() => setSizeId(entry.id)}
                  className="rounded-lg border px-4 py-2.5 text-left transition-colors"
                  style={{
                    borderColor: sizeId === entry.id ? 'var(--color-signal)' : 'var(--color-line)',
                    color: sizeId === entry.id ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  <span className="block font-mono text-xs tracking-[0.12em]">{entry.label}</span>
                  <span className="mt-0.5 block text-[11px] opacity-70">{entry.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">
              WHAT IS ON SCREEN
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { on: showLogo, set: setShowLogo, label: 'LOGO' },
                { on: showCaption, set: setShowCaption, label: 'MESSAGE TEXT' },
              ].map((toggle) => (
                <button
                  key={toggle.label}
                  type="button"
                  aria-pressed={toggle.on}
                  onClick={() => toggle.set(!toggle.on)}
                  className="rounded-lg border px-4 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
                  style={{
                    borderColor: toggle.on ? 'var(--color-signal)' : 'var(--color-line)',
                    color: toggle.on ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  {toggle.on ? '✓ ' : ''}
                  {toggle.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="studio-wpm"
              className="font-mono text-[10px] tracking-[0.18em] text-muted"
            >
              SPEED — {wpm} WPM
            </label>
            <input
              id="studio-wpm"
              type="range"
              min={5}
              max={30}
              value={wpm}
              onChange={(event) => setWpm(Number(event.target.value))}
              className="mt-3 w-full"
            />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Slower is more legible on screen. Around 12–18 reads as Morse without dragging.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
