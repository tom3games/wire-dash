// SNS 用の画像 og.png（1200x630）。晴れた街で、回転レーザーの輪のすき間を紙一重で抜ける瞬間＋題字。node og.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { muteContext, MUTE_LAUNCH } from './mute.mjs'
const PORT = 6455
const srv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const b = await chromium.launch({ ...MUTE_LAUNCH, args: [...MUTE_LAUNCH.args, '--use-angle=metal'] })
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 1200, height: 630 } }); await muteContext(ctx)
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__wdReady, null, { timeout: 40000 })
await p.waitForFunction(() => document.fonts.check('900 40px "Zen Kaku Gothic New"'), null, { timeout: 15000 }).catch(() => {})
await p.waitForTimeout(2500)   // 人物の読み込み
const CAM = JSON.parse(process.env.OGCAM || 'null')
await p.evaluate(CAM => {
  heist.start(1, 7); heist.dbg.pause(true); heist.H.drones.length = 0; heist.H.inv = 1e9
  const h = heist.H.haz.find(q => q.kind === 'rotor'), C = heist.H.cps[0]
  // 羽根が斜めの時: すき間の真ん中を抜ける
  h.w = 0; h.ph = 0.4
  const a = 0.4 + Math.PI / h.n, d = 3.4
  const x = h.cx + h.ux * Math.cos(a) * d, y = h.cy + Math.sin(a) * d - 1.1, z = h.cz + h.uz * Math.cos(a) * d
  heist.dbg.teleport(x - 0.6, y, z); const me = heist.me
  Object.assign(me, { vx: 24, vy: 3, vz: 1, grounded: false, yaw: Math.PI / 2 })
  me.rope = { x: x + 14, y: y + 24, z: z - 6, len: 28, t: 0.6 }
  for (let i = 0; i < 6; i++) heist.dbg.render(1)
  window.__freeze = true; window.__holdFx = true
  heist.dbg.render(30)
  const c = heist.camera
  const P = CAM || [6 - x + x, 21.5 - y + y, 664 - z + z, -2 - x + x, 17.5 - y + y, 628 - z + z, 64] || [x + 6.5, y + 2.4, z + 2.6, x, y + 1.3, z + 2.6, 56]
  c.position.set(P[0], P[1], P[2]); c.lookAt(P[3], P[4], P[5]); c.fov = P[6]; c.updateProjectionMatrix()
  heist.dbg.render(2)
  for (const id of ['hud', 'pause', 'title']) document.getElementById(id).classList.add('hidden')
  document.getElementById('hitflash').style.opacity = '.35'
  const dv = document.createElement('div')
  dv.innerHTML = `<div style="position:fixed;inset:0;z-index:28;background:linear-gradient(90deg,rgba(16,35,60,.55) 0%,rgba(16,35,60,.25) 34%,rgba(16,35,60,0) 56%)"></div>
  <div style="position:fixed;left:48px;top:70px;z-index:30;font-family:'Zen Kaku Gothic New',sans-serif;font-weight:900;font-size:96px;line-height:1;color:#fff;-webkit-text-stroke:4px #10233c;paint-order:stroke fill;text-shadow:0 8px 0 #10233c;white-space:nowrap">ワイヤー<br>ダッシュ</div>
  <div style="position:fixed;left:52px;top:300px;z-index:30;padding:6px 16px;font-family:'Zen Kaku Gothic New',sans-serif;font-weight:900;font-size:32px;color:#fff;background:#e81e2e;transform:rotate(-2deg)">ビルの谷間を、紙一重でくぐり抜けろ</div>
  <div style="position:fixed;left:52px;top:396px;z-index:30;padding:10px 16px;background:#10161f;border-radius:8px;font-family:'Chakra Petch',monospace;font-weight:700;font-size:58px;color:#ffe066">0:48.21</div>
  <div style="position:fixed;left:56px;top:500px;z-index:30;display:flex;gap:12px">${['#f2c230', '#f2c230', '#f2c230'].map(c => `<div style="width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,${c} 40%,#a8780a);border:3px solid #a8780a"></div>`).join('')}</div>`
  document.body.appendChild(dv)
}, CAM)
await p.waitForTimeout(800)
await p.screenshot({ path: process.env.OGOUT || 'og.png' })
await b.close(); srv.kill()
console.log('og.png')
