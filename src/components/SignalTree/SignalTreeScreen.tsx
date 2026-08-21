import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SignalTree } from './SignalTree'
import { CharacterDrill } from './CharacterDrill'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { levelToNodeState, pathTo } from '../../data/tree'
import type { NodeState } from '../../data/tree'
import { ALL_LETTERS } from '../../data/morseAlphabet'
import { AudioEngine } from '../../engine/audioEngine'
import { prettify } from '../../engine/morseEncoder'
import { type Skill, masteryLevel } from '../../game/mastery'
import {
  type ProgressRecord,
  answer,
  createProgressStore,
  getCharacter,
  markSeen,
  overallMastery,
} from '../../storage/progress'
import { type SettingsRecord, createSettingsStore, defaultSettings } from '../../storage/settings'

/**
 * The Signal Tree screen (PROJECT.md §3, §16, §17).
 *
 * Reads progress, renders the tree, and plays a character when its node is
 * picked — so this is also the first place the Web Audio engine runs for real.
 */
export function SignalTreeScreen() {
  const store = useMemo(() => createProgressStore(), [])
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const audio = useRef<AudioEngine | null>(null)

  // Progress starts empty rather than being read during render: this component
  // is prerendered at build time, where there is no localStorage, and rendering
  // different markup on the client than the server would tear the hydration.
  const [progress, setProgress] = useState<ProgressRecord>({ characters: {} })
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [selected, setSelected] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setProgress(store.read())
    return store.subscribe(setProgress)
  }, [store])

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => {
    return () => void audio.current?.dispose()
  }, [])

  const states = useMemo<Record<string, NodeState>>(() => {
    const now = Date.now()
    return Object.fromEntries(
      ALL_LETTERS.map((character) => {
        const entry = getCharacter(progress, character, now)
        return [character, levelToNodeState(masteryLevel(entry.skills, entry.seen))]
      }),
    )
  }, [progress])

  const power = useMemo(() => overallMastery(progress, ALL_LETTERS), [progress])

  const play = useCallback(async (character: string) => {
    const code = MORSE_ALPHABET[character]
    if (!code) return

    // Created lazily inside the click handler: browsers only allow an
    // AudioContext to start from a user gesture.
    audio.current ??= new AudioEngine()
    setPlaying(true)
    try {
      const playback = await audio.current.play(code, { wpm: 15, farnsworthWpm: 8 })
      await playback.finished
    } finally {
      setPlaying(false)
    }
  }, [])

  const select = useCallback(
    (character: string) => {
      setSelected(character)
      // Opening a character counts as meeting it (§5 level 1 "Seen"), which is
      // what lights the node before any attempt has been made.
      store.update((current) => markSeen(current, character, Date.now()))
      void play(character)
    },
    [play, store],
  )

  const recordAttempt = useCallback(
    (character: string, skill: Skill, correct: boolean) => {
      store.update((current) => answer(current, character, skill, correct, Date.now()))
    },
    [store],
  )

  const code = selected ? MORSE_ALPHABET[selected] : null
  const path = selected ? pathTo(selected) : []

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <SignalTree
        states={states}
        power={power}
        highlight={selected}
        onSelect={select}
        className="min-w-0"
      />

      <aside className="rounded-xl border border-line bg-panel p-6">
        {selected && code ? (
          <>
            <div className="flex items-baseline gap-4">
              <span className="font-display text-5xl font-bold text-signal">{selected}</span>
              <span className="font-mono text-2xl tracking-[0.2em] text-cyan">
                {prettify(code)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void play(selected)}
              disabled={playing}
              className="mt-5 w-full rounded-lg border border-signal/40 px-4 py-2.5 font-mono text-xs tracking-[0.16em] text-signal disabled:opacity-50"
            >
              {playing ? '▶ TRANSMITTING' : '▶ REPLAY'}
            </button>

            <div className="mt-7">
              <div className="font-mono text-[10px] tracking-[0.18em] text-muted">PATH</div>
              <ol className="mt-3 space-y-1.5 font-mono text-sm">
                {path.map((node, index) => (
                  <li key={node.code || 'root'} className="flex items-center gap-2">
                    <span className="text-muted">
                      {index === 0 ? 'START' : node.code.at(-1) === '.' ? 'DOT ' : 'DASH'}
                    </span>
                    {node.character && <span className="text-signal">→ {node.character}</span>}
                  </li>
                ))}
              </ol>
            </div>

            <CharacterDrill character={selected} settings={settings} onAttempt={recordAttempt} />
          </>
        ) : (
          <p className="font-mono text-xs leading-relaxed tracking-[0.1em] text-muted">
            PICK A NODE
            <br />
            <br />
            Every character sits where its code spells it out. A dot branches left, a dash branches
            right.
          </p>
        )}
      </aside>
    </div>
  )
}
