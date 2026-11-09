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
    ['canal', "heist.start(4, 3); heist.dbg.safe(); heist.H.cp = 3; heist.dbg.teleport(120, 18, 585); heist.cam.hd = Math.PI; heist.me.grounded = false"],
    ['tower', "heist.start(4, 4); heist.dbg.safe(); heist.H.cp = 2; const C = heist.H.cps[2]; heist.dbg.teleport(C.x, 20, C.z + 45); heist.cam.hd = Math.PI; heist.me.grounded = false"],
    ['drones', "heist.start(4, 5); heist.H.inv = 1e9; heist.H.cp = 4; const C = heist.H.cps[4]; heist.dbg.teleport(C.x, 16, C.z + 30); heist.cam.hd = Math.PI; for (let i = 0; i < 6; i++) heist.H.drones.push({ id: 900 + i, x: C.x + i * 3 - 8, y: 18, z: C.z + 40 + i, vx: 0, vy: 0, vz: 0, mode: 'chase', t: 0, life: 99, home: null, v: 12, nm: { min: 1e9, t: -9, hit: false, cd: 0 }, spin: 0, gone: false })"]
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
