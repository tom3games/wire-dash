import '../mute-auto.mjs'
// 撮影と目視用: node tools/shot.mjs [場面...]。場面を台本どおりに進めて shots/s-*.png に撮る
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from '../mute.mjs'
const ROOT = new URL('..', import.meta.url).pathname
mkdirSync(ROOT + 'shots', { recursive: true })
const PORT = 6453
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const only = process.argv.slice(2)
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__wdReady, null, { timeout: 40000 })
await p.waitForTimeout(2500)
const want = n => !only.length || only.includes(n)
if (want('title')) await p.screenshot({ path: ROOT + 'shots/s-title.png' })
const shot = async (name, fn, arg) => { if (!want(name)) return; await p.evaluate(fn, arg); await p.waitForTimeout(300); await p.screenshot({ path: ROOT + `shots/s-${name}.png` }) }
// 場所の前に立って、その仕掛けを見る（時間は止めて撮る）
const at = (name, x, y, z, hd, pitch, cp, extra = '') => shot(name, new Function(`heist.start(4, 7); heist.dbg.pause(true); heist.dbg.safe(); heist.H.cp = ${cp}; for (let i = 0; i < ${cp}; i++) heist.H.cps[i].passed = true; heist.dbg.teleport(${x}, ${y}, ${z}); heist.me.grounded = ${y} < 0.1; heist.cam.hd = ${hd}; heist.cam.pitch = ${pitch}; ${extra}; heist.dbg.step(3); heist.dbg.render(40)`))
await shot('start', () => { heist.start(4, 7); heist.dbg.pause(true); heist.dbg.step(30); heist.dbg.render(40) })
await at('rotor', 40, 12, 820, Math.PI / 2, 0.05, 0)
await at('balls', 270, 16, 770, 1.9, 0.0, 1)
await at('shutter', 130, 18, 690, Math.PI, 0.0, 2, "const C = heist.H.cps[2]; heist.me.x = C.x; heist.me.z = C.z + 50; heist.H.lastX = heist.me.x; heist.H.lastZ = heist.me.z")
await at('canal', 110, 20, 590, Math.PI, 0.15, 3, "const C = heist.H.cps[3]; heist.me.x = C.x - 10; heist.H.lastX = heist.me.x")
await at('south', 0, 16, 430, Math.PI, 0.05, 4, "const C = heist.H.cps[4]; heist.me.x = C.x; heist.me.z = C.z + 45; heist.H.lastX = C.x; heist.H.lastZ = C.z + 45")
await at('goal', 160, 20, 290, 2.5, 0.1, 5, "heist.me.x = 196 - 30; heist.me.z = 236 + 30; heist.cam.hd = Math.atan2(30, -30); heist.H.lastX = heist.me.x; heist.H.lastZ = heist.me.z")
await shot('ghost', () => { localStorage.setItem('wd.best.1', JSON.stringify({ time: 12.3, m: { time: 'silver', nomiss: true, near: false }, split: [5], path: Array.from({ length: 200 }, (_, i) => [21 + i * 1.2, 6 + Math.sin(i / 8) * 5, 842 - i * 0.12]).flat() })); heist.start(1, 9); heist.dbg.pause(true); heist.dbg.safe(); heist.dbg.step(40); heist.dbg.render(20) })
await shot('swing', () => { heist.start(1, 11); heist.dbg.pause(true); heist.dbg.safe(); heist.dbg.wireAuto(); heist.dbg.step(50); heist.dbg.render(10) })
await shot('result', () => { heist.start(1, 13); heist.dbg.pause(true); const C = heist.H.cps; for (const c of C) { heist.dbg.teleport(c.x - c.nx * 6, c.y - 1.1, c.z - c.nz * 6); heist.H.inv = 1e9; for (let i = 0; i < 30; i++) { heist.me.vx = c.nx * 18; heist.me.vz = c.nz * 18; heist.me.vy = 0; heist.me.y = c.y - 1.1; heist.me.grounded = false; heist.dbg.step(1) } } heist.dbg.step(60); heist.dbg.render(30); heist.showResult() })
console.log(errs.join('\n') || 'no errors')
await b.close(); server.kill()
