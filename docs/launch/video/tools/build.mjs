// Build one HyperFrames project per promo variant: the edit timeline, the audio
// mix (voice + CW tones + clacks + ducked music) and the composition HTML.
//
//   node docs/launch/video/tools/build.mjs [variant ...]
//   variants: en-full-tall en-full-wide tr-full-tall en-short-tall en-short-wide tr-short-tall
//
// Inputs (all in docs/launch/video): <lang>/build/timeline.json + vo_*.wav from
// tools/vo.py, assets/music.mp3 from tools/music.py, assets/rec/*.mp4 + cues
// (real recordings of the live site, keyed through its own key handler), and
// assets/stills/*.png (real screenshots). Nothing here invents a UI state:
// tones are generated at the exact times the recordings were keyed.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const TEMPO = 1.1 // the voice clone reads slowly; 1.1x stays natural
const LEAD = 1.35 // CRT power-on and the first E before the voice
const SR = 48000
const ff = (...args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])
const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
const r3 = (x) => Math.round(x * 1000) / 1000

const C = { void: '#0c0a07', panel: '#16120d', elevated: '#201a13', line: '#3a3024', lineStrong: '#7a6a52', screen: '#07100a',
  paper: '#e8dcc0', paperInk: '#1e1a13', paperMuted: '#5c5141', brass: '#d4ae6a', brassDeep: '#7d5f2e', wood: '#3b2616',
  signal: '#5df28f', signalDim: '#3fb872', amber: '#ffb547', danger: '#ff6b57', ink: '#f3ead7', muted: '#ab9f8a' }

// ITU-R M.1677-1 letters, for the chart scene.
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..' }
const glyph = (code) => [...code].map((e) => (e === '.' ? '·' : '—')).join(' ')

const COPY = {
  en: {
    telegram: [['SAILING', 'COURSE', 'STOP'], ['RADIO', 'CERTIFICATE', 'REQUIRED', 'STOP'], ['MORSE', 'REQUIRED', 'STOP']],
    telegramHead: 'TELEGRAM', chain: ['BEEP', '· —', 'CHART', 'A'], slow: 'TOO SLOW', sound: 'BY SOUND',
    free: [['FREE', /^free/i], ['NO ACCOUNT', /^account/i], ['NOTHING TO INSTALL', /^install/i], ['WORKS OFFLINE', /^offline/i]],
    open: 'OPEN SOURCE · MIT', tagline: 'Learn Morse. Build the Signal.', note: null,
    words: { tap: /^tap$/i, beep: /^beep/i, dots: /^dots/i, letter: /^letter/i, slow: /^way$/i, sound: /^sound/i, a: /^a:$/i, b: /^b:$/i },
  },
  tr: {
    telegram: [['AMATÖR', 'DENİZCİLİK', 'EĞİTİMİ', 'STOP'], ['TELSİZ', 'BELGESİ', 'ŞART', 'STOP'], ['MORS', 'ŞART', 'STOP']],
    telegramHead: 'TELGRAF', chain: ['BİP', '· —', 'TABLO', 'A'], slow: 'ÇOK YAVAŞ', sound: 'SESİNDEN',
    free: [['ÜCRETSİZ', /^ücretsiz/i], ['HESAP YOK', /^hesap/i], ['KURULUM YOK', /^kurulum/i], ['İNTERNETSİZ ÇALIŞIR', /^internetsiz/i]],
    open: 'AÇIK KAYNAK · MIT', tagline: 'Learn Morse. Build the Signal.', note: 'Arayüz şimdilik İngilizce',
    words: { tap: /^dokun/i, beep: /^sesi$/i, dots: /^noktaları/i, letter: /^harfi$/i, slow: /^çok$/i, sound: /^sesinden/i, a: /^a:$/i, b: /^b:$/i },
  },
}

const CUTS = {
  full: ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13', 's14', 's15', 's16'],
  short: ['s01', 's02', 's05', 's06', 's09', 's12', 's15', 's16'],
}
const FORMATS = { tall: { W: 1080, H: 1920 }, wide: { W: 1920, H: 1080 } }

/* ------------------------------------------------------------------------ */
/* Timeline                                                                  */
/* ------------------------------------------------------------------------ */

function plan(lang, cut, fmt) {
  const vo = JSON.parse(readFileSync(join(ROOT, lang, 'build', 'timeline.json'), 'utf8'))
  const spec = JSON.parse(readFileSync(join(ROOT, lang, 'vo.json'), 'utf8'))
  const byId = Object.fromEntries(vo.lines.map((l) => [l.id, l]))
  const gapOf = Object.fromEntries(spec.lines.map((l) => [l.id, l.gap ?? spec.gap ?? 0.22]))
  // Cue times are when the key was pressed in the driver. The page sometimes
  // reacts later (the very first press waits for the audio engine), so each
  // tone is moved to the first frame where the page visibly changed.
  const rec = (n) => {
    const r = JSON.parse(readFileSync(join(ROOT, 'assets', 'rec', `${n}-${fmt}.cues.json`), 'utf8'))
    const changes = sceneChanges(join(ROOT, 'assets', 'rec', `${n}-${fmt}.mp4`))
    r.cues = r.cues.map((c) => {
      const hit = changes.find((t) => t >= c.on - 0.02 && t <= c.on + 0.6)
      return hit === undefined ? c : { on: hit, off: hit + (c.off - c.on) }
    })
    return r
  }
  const words = COPY[lang].words

  const lines = []
  let t = LEAD
  for (const id of CUTS[cut]) {
    const src = byId[id]
    const dur = (src.end - src.start) / TEMPO
    const ws = src.say.split(/\s+/)
    const wt = src.words.map((w) => w / TEMPO)
    const base = t
    const at = (re) => { const i = ws.findIndex((w) => re.test(w)); return i < 0 ? null : r3(base + (wt[i] ?? 0)) }
    const line = { id, say: src.say, start: r3(t), end: r3(t + dur), clip: join(ROOT, lang, 'build', `vo_${id}.wav`), words: ws, wordTimes: wt.map((w) => r3(t + w)), at }
    let gap = Math.max(0.22, gapOf[id] ?? 0.22)
    if (id === 's06') {
      const cues = rec('hero').cues
      const tap = at(words.tap) ?? line.end - 1
      line.rec = { name: 'hero', start: r3(tap - cues[0].on), cues }
      gap = Math.max(gap, line.rec.start + cues.at(-1).off + 0.9 - line.end)
    }
    if (id === 's09') {
      // Keyed in the telegraph's Manual mode (Ctrl finishes each letter, New word
      // closes the word), so the decode never depends on headless timer jitter.
      const r = rec('telegraph4')
      line.rec = { name: 'telegraph4', start: r3(line.end + 0.2 - r.cues[0].on), cues: r.cues }
      gap = Math.max(gap, line.rec.start + r.marks.at(-1).at + 1.4 - line.end)
    }
    if (id === 's13') {
      // The page starts lighting the tape ~1.5 s after Play; put the first lit
      // letter on screen as the voice starts, so the scene shows it playing.
      const r = rec('message')
      const lit = sceneChanges(join(ROOT, 'assets', 'rec', `message-${fmt}.mp4`)).find((t) => t > r.marks[0].at + 0.5) ?? r.marks[0].at
      line.rec = { name: 'message', start: r3(line.start + 0.3 - lit), cues: [] }
    }
    lines.push(line)
    t = line.end + gap
  }
  const duration = r3(lines.at(-1).end + 2.6)
  lines.forEach((l, i) => {
    l.sceneStart = i === 0 ? 0 : r3(l.start - 0.25)
    l.sceneEnd = i + 1 < lines.length ? r3(lines[i + 1].start - 0.25) : duration
  })
  return { lines, duration }
}

function sceneChanges(file) {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', "select='gt(scene,0.002)',showinfo", '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }).stderr
  return [...out.matchAll(/pts_time:([0-9.]+)/g)].map((m) => parseFloat(m[1]))
}

/* ------------------------------------------------------------------------ */
/* Audio                                                                     */
/* ------------------------------------------------------------------------ */

function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1 }

function synth(duration, events) {
  const n = Math.ceil(duration * SR)
  const buf = new Float32Array(n)
  const rand = lcg(7340)
  for (const ev of events) {
    const i0 = Math.round(ev.at * SR)
    if (ev.kind === 'tone') {
      const len = Math.round(ev.dur * SR), ramp = Math.round(0.005 * SR)
      for (let i = 0; i < len && i0 + i < n; i++) {
        const env = i < ramp ? 0.5 - 0.5 * Math.cos((Math.PI * i) / ramp) : i > len - ramp ? 0.5 - 0.5 * Math.cos((Math.PI * (len - i)) / ramp) : 1
        buf[i0 + i] += ev.vol * env * Math.sin((2 * Math.PI * 600 * i) / SR)
      }
    } else if (ev.kind === 'clack') {
      const len = Math.round(0.07 * SR)
      for (let i = 0; i < len && i0 + i < n; i++) {
        const tt = i / SR
        buf[i0 + i] += ev.vol * (0.55 * rand() * Math.exp(-tt / 0.004) + 0.45 * Math.sin(2 * Math.PI * 1650 * tt) * Math.exp(-tt / 0.012))
      }
    }
  }
  return buf
}

function writeWav(file, mono) {
  const n = mono.length, data = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, mono[i])) * 32767
    data.writeInt16LE(v | 0, i * 4); data.writeInt16LE(v | 0, i * 4 + 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24)
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  writeFileSync(file, Buffer.concat([h, data]))
}

const UNIT = 0.08 // 15 WPM
function codeTones(code, at, vol) {
  const out = []
  let t = at
  for (const e of code) { const d = e === '.' ? UNIT : 3 * UNIT; out.push({ kind: 'tone', at: t, dur: d, vol }); t += d + UNIT }
  return out
}

function sfxEvents(lang, p) {
  const ev = []
  for (const l of p.lines) {
    const W = COPY[lang].words
    if (l.id === 's01') ev.push(...codeTones('.', 0.72, 0.5))
    if (l.id === 's02') for (const w of typingTimes(lang, l)) ev.push({ kind: 'clack', at: w, vol: 0.32 })
    if (l.id === 's04') { const b = l.at(W.beep); if (b) ev.push(...codeTones('.', b - 0.02, 0.28)) }
    if (l.id === 's05') { const s = l.at(W.sound) ?? l.start + 2; ev.push(...codeTones('.', s + 0.25, 0.32), ...codeTones('-', s + 0.85, 0.32)) }
    if (l.rec && l.rec.cues.length) for (const c of l.rec.cues) ev.push({ kind: 'tone', at: l.rec.start + c.on, dur: c.off - c.on, vol: l.id === 's09' ? 0.5 : 0.38 })
    if (l.id === 's15') for (const [, re] of COPY[lang].free) { const w = l.at(re); if (w) ev.push({ kind: 'clack', at: w, vol: 0.25 }) }
    if (l.id === 's16') ev.push(...codeTones('--', l.sceneStart + 0.35, 0.5))
  }
  return ev
}

function typingTimes(lang, l) {
  const words = COPY[lang].telegram.flat()
  const t0 = l.sceneStart + 0.45, t1 = l.end - 0.2
  return words.map((_, i) => r3(t0 + ((t1 - t0) * i) / Math.max(1, words.length - 1)))
}

function mix(lang, p, out) {
  const tmp = out.replace(/\.wav$/, '')
  writeWav(`${tmp}-sfx.wav`, synth(p.duration, sfxEvents(lang, p)))
  const inputs = [], filters = []
  p.lines.forEach((l, i) => {
    inputs.push('-i', l.clip)
    const ms = Math.round(l.start * 1000)
    filters.push(`[${i}:a]atempo=${TEMPO},aresample=${SR},adelay=${ms}|${ms}[v${i}]`)
  })
  const n = p.lines.length
  filters.push(`${p.lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0,apad,atrim=0:${p.duration}[voice]`)
  inputs.push('-i', `${tmp}-sfx.wav`)
  inputs.push('-stream_loop', '-1', '-i', join(ROOT, 'assets', 'music.mp3'))
  filters.push(`[voice]asplit=2[vo][side]`)
  filters.push(`[${n + 1}:a]atrim=0:${p.duration},aresample=${SR},volume=0.42,afade=t=in:d=1.2,afade=t=out:st=${r3(p.duration - 2.2)}:d=2.2[mus]`)
  filters.push(`[mus][side]sidechaincompress=threshold=0.02:ratio=7:attack=25:release=450:makeup=1[duck]`)
  filters.push(`[vo][${n}:a][duck]amix=inputs=3:normalize=0,atrim=0:${p.duration}[pre]`)
  const graph = filters.join(';')
  // Two-pass loudness: measure, then normalise to -14 LUFS / -1.5 dBTP.
  const pass1 = spawnSync('ffmpeg', ['-hide_banner', ...inputs, '-filter_complex', `${graph};[pre]loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  const log = pass1.stderr
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1))
  ff(...inputs, '-filter_complex', `${graph};[pre]loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true[o]`,
    '-map', '[o]', '-ar', String(SR), '-ac', '2', out)
  rmSync(`${tmp}-sfx.wav`)
}

/* ------------------------------------------------------------------------ */
/* Composition                                                               */
/* ------------------------------------------------------------------------ */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function captions(p, F) {
  const pages = []
  for (const l of p.lines) {
    let page = [], start = null
    const flush = (end) => { if (page.length) pages.push({ start, end, words: page }); page = []; start = null }
    l.words.forEach((w, i) => {
      if (start === null) start = l.wordTimes[i]
      page.push({ w, t: l.wordTimes[i] })
      let rest = 0
      for (let k = i + 1; k < l.words.length; k++) { rest++; if (/[.!?:]$/.test(l.words[k])) break }
      const breakHere = /[.!?:]$/.test(w) || (page.length >= (F.W > F.H ? 9 : 6) && rest >= 2) || page.length >= (F.W > F.H ? 11 : 8)
      if (breakHere) flush(i + 1 < l.words.length ? l.wordTimes[i + 1] : r3(l.end + 0.3))
    })
    flush(r3(l.end + 0.3))
  }
  pages.forEach((pg, i) => { if (i + 1 < pages.length) pg.end = Math.min(pg.end, pages[i + 1].start) })
  return pages
}

function build(variant) {
  const [lang, cut, fmt] = variant.split('-')
  const F = FORMATS[fmt]
  const tall = fmt === 'tall'
  const T = COPY[lang]
  const p = plan(lang, cut, fmt)
  const dir = join(ROOT, 'hf', variant)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'media'), { recursive: true })
  symlinkSync('../../assets', join(dir, 'assets'))
  writeFileSync(join(dir, 'hyperframes.json'), JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { assets: 'assets' } }, null, 2))
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ id: `morseforge-${variant}`, name: `MorseForge promo ${variant}` }, null, 2))

  mix(lang, p, join(dir, 'media', 'mix.wav'))

  // Recordings, trimmed or padded so frame 0 of the file is the scene start.
  for (const l of p.lines.filter((l) => l.rec)) {
    const src = join(ROOT, 'assets', 'rec', `${l.rec.name}-${fmt}.mp4`)
    const off = l.sceneStart - l.rec.start
    const len = r3(l.sceneEnd - l.sceneStart + 0.6)
    const vf = off >= 0 ? [] : ['-vf', `tpad=start_mode=clone:start_duration=${r3(-off)}`]
    ff(...(off > 0 ? ['-ss', String(r3(off))] : []), '-i', src, ...vf, '-t', String(len), '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '30', '-keyint_min', '30', '-movflags', '+faststart', join(dir, 'media', `${l.id}.mp4`))
  }

  const S = [] // scene html
  const V = [] // root-level video wrappers
  const J = [] // timeline js
  const pages = captions(p, F)
  const sz = tall ? { big: 120, mid: 64, cap: 54 } : { big: 110, mid: 54, cap: 44 }

  p.lines.forEach((l, i) => {
    const s0 = l.sceneStart, d = r3(l.sceneEnd - l.sceneStart + (i + 1 < p.lines.length ? 0.3 : 0)), z = 10 + i * 2
    const fade = i === 0 ? '' : `tl.fromTo("#${l.id} .in",{opacity:0},{opacity:1,duration:0.28,ease:"power1.out"},${s0});`
    let inner = ''
    const still = (name, extra = '') => {
      J.push(`tl.fromTo("#${l.id} .shot",{scale:1.0},{scale:1.045,duration:${d},ease:"none"},${s0});`)
      return `<div class="frame"><img class="shot" src="assets/stills/${name}-${fmt}.png" alt="" ${extra}/></div>`
    }
    switch (l.id) {
      case 's01':
        inner = `<div class="crt center-crt"><div class="glass"><div class="powerline"></div>
          <div class="eq"><span class="E">E</span><span class="eqs">=</span><span class="dot1"></span></div></div></div>`
        J.push(`tl.fromTo("#s01 .powerline",{scaleX:0.02,scaleY:0.02,opacity:1},{scaleX:1,scaleY:0.02,duration:0.22,ease:"power2.out"},0.05);`,
          `tl.to("#s01 .powerline",{scaleY:1,opacity:0,duration:0.22,ease:"power2.in"},0.27);`,
          `tl.fromTo("#s01 .eq",{opacity:0},{opacity:1,duration:0.18},0.42);`,
          `tl.fromTo("#s01 .dot1",{scale:1,boxShadow:"0 0 0px ${C.signal}"},{scale:1.35,boxShadow:"0 0 60px ${C.signal}",duration:0.08,yoyo:true,repeat:1},0.72);`)
        break
      case 's02': {
        const times = typingTimes(lang, l)
        let k = 0
        const rows = T.telegram.map((row, r) => `<div class="tg-row ${r === T.telegram.length - 1 ? 'red' : ''}">${row.map((w) => `<span class="tw" data-k="${k++}">${esc(w)}</span>`).join(' ')}</div>`).join('')
        inner = `<div class="paper telegram"><div class="perf"></div><div class="tg-head"><span>${T.telegramHead}</span><span>MORSEFORGE · No. 1</span></div><div class="tg-body">${rows}</div><div class="perf bottom"></div></div>`
        times.forEach((t, j) => J.push(`tl.fromTo('#s02 .tw[data-k="${j}"]',{opacity:0,y:6},{opacity:1,y:0,duration:0.06},${t});`))
        J.push(`tl.fromTo("#s02 .telegram",{y:40,rotation:-1.2},{y:0,rotation:-0.6,duration:0.6,ease:"power2.out"},${s0});`)
        break
      }
      case 's03': {
        const letters = Object.keys(MORSE)
        const cols = tall ? 2 : 4
        const per = Math.ceil(letters.length / cols)
        const colHtml = Array.from({ length: cols }, (_, c) => `<div class="ch-col">${letters.slice(c * per, (c + 1) * per).map((L) => `<div class="ch-row" id="row-${L}"><b>${L}</b><span>${glyph(MORSE[L])}</span></div>`).join('')}</div>`).join('')
        inner = `<div class="paper chart"><div class="ch-title">INTERNATIONAL MORSE CODE</div><div class="ch-grid">${colHtml}</div></div>`
        const a = l.at(T.words.a) ?? l.start + 4, b = l.at(T.words.b) ?? l.start + 5.5
        J.push(`tl.fromTo("#s03 #row-A",{backgroundColor:"rgba(255,181,71,0)"},{backgroundColor:"rgba(255,181,71,0.55)",duration:0.15},${a});`,
          `tl.fromTo("#s03 #row-B",{backgroundColor:"rgba(255,181,71,0)"},{backgroundColor:"rgba(255,181,71,0.55)",duration:0.15},${b});`,
          `tl.fromTo("#s03 .chart",{scale:1},{scale:1.06,duration:${d},ease:"none"},${s0});`)
        break
      }
      case 's04': {
        const chain = T.chain.map((c, j) => `<div class="node n${j}">${esc(c)}</div>${j < T.chain.length - 1 ? `<div class="arrow a${j}">→</div>` : ''}`).join('')
        inner = `<div class="chain ${tall ? 'vertical' : ''}">${chain}</div><div class="stamp slow">${esc(T.slow)}</div>`
        const w = [l.at(T.words.beep), l.at(T.words.dots), l.at(T.words.letter), l.at(T.words.letter)]
        w.forEach((t, j) => {
          const at = r3((t ?? l.start + 1 + j) + (j === 3 ? 0.45 : 0))
          J.push(`tl.fromTo("#s04 .n${j}",{opacity:0,scale:0.85},{opacity:1,scale:1,duration:0.22,ease:"back.out(2)"},${at});`)
          if (j > 0) J.push(`tl.fromTo("#s04 .a${j - 1}",{opacity:0},{opacity:1,duration:0.15},${r3(at - 0.12)});`)
        })
        const sl = l.at(T.words.slow) ?? l.end - 1
        J.push(`tl.fromTo("#s04 .stamp",{opacity:0,scale:1.8,rotation:-14},{opacity:1,scale:1,rotation:-8,duration:0.2,ease:"power3.in"},${sl});`)
        break
      }
      case 's05': {
        const s = l.at(T.words.sound) ?? l.start + 2
        inner = `<div class="crt center-crt"><div class="glass"><svg class="wave" viewBox="0 0 600 120"><path d="M0 60 H140 V20 H170 V100 H200 V60 H250 V20 H330 V100 H360 V60 H600" fill="none" stroke="${C.signal}" stroke-width="6"/></svg>
          <div class="pair"><span class="L1">E</span><span class="L2">T</span></div><div class="sub">${esc(T.sound)}</div></div></div>`
        J.push(`tl.fromTo("#s05 .wave path",{strokeDasharray:1200,strokeDashoffset:1200},{strokeDashoffset:0,duration:1.2,ease:"none"},${r3(s0 + 0.3)});`,
          `tl.fromTo("#s05 .L1",{opacity:0.08},{opacity:1,duration:0.08},${r3(s + 0.25)});`,
          `tl.fromTo("#s05 .L2",{opacity:0.08},{opacity:1,duration:0.08},${r3(s + 0.85)});`,
          `tl.fromTo("#s05 .sub",{opacity:0},{opacity:1,duration:0.3},${r3(s + 1.2)});`)
        break
      }
      case 's06': case 's09': case 's13':
        V.push(`<div class="vwrap" id="v-${l.id}" style="z-index:${z + 1}"><video id="vid-${l.id}" src="media/${l.id}.mp4" muted playsinline data-start="${s0}" data-duration="${d}" data-track-index="${3 + (i % 2)}"></video></div>`)
        J.push(`tl.fromTo("#v-${l.id}",{opacity:0,scale:1.0},{opacity:1,scale:1.0,duration:0.28},${s0});`,
          `tl.fromTo("#vid-${l.id}",{scale:1.0},{scale:1.04,duration:${d},ease:"none",immediateRender:false},${s0});`,
          `tl.to("#v-${l.id}",{opacity:0,duration:0.01},${r3(s0 + d)});`)
        break
      case 's07': inner = still('lesson'); break
      case 's08': inner = still('tree'); break
      case 's10':
        inner = `<div class="frame"><img class="shot g1" src="assets/stills/defender-${fmt}.png" alt=""/><img class="shot g2" src="assets/stills/runner-${fmt}.png" alt=""/></div>`
        J.push(`tl.fromTo("#s10 .g1",{scale:1},{scale:1.04,duration:${d},ease:"none"},${s0});`,
          `tl.fromTo("#s10 .g2",{opacity:0,scale:1},{opacity:1,scale:1.03,duration:0.3},${r3(s0 + d / 2)});`)
        break
      case 's11': inner = still('daily'); break
      case 's12': inner = still('challenge'); break
      case 's14':
        inner = `<div class="cardshot"><img src="assets/stills/lamp.png" alt=""/></div>`
        J.push(`tl.fromTo("#s14 .cardshot",{scale:0.98},{scale:1.03,duration:${d},ease:"none"},${s0});`)
        break
      case 's15': {
        const items = T.free.map(([txt], j) => `<div class="fl f${j}">&gt; ${esc(txt)}</div>`).join('') + `<div class="fl amber fopen">&gt; ${esc(T.open)}</div>`
        inner = `<div class="crt center-crt"><div class="glass list">${items}</div></div>`
        T.free.forEach(([, re], j) => J.push(`tl.fromTo("#s15 .f${j}",{opacity:0,x:-12},{opacity:1,x:0,duration:0.12},${r3(l.at(re) ?? l.start + j)});`))
        J.push(`tl.fromTo("#s15 .fopen",{opacity:0},{opacity:1,duration:0.15},${r3(l.end + 0.05)});`)
        break
      }
      case 's16': {
        const wm = JSON.parse(readFileSync(join(ROOT, 'assets', 'wordmark.json'), 'utf8'))
        inner = `<div class="endcard"><svg class="mark" viewBox="0 0 84 64"><path class="m1" d="M7 57V7L28 34" fill="none" stroke="${C.signal}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path class="m2" d="M77 57V7L56 34" fill="none" stroke="${C.signal}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <svg class="wordmark" viewBox="0 -40 ${wm.width} ${wm.bottom + 60}"><path d="${wm.d}" fill="${C.ink}"/></svg>
          <div class="tag">${esc(T.tagline)}</div><div class="url">morse.iamcanturk.dev</div>${T.note ? `<div class="note">${esc(T.note)}</div>` : ''}</div>`
        const a = r3(s0 + 0.35)
        J.push(`tl.fromTo("#s16 .m1",{strokeDasharray:160,strokeDashoffset:160},{strokeDashoffset:0,duration:0.24,ease:"none"},${a});`,
          `tl.fromTo("#s16 .m2",{strokeDasharray:160,strokeDashoffset:160},{strokeDashoffset:0,duration:0.24,ease:"none"},${r3(a + 0.32)});`,
          `tl.fromTo("#s16 .wordmark",{opacity:0,y:16},{opacity:1,y:0,duration:0.4,ease:"power2.out"},${r3(a + 0.75)});`,
          `tl.fromTo("#s16 .tag",{opacity:0},{opacity:1,duration:0.4},${r3(a + 1.05)});`,
          `tl.fromTo("#s16 .url",{opacity:0,y:10},{opacity:1,y:0,duration:0.35},${r3(a + 1.35)});`)
        J.push(`tl.to(".brandchip",{opacity:0,duration:0.3},${s0});`)
        if (T.note) J.push(`tl.fromTo("#s16 .note",{opacity:0},{opacity:1,duration:0.35},${r3(a + 1.6)});`)
        break
      }
    }
    S.push(`<section id="${l.id}" class="clip scene" data-start="${s0}" data-duration="${d}" data-track-index="1" style="z-index:${z}"><div class="in">${inner}</div></section>`)
    if (fade) J.push(fade)
  })

  // Captions: one clip per page, the spoken word lit as it is said.
  const capHtml = pages.map((pg, k) => `<div id="cap${k}" class="clip cap" data-start="${pg.start}" data-duration="${r3(pg.end - pg.start)}" data-track-index="6"><div class="capin">${pg.words.map((w, j) => `<span class="cw" data-j="${j}">${esc(w.w)}</span>`).join(' ')}</div></div>`).join('\n')
  pages.forEach((pg, k) => pg.words.forEach((w, j) => J.push(`tl.fromTo('#cap${k} .cw[data-j="${j}"]',{color:"${C.ink}"},{color:"${C.signal}",duration:0.05},${w.t});`)))

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${F.W}, height=${F.H}" />
<title>MorseForge promo ${variant}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face { font-family: "Space Grotesk"; src: url("assets/fonts/space-grotesk-700.woff2") format("woff2"); font-weight: 700; }
@font-face { font-family: "JetBrains Mono"; src: url("assets/fonts/jetbrains-mono-400.woff2") format("woff2"); font-weight: 400; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${F.W}px; height: ${F.H}px; overflow: hidden; background: ${C.void}; }
body { font-family: "Space Grotesk", sans-serif; color: ${C.ink}; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${C.void}; }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(212,174,106,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(212,174,106,0.05) 1px, transparent 1px); background-size: 48px 48px; }
.scene { position: absolute; inset: 0; overflow: hidden; }
.in { position: absolute; inset: 0; }
.frame { position: absolute; left: ${tall ? 90 : 160}px; top: ${tall ? 56 : 28}px; width: ${tall ? 900 : 1600}px; height: ${tall ? 1600 : 900}px; border-radius: ${tall ? 40 : 28}px; overflow: hidden; border: 6px solid ${C.elevated}; box-shadow: 0 0 0 2px ${C.brassDeep}, 0 30px 90px rgba(0,0,0,0.7); background: ${C.void}; }
.shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; transform-origin: 50% 35%; }
.g2 { opacity: 0; }
.vwrap { position: absolute; left: ${tall ? 90 : 160}px; top: ${tall ? 56 : 28}px; width: ${tall ? 900 : 1600}px; height: ${tall ? 1600 : 900}px; border-radius: ${tall ? 40 : 28}px; overflow: hidden; opacity: 0; border: 6px solid ${C.elevated}; box-shadow: 0 0 0 2px ${C.brassDeep}, 0 30px 90px rgba(0,0,0,0.7); }
.vwrap video { width: 100%; height: 100%; object-fit: cover; object-position: top center; transform-origin: 50% 35%; }
.crt { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.glass { position: relative; width: ${tall ? 900 : 1300}px; height: ${tall ? 900 : 680}px; margin-top: ${tall ? -200 : -110}px; border-radius: 44px; background: radial-gradient(ellipse at 50% 45%, #0d1d12 0%, ${C.screen} 70%); border: 10px solid ${C.elevated}; box-shadow: 0 0 0 2px ${C.brassDeep}, inset 0 0 120px rgba(0,0,0,0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
.glass::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 4px); pointer-events: none; }
.powerline { position: absolute; left: 0; right: 0; top: 50%; height: 100%; margin-top: -50%; background: ${C.signal}; transform-origin: 50% 50%; opacity: 0; }
.eq { display: flex; align-items: center; gap: 48px; opacity: 0; }
.E { font-size: ${tall ? 420 : 380}px; line-height: 1; color: ${C.signal}; text-shadow: 0 0 6px ${C.signal}, 0 0 48px rgba(93,242,143,0.5); }
.eqs { font-family: "JetBrains Mono"; font-size: 120px; color: ${C.muted}; }
.dot1 { width: 64px; height: 64px; border-radius: 50%; background: ${C.signal}; }
.paper { position: absolute; background: ${C.paper}; color: ${C.paperInk}; box-shadow: 0 30px 80px rgba(0,0,0,0.6); }
.telegram { left: ${tall ? 70 : 360}px; right: ${tall ? 70 : 360}px; top: ${tall ? 440 : 130}px; padding: 48px 56px 64px; border-radius: 6px; }
.perf { position: absolute; left: 18px; right: 18px; top: 18px; height: 10px; background-image: radial-gradient(circle, ${C.paperInk} 4px, transparent 5px); background-size: 28px 10px; opacity: 0.85; }
.perf.bottom { top: auto; bottom: 18px; }
.tg-head { display: flex; justify-content: space-between; font-family: "JetBrains Mono"; font-size: ${tall ? 30 : 26}px; letter-spacing: 0.2em; color: ${C.paperMuted}; border-bottom: 2px dashed ${C.paperMuted}; padding: 26px 0 18px; margin-bottom: 26px; }
.tg-row { font-family: "JetBrains Mono"; font-size: ${tall ? 60 : 64}px; line-height: 1.35; letter-spacing: 0.04em; }
.tg-row.red { color: #b3261e; }
.tw { opacity: 0; display: inline-block; }
.chart { left: 50%; top: 50%; width: ${tall ? 860 : 1500}px; margin-left: -${tall ? 430 : 750}px; margin-top: -${tall ? 760 : 440}px; padding: 40px 48px; border-radius: 8px; transform-origin: 50% 45%; }
.ch-title { font-family: "JetBrains Mono"; font-size: 28px; letter-spacing: 0.25em; color: ${C.paperMuted}; margin-bottom: 24px; }
.ch-grid { display: flex; gap: ${tall ? 40 : 30}px; }
.ch-col { flex: 1; }
.ch-row { display: flex; gap: 22px; align-items: baseline; font-size: ${tall ? 40 : 38}px; padding: 3px 10px; border-radius: 6px; line-height: ${tall ? 1.42 : 1.2}; }
.ch-row b { width: 1.2em; }
.ch-row span { font-family: "JetBrains Mono"; color: ${C.paperInk}; }
.chain { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 28px; }
.chain { margin-top: -110px; }
.chain.vertical { flex-direction: column; gap: 22px; margin-top: -260px; }
.node { opacity: 0; min-width: 220px; padding: 28px 40px; text-align: center; border: 4px solid ${C.lineStrong}; border-radius: 22px; background: ${C.elevated}; font-family: "JetBrains Mono"; font-size: ${sz.mid}px; color: ${C.ink}; }
.node.n3 { color: ${C.signal}; border-color: ${C.signalDim}; }
.arrow { opacity: 0; font-size: ${sz.mid}px; color: ${C.muted}; }
.chain.vertical .arrow { transform: rotate(90deg); }
.stamp { position: absolute; left: 50%; top: ${tall ? 1290 : 700}px; transform: translateX(-50%); padding: 14px 34px; border: 8px solid ${C.danger}; color: ${C.danger}; font-family: "JetBrains Mono"; font-size: ${tall ? 84 : 72}px; letter-spacing: 0.12em; border-radius: 12px; opacity: 0; }
.wave { width: 78%; }
.pair { display: flex; gap: 120px; margin: 30px 0 10px; }
.pair span { font-size: ${tall ? 260 : 240}px; color: ${C.signal}; text-shadow: 0 0 6px ${C.signal}, 0 0 48px rgba(93,242,143,0.5); opacity: 0.08; line-height: 1; }
.sub { font-family: "JetBrains Mono"; font-size: 44px; letter-spacing: 0.3em; color: ${C.amber}; opacity: 0; }
.list { align-items: flex-start; padding: 0 80px; gap: 26px; }
.fl { font-family: "JetBrains Mono"; font-size: ${tall ? 56 : 58}px; color: ${C.signal}; text-shadow: 0 0 4px ${C.signal}, 0 0 30px rgba(93,242,143,0.4); opacity: 0; }
.fl.amber { color: ${C.amber}; text-shadow: 0 0 4px ${C.amber}, 0 0 30px rgba(255,181,71,0.4); }
.cardshot { position: absolute; left: 50%; top: ${tall ? 380 : 60}px; width: ${tall ? 980 : 1000}px; margin-left: -${tall ? 490 : 500}px; border-radius: 28px; overflow: hidden; border: 6px solid ${C.elevated}; box-shadow: 0 0 0 2px ${C.brassDeep}, 0 40px 100px rgba(0,0,0,0.7), 0 0 120px rgba(93,242,143,0.18); }
.cardshot img { display: block; width: 100%; }
.endcard { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${tall ? 40 : 28}px; margin-top: ${tall ? -200 : -80}px; }
.mark { width: ${tall ? 300 : 220}px; filter: drop-shadow(0 0 30px rgba(93,242,143,0.45)); }
.wordmark { width: ${tall ? 780 : 760}px; opacity: 0; }
.tag { font-family: "JetBrains Mono"; font-size: ${tall ? 32 : 34}px; letter-spacing: ${tall ? 0.14 : 0.22}em; color: ${C.amber}; text-transform: uppercase; opacity: 0; }
.url { font-family: "JetBrains Mono"; font-size: ${tall ? 54 : 46}px; color: ${C.ink}; padding: 16px 34px; border: 3px solid ${C.lineStrong}; border-radius: 16px; background: ${C.panel}; opacity: 0; }
.note { font-family: "JetBrains Mono"; font-size: 32px; color: ${C.muted}; opacity: 0; }
.shade { position: absolute; left: 0; right: 0; bottom: 0; height: ${tall ? 300 : 170}px; background: linear-gradient(rgba(12,10,7,0) 0%, rgba(12,10,7,0.88) 55%, rgba(12,10,7,0.96) 100%); z-index: 90; }
.vignette { position: absolute; inset: 0; z-index: 91; background: radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(0,0,0,0.45) 100%); pointer-events: none; }
.cap { position: absolute; left: 0; right: 0; ${tall ? 'top: 1688px;' : 'top: 950px;'} z-index: 95; display: flex; justify-content: center; }
.capin { max-width: ${tall ? 960 : 1560}px; text-align: center; font-size: ${sz.cap}px; line-height: 1.25; font-weight: 700; color: ${C.ink}; text-shadow: 0 3px 12px rgba(0,0,0,0.9); }
.brandchip { position: absolute; z-index: 96; ${tall ? 'left: 0; right: 0; bottom: 26px; text-align: center;' : 'right: 40px; bottom: 22px;'} font-family: "JetBrains Mono"; font-size: ${tall ? 30 : 26}px; letter-spacing: 0.12em; color: ${C.muted}; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${F.W}" data-height="${F.H}" data-duration="${p.duration}" data-fps="30">
<div class="grid"></div>
${S.join('\n')}
${V.join('\n')}
<div class="shade"></div>
<div class="vignette"></div>
${capHtml}
<div class="brandchip">morse.iamcanturk.dev</div>
<audio id="mix" src="media/mix.wav" data-start="0" data-duration="${p.duration}" data-track-index="9" data-volume="1"></audio>
</div>
<script>
const tl = gsap.timeline({ paused: true });
${J.join('\n')}
window.__timelines["main"] = tl;
</script>
</body>
</html>
`
  writeFileSync(join(dir, 'index.html'), html)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({ variant, duration: p.duration, lines: p.lines.map(({ clip, at, ...l }) => l) }, null, 1))
  console.log(variant, p.duration + 's', p.lines.length, 'lines')
}

const ALL = ['en-full-tall', 'en-full-wide', 'tr-full-tall', 'en-short-tall', 'en-short-wide', 'tr-short-tall']
for (const v of process.argv.slice(2).length ? process.argv.slice(2) : ALL) build(v)
