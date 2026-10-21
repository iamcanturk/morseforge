// Produce launch screenshots from the live site into docs/launch/assets/.
// Every state is a real one: the hero and the telegraph are keyed through the
// page's own key handler, the message link is a real /message/ fragment.
import { launch, sleep } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = process.argv[2]
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null
mkdirSync(OUT, { recursive: true })
const B = 'https://morse.iamcanturk.dev'
const MSG = Buffer.from('WHAT HATH GOD WROUGHT').toString('base64url')
export const MESSAGE_URL = `${B}/message/#m=${MSG}&wpm=18`

// Output sizes and the CSS viewport + scale that render them at 2x.
const SIZES = {
  wide: { w: 1200, h: 630, css: [1600, 840, 1.5], mobile: false },
  tall: { w: 1080, h: 1350, css: [432, 540, 5], mobile: true },
  ph: { w: 1270, h: 760, css: [1270, 760, 2], mobile: false },
}

const c = await launch()

async function shot(name, size, scheme, setup) {
  if (ONLY && !ONLY.has(name.split('-').slice(0, 2).join('-')) && !ONLY.has(name)) return
  const s = SIZES[size]
  await c.send('Storage.clearDataForOrigin', { origin: B, storageTypes: 'all' })
  await c.scheme(scheme)
  await c.viewport(...s.css, s.mobile)
  await setup()
  const raw = `${OUT}/.raw-${name}.png`
  await c.shot(raw)
  const file = `${OUT}/${name}-${s.w}x${s.h}.png`
  execFileSync('magick', [raw, '-filter', 'Lanczos', '-resize', `${s.w}x${s.h}!`, '-strip', file])
  execFileSync('rm', [raw])
  console.log('wrote', file)
}

const scrollTo = (selector, offset = 90) =>
  c.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; window.scrollTo(0, el.getBoundingClientRect().top + scrollY - ${offset}); return 'ok' })()`)
// Scroll so the panel that holds a label sits just under the sticky header.
const scrollToPanel = (label, offset = 80, minHeight = 300) =>
  c.eval(`(() => {
    const all = [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && e.textContent.trim().toUpperCase().startsWith(${JSON.stringify(label)}))
    let el = all[0]; if (!el) return 'missing'
    while (el.parentElement && el.getBoundingClientRect().height < ${minHeight}) el = el.parentElement
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY - ${offset}); return 'ok'
  })()`)
const dot = () => c.space(60)
const dash = () => c.space(250)
async function key(codes, gap = 1900) {
  for (const code of codes) {
    for (const e of code) { await (e === '.' ? dot() : dash()); await sleep(110) }
    await sleep(gap)
  }
}
async function clickText(text) {
  const box = await c.eval(`(() => { const el = [...document.querySelectorAll('button')].find(b => b.innerText.trim().toUpperCase().includes(${JSON.stringify(text)})); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] })()`)
  if (!box) throw new Error('no button ' + text)
  await c.click(...box)
}

// 1. The hero, right after the first tap: SIGNAL DETECTED, +10 XP.
for (const size of ['wide', 'tall', 'ph']) {
  await shot(`01-hero-first-signal`, size, 'dark', async () => {
    await c.goto(`${B}/`, 2500)
    if (size === 'tall') await scrollTo('[data-station]', 66)
    await dot(); await sleep(900)
  })
}

// 2. A secret message as the recipient sees it, mid-playback.
for (const [size, scheme] of [['wide', 'dark'], ['tall', 'dark'], ['ph', 'dark'], ['wide', 'light']]) {
  await shot(`02-message-incoming${scheme === 'light' ? '-light' : ''}`, size, scheme, async () => {
    await c.goto('about:blank', 100)
    await c.goto(MESSAGE_URL, 2500)
    await scrollToPanel('INCOMING WIRE', size === 'tall' ? 66 : 84)
    await clickText('PLAY MESSAGE')
    await scrollToPanel('INCOMING WIRE', size === 'tall' ? 66 : 84)
    await sleep(2600)
  })
}

// 3. The telegraph after keying SOS by hand.
for (const size of ['wide', 'tall', 'ph']) {
  await shot(`03-telegraph-sos`, size, 'dark', async () => {
    await c.goto('about:blank', 100)
    await c.goto(`${B}/telegraph/`, 2500)
    await key(['...', '---', '...'])
    await sleep(1200)
    await scrollToPanel('SEND', size === 'tall' ? 66 : 84, 500)
  })
}

// 3b. The telegram card itself, straight off the page's canvas.
if (!ONLY || ONLY.has('03-telegram')) {
  await c.scheme('dark'); await c.viewport(1600, 840, 1.5)
  await c.goto(`${B}/telegraph/`, 2500)
  await key(['...', '---', '...'])
  await sleep(1500)
  const data = await c.eval(`document.querySelector('main canvas')?.toDataURL('image/png')`)
  if (data) {
    writeFileSync(`${OUT}/03-telegram-card-sos-1200x630.png`, Buffer.from(data.split(',')[1], 'base64'))
    console.log('wrote telegram card')
  }
}

// 4. A seeded challenge link, as a friend opens it (no score claimed on it).
for (const size of ['wide', 'tall', 'ph']) {
  await shot(`04-challenge-link`, size, 'dark', async () => {
    await c.goto(`${B}/challenge/?seed=k7f3&pool=14&time=60&wpm=20`, 2500)
    await scrollTo('main h1', size === 'tall' ? 70 : 10)
  })
}

// 5. Today's daily, before starting: what it uses and at what speed.
for (const size of ['wide', 'ph']) {
  await shot(`05-daily-brief`, size, 'dark', async () => {
    await c.goto(`${B}/daily/`, 2500)
    await scrollToPanel('DAILY WIRE', 84, 500)
  })
}

// 6. The Signal Tree.
for (const size of ['wide', 'ph']) {
  await shot(`06-signal-tree`, size, 'dark', async () => {
    await c.goto(`${B}/tree/`, 2500)
    await scrollTo('main svg', 100)
  })
}

// 7. The lesson, stage 1.
for (const size of ['wide', 'ph']) {
  await shot(`07-lesson-stage-1`, size, 'dark', async () => {
    await c.goto(`${B}/learn/`, 2500)
    await scrollToPanel('STAGE 1 OF 7', 84, 500)
  })
}

await c.close()
