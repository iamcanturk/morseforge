// Record a real interaction on the live site as an MP4 via CDP screencast,
// plus a cue file with every key-down/up time (seconds from clip start), so
// the CW audio can be generated in exact sync.
// usage: node record.mjs <name> <outDir> <wide|tall>
import { launch, sleep } from './cdp.mjs'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const [name, OUT, size] = process.argv.slice(2)
const B = 'https://morse.iamcanturk.dev'
const VIEW = size === 'tall' ? [432, 768, 2.5, true] : [1600, 900, 1.2, false]
const frames = `${OUT}/.frames-${name}-${size}`
rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true })

const c = await launch({ port: 9400 + Math.floor(Math.random() * 400) })
await c.send('Storage.clearDataForOrigin', { origin: B, storageTypes: 'all' })
await c.scheme('dark')
await c.viewport(...VIEW)

const scrollToPanel = (label, offset, minHeight = 300) =>
  c.eval(`(() => {
    const all = [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && e.textContent.trim().toUpperCase().startsWith(${JSON.stringify(label)}))
    let el = all[0]; if (!el) return 'missing'
    while (el.parentElement && el.getBoundingClientRect().height < ${minHeight}) el = el.parentElement
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY - ${offset}); return 'ok'
  })()`)

const SCENES = {
  hero: { url: '/', prep: async () => { if (size === 'tall') await c.eval(`window.scrollTo(0, document.querySelector('[data-station]').getBoundingClientRect().top + scrollY - 66)`) },
    play: ['.', '-', '.-'], gap: 1100 },
  telegraph: { url: '/telegraph/', prep: async () => { await scrollToPanel('SEND', size === 'tall' ? 66 : 84, 500) },
    play: ['...', '---', '...'], gap: 1900 },
}
const clickText = async (text) => {
  const box = await c.eval(`(() => { const el = [...document.querySelectorAll('main button')].find(b => b.innerText.trim().toUpperCase().replace(/\\s+/g,' ').includes(${JSON.stringify(text)})); if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] })()`)
  if (!box) throw new Error('no button ' + text)
  await c.click(...box)
}
SCENES.telegraph2 = { url: '/telegraph/', prep: async () => { await clickText('STANDARD'); await scrollToPanel('SEND', size === 'tall' ? 66 : 84, 500) },
  play: ['...', '---', '...'], gap: 380, dot: 70, dash: 220, intra: 80, lead: 900, tail: 2200 }
SCENES.telegraph3 = { url: '/telegraph/', prep: async () => { await clickText('RELAXED'); await scrollToPanel('SEND', size === 'tall' ? 66 : 84, 500) },
  play: ['...', '---', '...'], gap: 1150, dot: 70, dash: 230, intra: 110, lead: 900, tail: 2200 }
SCENES.telegraph4 = { url: '/telegraph/', prep: async () => { await clickText('MANUAL'); await scrollToPanel('SEND', size === 'tall' ? 66 : 84, 500) },
  play: ['...', '---', '...'], gap: 420, dot: 70, dash: 230, intra: 110, lead: 900, tail: 2400, finish: true,
  actions: async (mark) => { await sleep(350); mark('newword'); await clickText('NEW WORD') } }
SCENES.message = { url: '/message/#m=V0hBVCBIQVRIIEdPRCBXUk9VR0hU&wpm=18', prep: async () => { await scrollToPanel('INCOMING WIRE', size === 'tall' ? 66 : 84) },
  actions: async (mark) => { await sleep(500); mark('play'); await clickText('PLAY MESSAGE'); await scrollToPanel('INCOMING WIRE', size === 'tall' ? 66 : 84); await sleep(7000) } }
SCENES.lamp = { url: '/settings/', prep: async () => { await c.eval(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim().toUpperCase() === 'LAMP').click()`); await sleep(300); await c.goto(B + '/practice/', 2500); await clickText('LISTEN'); await clickText('START'); await sleep(2500); await scrollToPanel('RX', size === 'tall' ? 66 : 84, 400) },
  actions: async (mark) => { for (let i = 0; i < 3; i++) { await sleep(600); mark('play'); await clickText('PLAY AGAIN'); await sleep(1400) } } }
const scene = SCENES[name]
await c.goto(B + scene.url, 2500)
await scene.prep()
await sleep(600)

let t0 = null
const shots = []
c.on(async (m) => {
  if (m.method !== 'Page.screencastFrame') return
  const { data, metadata, sessionId } = m.params
  shots.push({ t: metadata.timestamp, data })
  c.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
const W = Math.round(VIEW[0] * VIEW[2]), H = Math.round(VIEW[1] * VIEW[2])
await c.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
const start = Date.now() / 1000
await sleep(scene.lead ?? 1200)
const cues = [], marks = []
const DOT = scene.dot ?? 60, DASH = scene.dash ?? 250
for (const code of scene.play ?? []) {
  for (const e of code) {
    const ms = e === '.' ? DOT : DASH
    cues.push({ on: Date.now() / 1000 - start, off: Date.now() / 1000 - start + ms / 1000 })
    await c.space(ms)
    await sleep(scene.intra ?? 110)
  }
  if (scene.finish) { await sleep(120); await c.press('Control', 'ControlLeft', 17) }
  await sleep(scene.gap)
}
if (scene.actions) await scene.actions((label) => marks.push({ label, at: Date.now() / 1000 - start }))
await sleep(scene.tail ?? 1500)
await c.send('Page.stopScreencast')
await sleep(300)
const end = Date.now() / 1000 - start
for (const s of shots) s.t = Math.max(0, s.t - start)
if (shots.length) shots[0].t = 0
await c.close()

// Write frames, then an ffconcat with per-frame durations (VFR -> 30 fps CFR).
// Screencast timestamps are wall-clock seconds; align them with `start`.
const offset = shots.length ? 0 : 0
let list = 'ffconcat version 1.0\n'
shots.forEach((s, i) => {
  const f = `${frames}/${String(i).padStart(5, '0')}.jpg`
  writeFileSync(f, Buffer.from(s.data, 'base64'))
  const next = i + 1 < shots.length ? shots[i + 1].t : end
  list += `file '${String(i).padStart(5, "0")}.jpg'\nduration ${Math.max(0.001, next - s.t).toFixed(4)}\n`
})
list += `file '${String(shots.length - 1).padStart(5, '0')}.jpg'\n`
writeFileSync(`${frames}/list.txt`, list)
const mp4 = `${OUT}/rec-${name}-${size}.mp4`
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${frames}/list.txt`,
  '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', mp4])
writeFileSync(`${OUT}/rec-${name}-${size}.cues.json`, JSON.stringify({ duration: end, cues, marks }, null, 1))
rmSync(frames, { recursive: true, force: true })
console.log(mp4, shots.length, 'frames', end.toFixed(2), 's')
