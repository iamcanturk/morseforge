// Full-frame stills of the live site for the promo video.
// usage: node stills.mjs <outDir> <tall|wide> [only,comma,list]
import { launch, sleep } from './cdp.mjs'
import { mkdirSync } from 'node:fs'

const [OUT, size, onlyArg] = process.argv.slice(2)
const ONLY = onlyArg ? new Set(onlyArg.split(',')) : null
mkdirSync(OUT, { recursive: true })
const B = 'https://morse.iamcanturk.dev'
const VIEW = size === 'tall' ? [432, 768, 2.5, true] : [1600, 900, 1.2, false]
const NAV = size === 'tall' ? 66 : 84
const c = await launch({ port: 9600 + Math.floor(Math.random() * 300) })
await c.scheme('dark')
await c.viewport(...VIEW)

const fresh = async (path, wait = 2500) => {
  await c.goto('about:blank', 100)
  await c.send('Storage.clearDataForOrigin', { origin: B, storageTypes: 'all' })
  await c.goto(B + path, wait)
}
const panel = (label, offset = NAV, minHeight = 300) =>
  c.eval(`(() => {
    const all = [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && e.textContent.trim().toUpperCase().startsWith(${JSON.stringify(label)}))
    let el = all[0]; if (!el) return 'missing'
    while (el.parentElement && el.getBoundingClientRect().height < ${minHeight}) el = el.parentElement
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY - ${offset}); return 'ok'
  })()`)
const click = async (text) => {
  const box = await c.eval(`(() => { const el = [...document.querySelectorAll('main button')].find(b => b.innerText.trim().toUpperCase().replace(/\\s+/g,' ').startsWith(${JSON.stringify(text)})); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] })()`)
  if (!box) throw new Error('no button ' + text)
  await c.click(...box)
}
const shot = (name) => c.shot(`${OUT}/${name}-${size}.png`).then(() => console.log('wrote', name))
const want = (n) => !ONLY || ONLY.has(n)

if (want('lesson')) { await fresh('/learn/'); await panel('STAGE 1 OF 7', NAV, 500); await sleep(400); await shot('lesson') }
if (want('tree')) {
  await fresh('/tree/')
  await panel('SIGNAL TREE', NAV, 400)
  await sleep(300); await shot('tree')
}
if (want('daily')) { await fresh('/daily/'); await panel('DAILY WIRE', NAV, 500); await sleep(300); await shot('daily') }
if (want('challenge')) { await fresh('/challenge/?seed=k7f3&pool=14&time=60&wpm=20'); await c.eval(`window.scrollTo(0, document.querySelector('main h1').getBoundingClientRect().top + scrollY - ${NAV + 10})`); await sleep(300); await shot('challenge') }
if (want('defender')) {
  await fresh('/games/signal-defender/')
  await click('FIRST 6'); await click('START'); await sleep(4200)
  await panel('SCORE', NAV, 450); await sleep(150); await shot('defender')
}
if (want('runner')) {
  await fresh('/games/morse-runner/')
  await click('FIRST 6'); await click('START RUNNING'); await sleep(3500)
  await panel('SCORE', NAV, 450); await sleep(150); await shot('runner')
}
if (want('lamp')) {
  await fresh('/settings/')
  await click('LAMP'); await sleep(400)
  await c.goto(B + '/practice/', 2500)
  await click('LISTEN'); await click('START'); await sleep(500)
  await panel('RX', NAV, 400)
  for (let i = 0; i < 8; i++) { await c.shot(`${OUT}/lamp-${size}-${i}.png`); await sleep(90) }
  console.log('wrote lamp frames')
}
await c.close()
