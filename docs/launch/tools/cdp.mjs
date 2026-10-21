// Minimal Chrome DevTools Protocol driver for launch screenshots.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ port = 9333 } = {}) {
  const profile = mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), 'chrome-'))
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank',
  ], { stdio: 'ignore' })
  let ws
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) { ws = page.webSocketDebuggerUrl; break }
    } catch {}
    await sleep(200)
  }
  const sock = new WebSocket(ws)
  await new Promise((r) => sock.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  const listeners = []
  sock.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) listeners.forEach((l) => l(msg))
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      sock.send(JSON.stringify({ id: n, method, params }))
    })
  await send('Page.enable')
  await send('Runtime.enable')

  const api = {
    send,
    on: (fn) => listeners.push(fn),
    async viewport(width, height, scale = 2, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile })
      if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    },
    async scheme(value) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
    },
    async goto(url, wait = 1500) {
      const loaded = new Promise((r) => { const f = (m) => m.method === 'Page.loadEventFired' && r(); listeners.push(f) })
      await send('Page.navigate', { url })
      await Promise.race([loaded, sleep(15000)])
      await sleep(wait)
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
      return r.result.value
    },
    async shot(file, clip) {
      const params = { format: 'png', captureBeyondViewport: false }
      if (clip) params.clip = { ...clip, scale: 1 }
      const { data } = await send('Page.captureScreenshot', params)
      writeFileSync(file, Buffer.from(data, 'base64'))
    },
    async key(type, key, code, keyCode, timestamp) {
      await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, ...(timestamp ? { timestamp } : {}) })
    },
    // Hold Space for ms (a dot ~80ms, a dash ~300ms)
    async space(ms) {
      const t0 = Date.now() / 1000
      await api.key('keyDown', ' ', 'Space', 32, t0)
      await sleep(ms)
      await api.key('keyUp', ' ', 'Space', 32, t0 + ms / 1000)
    },
    async type(text) {
      await send('Input.insertText', { text })
    },
    async press(key, code, keyCode) {
      await api.key('keyDown', key, code, keyCode)
      await api.key('keyUp', key, code, keyCode)
    },
    async click(x, y) {
      for (const type of ['mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
    },
    async close() { sock.close(); proc.kill() },
  }
  return api
}
