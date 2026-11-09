import '../mute-auto.mjs'
// fps: 運河の高圧線の前・都心の網と輪の前・ドローンとサーチライトが出ている所で、5秒の平均と最悪のフレーム。CPU 4倍遅くした回も。node tools/fps.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from '../mute.mjs'
const ROOT = new URL('..', import.meta.url).pathname
const PORT = 6454
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const b = await chromium.launch({ ...MUTE_LAUNCH, channel: 'chromium', args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const empty = async ctx => { const p = await ctx.newPage(); await p.setContent('<body></body>'); const r = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2) } requestAnimationFrame(f) })); await p.close(); return r }
for (const [cpu, w, h] of [[1, 390, 844], [4, 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'ja-JP' }); await muteContext(ctx)
  const base = await empty(ctx)
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__wdReady, null, { timeout: 40000 })
  await p.waitForTimeout(2000)
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  const out = { emptyPage: Math.round(base) }
  for (const [name, setup] of [
    ['avenue', "heist.start(1, 3); heist.dbg.safe(); heist.dbg.teleport(0, 18, 1040); heist.cam.hd = Math.PI; heist.me.grounded = false"],
    ['monorail', "heist.start(2, 4); heist.dbg.safe(); heist.dbg.teleport(-120, 16, 690); heist.cam.hd = Math.PI / 2; heist.me.grounded = false"],
    ['canyon', "heist.start(4, 5); heist.H.inv = 1e9; heist.dbg.teleport(130, 20, 720); heist.cam.hd = 0; heist.me.grounded = false"]
  ]) {
    await p.evaluate(s => { new Function(s)(); window.__keep = setInterval(() => { const m = heist.me; if (m) { m.vx = 0; m.vz = 0; m.vy = 0; m.y = Math.max(m.y, 14); m.grounded = false; m.rope = null } }, 16) }, setup)
    await p.waitForTimeout(800)
    const r = await p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const t0 = last; function f() { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 5000) requestAnimationFrame(f); else res(ts) } requestAnimationFrame(f) }))
    await p.evaluate(() => clearInterval(window.__keep))
    const avg = 1000 / (r.reduce((a, x) => a + x, 0) / r.length), worst = Math.max(...r.slice(5))
    const info = await p.evaluate(() => ({ calls: heist.renderer.info.render.calls, tris: heist.renderer.info.render.triangles, drones: heist.H.drones.length }))
    out[name] = { fps: Math.round(avg), worstMs: Math.round(worst), ...info }
  }
  console.log(`CPU x${cpu} ${w}x${h} dpr3`, JSON.stringify(out))
  await ctx.close()
}
await b.close(); server.kill()
