import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
// 検証: node verify.mjs（Chromium と WebKit。本物のマウス・指でボタン・ビル・地面を押す）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname
execFileSync(process.execPath, ['tools/build.mjs'], { cwd: ROOT, stdio: 'inherit' })   // 公開するのは1つにまとめた dist/game.js。先に作り直す
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = Number(process.env.VPORT || 6452)
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
  if (process.env.LIVE) console.log(results[results.length - 1])
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
// 輪の判定: 全コース・全部の輪を、速さ6段階×向き×輪の真ん中と縁で通す。仕掛けに当たっても、輪へ向かっていたなら数える
for (const mode of [[], ['hits']]) await t(`輪をくぐったら必ず数える ${mode[0] || '当たりなし'}`, () => {
  const out = execFileSync(process.execPath, ['tools/rings.mjs', ...mode], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n')[0]
})
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  if (process.env.VNAV) ctx.setDefaultNavigationTimeout(+process.env.VNAV)   // 他の検証で重い時だけ読み込みを長く待つ
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|googletagmanager/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__wdReady, null, { timeout: 40000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('section:not(.hidden) *')) {
    if (el.closest('.hidden') || el.closest('.tags') || el.closest('#miss') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, W = innerWidth, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('section:not(.hidden) button, section:not(.hidden) a, section:not(.hidden) canvas, #tmSupport, #tmHome, #card')) {
    if (!el.offsetParent || el.closest('.hidden')) continue
    const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1 || r.right > W + 1 || r.left < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom))
  }
  return { H, over: over.slice(0, 6) }
})
const overlap = (q, a, b) => q.evaluate(([a, b]) => { const A = document.querySelector(a).getBoundingClientRect(), B = document.querySelector(b).getBoundingClientRect(); if (!A.width || !B.width) return false; return !(A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top) }, [a, b])
// 遊び中を止めて、安全な所（ライトもドローンも無し）に置く
const calm = p => p.evaluate(() => { heist.dbg.pause(true); heist.H.inv = 0; heist.H.noLight = true; heist.H.drones.length = 0; heist.me.stun = 0 })
const tapBtn = async (p, touch) => { const b = await p.locator('.tbtn[data-k=wire]').boundingBox(); if (touch) await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2) }

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser, { isMobile: true, hasTouch: true })
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r); return r
})
await t('OGP 一式・canonical・github.io からの転送がある・og.png が 1200x630', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => document.querySelector(`meta[property="${k}"]`)?.content || '').concat(document.querySelector('meta[name="twitter:card"]')?.content || '', document.querySelector('link[rel=canonical]')?.href || '', document.getElementById('ghMove')?.textContent || ''))
  expect(r.slice(0, 6).every(Boolean) && /wire-dash\/og\.png/.test(r[2]) && /tom3games\.com\/play\/wire-dash\/$/.test(r[3]) && r[6] === 'https://tom3games.com/play/wire-dash/' && /tom3games\.github\.io/.test(r[7]) && /play\/wire-dash\//.test(r[7]), r)
  const res = await p.request.get(URL0 + 'og.png'); expect(res.status() === 200, res.status())
  const b = await res.body(); expect(b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630, [b.readUInt32BE(16), b.readUInt32BE(20)])
})
await t('怪盗・カツラ・市長・号外・UFO の文字が残っていない（作り直す前の名残）', async () => {
  const s = await p.evaluate(() => document.body.innerText + document.title + [...document.querySelectorAll('meta')].map(m => m.content || '').join(' '))
  const src = readFileSync(ROOT + '/js/game.js', 'utf8').split('const T = {')[1].split('let lang')[0] + readFileSync(ROOT + '/js/facade.js', 'utf8').match(/text\('[^']*'/g).join(' ')
  const bad = (s + src).match(/.{0,12}(UFO|迎撃|廃都|退社|残業|部長|管制|ラーメン|出前|怪盗|カツラ|市長|号外|懸賞金|予告状|wig|mayor|heist|phantom).{0,12}/gi)
  expect(!bad, bad); return true
})
await t('使う文字だけのフォントの読み込みが最新（足りない字がない）', async () => {
  const { fontHref } = await import('./tools/fontlink.mjs')
  const h = readFileSync(ROOT + '/index.html', 'utf8'), m = h.match(/<link id="gfonts" href="([^"]+)"[^>]*>/)
  expect(m && m[1].replace(/&amp;/g, '&') === fontHref() && /media="print"/.test(m[0]) && /Zen\+Kaku\+Gothic\+New/.test(m[1]), 'node tools/fontlink.mjs を回す'); return { chars: decodeURIComponent(fontHref().split('text=')[1]).length }
})
await t('画面に「AI」「画像生成」が出ない', async () => { const s = await p.evaluate(() => document.body.innerText + JSON.stringify([...document.querySelectorAll('[data-t]')].map(e => e.textContent))); expect(!/\bAI\b|画像生成/.test(s), s.match(/.{0,20}(AI|画像生成).{0,20}/)) })
await t('昼の街: クレーン2基・運河の鉄塔12本・気球に当たり（ワイヤーが掛かる）がある。描画回数が多すぎない', async () => {
  const r = await p.evaluate(() => { const M = heist.world.heistMap, cs = heist.world.colliders; return { cranes: M.cranes.length, pylons: M.pylons.length, balloon: cs.some(c => c.balloon), jib: cs.filter(c => c.jib).length, calls: heist.renderer.info.render.calls } })
  expect(r.cranes === 2 && r.pylons === 12 && r.balloon && r.jib === 2 && r.calls < 260, r); return r
})
await t('タイトルの後ろで CPU が逃げている（デモ）', async () => { await p.waitForTimeout(4000); const r = await p.evaluate(() => ({ t: heist.H.t })); expect(r.t > 1, r); return { t: +r.t.toFixed(1) } })
await p.screenshot({ path: ROOT + '/shots/v-title.png' })
await t('遊び方を開いて閉じられる（4項目・操作が先頭）', async () => { await p.tap('#btnHow'); const n = await p.locator('#howList li').count(); await p.screenshot({ path: ROOT + '/shots/v-how.png' }); await p.tap('#how [data-close]'); expect(n === 4, n) })

// ---- 遊び: 本物の指でボタン・ビル・地面を押す
await t('はじめはコース1だけ開いていて、2〜4は押せない', async () => { const r = await p.evaluate(() => [...document.querySelectorAll('.plate')].map(b => b.disabled)); expect(r.join() === 'false,true,true,true', r); return r })
await p.tap('.plate[data-c="1"]')
await p.waitForFunction(() => heist.mode === 'play', null, { timeout: 15000 })
await t('コース1を始めると輪が4つ・障害物ができ、コーチが一言（同時に出る文字は1つ）・ゴーストは無い', async () => {
  await p.waitForTimeout(600)
  const r = await p.evaluate(() => ({ course: heist.course, cps: heist.H.cps.length, goal: !!heist.H.goal, haz: heist.H.haz.length, kinds: [...new Set(heist.H.haz.map(h => h.kind))].sort().join(','), say: !document.getElementById('say').classList.contains('hidden'), text: document.getElementById('say').textContent, banner: !document.getElementById('banner').classList.contains('hidden'), ghost: heist.ghost }))
  expect(r.course === 1 && r.cps === 4 && !r.goal && r.haz > 10 && r.kinds === 'rotor,shape' && r.say && /コーチ/.test(r.text) && !r.banner && !r.ghost, r); return r
})
await t('右下の大ボタンを指で押すと、前の上の建物にワイヤーが掛かる', async () => {
  await calm(p); await p.evaluate(() => { heist.dbg.teleport(21, 0, 842, Math.PI / 2); heist.cam.hd = Math.PI / 2; heist.dbg.render(20) })
  await tapBtn(p, true)
  const r = await p.evaluate(() => { heist.dbg.step(2); return heist.me.rope && { y: Math.round(heist.me.rope.y), ground: !!heist.me.rope.ground } })
  expect(r && r.y > 4 && !r.ground, r); return r
})
await t('ビルを指でタップするとそこにワイヤーが掛かる', async () => {
  const a = await p.evaluate(() => { heist.dbg.teleport(21, 0, 842, Math.PI / 2); heist.cam.hd = Math.PI / 2; heist.cam.pitch = 0.1; heist.dbg.render(30); return heist.dbg.screenAnchor() })
  expect(a, a)
  await p.touchscreen.tap(a.x, a.y)
  const r = await p.evaluate(h => { heist.dbg.step(2); const R = heist.me.rope; return R && Math.hypot(R.x - h.x, R.y - h.y, R.z - h.z) }, a.hit)
  expect(r != null && r < 3, r); return { off: r && +r.toFixed(2) }
})
await t('空中で地面を指でタップすると地面ワイヤーで急降下（懸賞金と連続）', async () => {
  await p.evaluate(() => { heist.dbg.teleport(60, 22, 820, Math.PI / 2); heist.me.grounded = false; heist.me.vx = 12; heist.cam.hd = Math.PI / 2; heist.cam.pitch = 0.55; heist.dbg.render(30) })
  const g = await p.evaluate(() => heist.dbg.screenGround()); expect(g, 'no ground point')
  const s0 = await p.evaluate(() => heist.H.stats.score)
  await p.touchscreen.tap(g.x, g.y)
  const r = await p.evaluate(() => { heist.dbg.step(2); return { ground: !!(heist.me.rope && heist.me.rope.ground), dive: heist.log.some(e => e.t === 'tech' && e.kind === 'dive'), score: heist.H.stats.score, chain: heist.H.chain } })
  expect(r.ground && r.dive && r.score > s0 && r.chain >= 1, r); return r
})
// 振り子: 通り（z=820）の上空を東へ飛びながら前のビルに掛ける。振り上がり始めで離すと、自動で離れた時よりずっと遠くへ跳ぶ
const SWING = `heist.dbg.teleport(150, 15, 820); const me = heist.me; me.grounded = false; me.vx = 14; me.vz = 0; me.vy = 0; heist.cam.hd = Math.PI / 2; heist.dbg.step(1); me.x = 150; me.y = 15; me.z = 820; me.vx = 14; me.vy = 0; me.vz = 0; me.rope = null; heist.H.lastX = 150; const a = heist.dbg.anchor(); heist.dbg.wireAt(a.x, a.y, a.z); heist.dbg.step(1);`
const ANG = "(() => { const m = heist.me, R = m.rope; if (!R) return true; const hx = m.x - R.x, hz = m.z - R.z, hy = m.y + 1.2 - R.y, d = Math.hypot(hx, hy, hz); return hx * m.vx + hz * m.vz > 0 && m.vy > 0 && Math.acos(-hy / d) * 180 / Math.PI >= 30 })()"
await t('ナイスリリース: 振り上がり始めで大ボタン → 自動で離れた時よりずっと遠くへ跳ぶ', async () => {
  await calm(p)
  const auto = await p.evaluate(new Function(SWING + "let rel = -1, x0 = 0; for (let i = 0; i < 400; i++) { heist.dbg.step(1); if (!heist.me.rope && rel < 0) { rel = i; x0 = heist.me.x } if (rel >= 0 && i - rel >= 90) break } return { dist: +(heist.me.x - x0).toFixed(1) }"))
  const n = await p.evaluate(new Function(SWING + `return heist.dbg.stepUntil(${JSON.stringify(ANG)}, 400)`))
  expect(n > 0, 'never reached')
  await p.evaluate(() => heist.dbg.render(2))
  await tapBtn(p, true)
  const r = await p.evaluate(() => { heist.dbg.step(1); const e = heist.log.filter(e => e.t === 'unwire').pop(); const x0 = heist.me.x; for (let i = 0; i < 89; i++) heist.dbg.step(1); return { nice: e && e.nice, tech: heist.log.some(x => x.t === 'tech' && x.kind === 'nice'), dist: +(heist.me.x - x0).toFixed(1) } })
  expect(r.nice != null && r.tech && r.dist > auto.dist + 10, { r, auto }); return { nice: r.nice, dist: r.dist, autoDist: auto.dist }
})
await t('ナイスリリース: 振り子の手前（下へ向かう所）で離しても出ない', async () => {
  const r = await p.evaluate(new Function(SWING + "heist.dbg.step(10); heist.dbg.wireAuto(); heist.dbg.step(1); const e = heist.log.filter(e => e.t === 'unwire').pop(); return { nice: e ? e.nice ?? null : 'none', vy: +heist.me.vy.toFixed(1) }"))
  expect(r.nice == null, r); return r
})
await t('掛け替え: 離してすぐ横の点へ掛けると、速さを落とさず曲がる（急旋回）', async () => {
  await calm(p)
  const r = await p.evaluate(() => {
    heist.dbg.teleport(-90, 16, 755); const me = heist.me; heist.dbg.step(1); me.x = -90; me.y = 16; me.z = 755; me.rope = null; me.grounded = false; me.vx = 22; me.vz = 0; me.vy = 0; me.unwireT = me.t
    const v0 = Math.hypot(me.vx, me.vy, me.vz)
    heist.dbg.wireAt(-84, 34, 777); heist.dbg.step(1)
    let vmin = 1e9; for (let i = 0; i < 80; i++) { heist.dbg.step(1); if (i < 40) vmin = Math.min(vmin, Math.hypot(me.vx, me.vy, me.vz)) }
    const e = heist.log.filter(e => e.t === 'rehookTurn').pop()
    return { v0, vmin: +vmin.toFixed(1), deg: e && e.deg, turn: heist.log.some(x => x.t === 'tech' && x.kind === 'turn') }
  })
  expect(r.deg >= 40 && r.turn && r.vmin > r.v0 * 0.85, r); return r
})
await t('壁蹴り: 空中で壁に当たった直後、大ボタンが「蹴る」になり、押すと壁から跳ね返る', async () => {
  await calm(p)
  const s = await p.evaluate(() => {
    const B = heist.world.colliders.find(o => o.kind === 'building' && !o.small && Math.abs(65 - o.cx) < o.hw && Math.abs(750 - o.cz) < o.hl)
    const zf = B.cz + B.hl
    heist.dbg.teleport(65, 12, zf + 5); const me = heist.me; me.grounded = false; me.vz = -18; me.vx = 0; me.vy = 1
    heist.cam.hd = Math.PI; heist.dbg.stepUntil('heist.me.wallT != null && heist.me.t - heist.me.wallT < 0.1', 40)
    heist.dbg.render(2)
    return { zf, cls: document.querySelector('.tbtn[data-k=wire]').className, label: document.querySelector('.kick-l').textContent, vz: me.vz }
  })
  await tapBtn(p, true)
  const r = await p.evaluate(() => { heist.dbg.step(1); return { vz: +heist.me.vz.toFixed(1), vy: +heist.me.vy.toFixed(1), kick: heist.log.some(e => e.t === 'wallkick'), tech: heist.log.some(e => e.t === 'tech' && e.kind === 'kick') } })
  expect(/kick/.test(s.cls) && s.label === '蹴る' && r.kick && r.tech && r.vz > 8 && r.vy > 6, { s, r }); return { s: s.label, r }
})
// 通りの障害物（渡り廊下などの箱）の下をすれすれで抜ける／ぶつかる
const UNDER = (gap) => `const H = heist.H, o = H.haz.find(h => h.kind === 'shape' && h.boxes.some(b => b.tag === 'deck' && b.cy - b.hh > 8)), b = o.boxes.find(b => b.tag === 'deck' && b.cy - b.hh > 8)
  const long = b.hw > b.hl ? 'x' : 'z', y = b.cy - b.hh - 0.35 - 1.1 - 0.42 - (${gap}), me = heist.me   // 長い向きと直角にくぐる
  if (long === 'x') heist.dbg.teleport(b.cx, y, b.cz - 12); else heist.dbg.teleport(b.cx - 12, y, b.cz)
  for (let i = 0; i < 60; i++) { me.vx = long === 'x' ? 0 : 20; me.vz = long === 'x' ? 20 : 0; me.vy = 0; me.grounded = false; me.rope = null; me.y = y; heist.dbg.step(1) }
  return { near: heist.log.filter(e => e.t === 'near').pop() || null, hit: heist.log.filter(e => e.t === 'hit').length, alarms: heist.H.misses, type: o.type }`
await t('紙一重: 渡り廊下の下をすき間 1m 足らずで速く抜けると「紙一重」でスコア', async () => {
  await calm(p); const n0 = await p.evaluate(() => heist.log.filter(e => e.t === 'near').length)
  const r = await p.evaluate(new Function(UNDER(0.5)))
  const n1 = await p.evaluate(() => heist.log.filter(e => e.t === 'near').length)
  expect(n1 >= n0 + 1 && r.alarms === 0 && r.near && r.near.gap < 1.5, r); return { gap: r.near.gap, tight: r.near.tight, type: r.type }
})
await t('障害物にぶつかるとミス（はじかれ、タイムに +3秒、計時板に「ミス 1」）', async () => {
  await calm(p)
  const r = await p.evaluate(new Function(UNDER(-1.2)))
  await p.evaluate(() => heist.dbg.render(2))
  const hud = await p.evaluate(() => ({ miss: document.getElementById('miss2').textContent, penalty: heist.H.penalty, clock: document.getElementById('clock').textContent }))
  expect(r.alarms === 1 && r.hit >= 1 && hud.miss === 'ミス 1' && hud.penalty === 3 && parseFloat(hud.clock) >= 3, { r, hud }); return { r, hud }
})
await t('当たった直後は無敵（続けてミスにならない）', async () => { const r = await p.evaluate(new Function(UNDER(-1.2).replace('const H = heist.H,', 'heist.H.inv = 1; const H = heist.H,'))); expect(r.alarms === 1, r) })
await t('障害物を指でタップしてもワイヤーは掛からない（「掛からない」の×）。障害物越しのビルにも掛からない', async () => {
  const r = await p.evaluate(() => {
    const H = heist.H, o = H.haz.find(h => h.kind === 'shape' && h.boxes.some(b => b.tag === 'deck')), b = o.boxes.find(b => b.tag === 'deck')
    const long = b.hw > b.hl ? 'x' : 'z'
    if (long === 'x') heist.dbg.teleport(b.cx, b.cy - 6, b.cz + 30, Math.PI); else heist.dbg.teleport(b.cx - 30, b.cy - 6, b.cz, Math.PI / 2)
    heist.me.grounded = false; heist.cam.hd = long === 'x' ? Math.PI : Math.PI / 2; heist.cam.pitch = 0; heist.dbg.render(6)
    return { xy: heist.pointXY(b.cx, b.cy, b.cz), n0: heist.log.filter(e => e.t === 'wire').length }
  })
  expect(r.xy.z < 1 && r.xy.x > 0 && r.xy.x < 390 && r.xy.y > 0 && r.xy.y < 844, r)
  await p.touchscreen.tap(r.xy.x, r.xy.y)
  const q = await p.evaluate(n0 => { heist.dbg.step(2); return { rope: !!heist.me.rope, wires: heist.log.filter(e => e.t === 'wire').length - n0, miss: heist.log.filter(e => e.t === 'wireMiss').pop() || null, label: document.querySelector('#miss small').textContent } }, r.n0)
  expect(!q.rope && q.wires === 0 && q.miss && q.miss.noHook && q.label === '掛からない', q); return q
})
await t('大ボタンの自動の狙いは障害物を選ばない（障害物の箱の中の点が出ない）', async () => {
  const r = await p.evaluate(() => { let n = 0, bad = 0; const nh = heist.world.noHook; for (const C of heist.H.cps) for (let k = 0; k < 24; k++) { heist.dbg.teleport(C.x - C.nx * 25, 14, C.z - C.nz * 25); heist.me.grounded = false; heist.cam.hd = k * Math.PI / 12; const a = heist.dbg.anchor(); n++; if (a && nh.some(b => a.x > b.x0 && a.x < b.x1 && a.y > b.y0 && a.y < b.y1 && a.z > b.z0 && a.z < b.z1)) bad++ } return { n, bad } })
  expect(r.bad === 0, r); return r
})
await t('輪をくぐると「目印」で懸賞金・次の輪へ', async () => {
  await calm(p)
  const r = await p.evaluate(() => {
    const C = heist.H.cps[heist.H.cp]; heist.H.inv = 1e9
    const s0 = heist.H.stats.score, cp0 = heist.H.cp
    heist.dbg.teleport(C.x - C.nx * 8, C.y - 1.1, C.z - C.nz * 8); const me = heist.me
    for (let i = 0; i < 40; i++) { me.vx = C.nx * 18; me.vz = C.nz * 18; me.vy = 0; me.y = C.y - 1.1; me.grounded = false; heist.dbg.step(1) }
    heist.H.inv = 0
    return { cp0, cp: heist.H.cp, gain: heist.H.stats.score - s0, ring: heist.log.some(e => e.t === 'ring') }
  })
  expect(r.cp === r.cp0 + 1 && r.ring && r.gain >= 50, r); return r
})
await t('輪の外を通っても数えない', async () => {
  const r = await p.evaluate(() => {
    const C = heist.H.cps[heist.H.cp], cp0 = heist.H.cp; heist.H.inv = 1e9
    heist.dbg.teleport(C.x - C.nx * 8, C.y + 9, C.z - C.nz * 8); const me = heist.me
    for (let i = 0; i < 40; i++) { me.vx = C.nx * 18; me.vz = C.nz * 18; me.vy = 0; me.y = C.y + 9; me.grounded = false; heist.dbg.step(1) }
    heist.H.inv = 0; return { cp0, cp: heist.H.cp }
  })
  expect(r.cp === r.cp0, r); return r
})
await t('回転レーザー（コース1の最後の輪）: 羽根に重なるとミス', async () => {
  const r = await p.evaluate(() => {
    heist.start(1, 5); heist.dbg.pause(true); heist.H.noLight = true; heist.H.drones.length = 0
    const h = heist.H.haz.find(q => q.kind === 'rotor'), a = h.ph + h.w * (heist.H.t + 1 / 60), d = 3.5
    heist.dbg.teleport(h.cx + h.ux * Math.cos(a) * d, h.cy + Math.sin(a) * d - 0.9, h.cz + h.uz * Math.cos(a) * d)
    heist.me.grounded = false; heist.dbg.step(1)
    return { alarms: heist.H.misses, src: (heist.log.filter(e => e.t === 'hit').pop() || {}).src }
  })
  expect(r.alarms === 1 && r.src === 'rotor', r); return r
})
await t('モノレール（コース2）の軌道に重なるとミス、3回目でも続けられる', async () => {
  const r = await p.evaluate(() => {
    heist.start(2, 5); heist.dbg.pause(true); heist.H.drones.length = 0
    const o = heist.H.haz.find(h => h.type === 'monorail'), b = o.boxes[0]
    const out = []
    for (let k = 0; k < 3; k++) { heist.H.inv = 0; heist.dbg.teleport(b.cx - 60 + k * 40, b.cy - 0.9, b.cz); heist.me.grounded = false; heist.dbg.step(1); out.push(heist.H.misses) }
    return { misses: out, src: (heist.log.filter(e => e.t === 'hit').pop() || {}).src, end: heist.H.end }
  })
  expect(r.misses.join() === '1,2,3' && r.src === 'shape' && r.end == null, r); return r
})
await t('コース1の最後の輪をくぐるとゴール → 記録紙・自己ベストを保存・コース2が開く', async () => {
  const r = await p.evaluate(() => {
    heist.start(1, 41); heist.dbg.pause(true); heist.H.drones.length = 0; heist.H.inv = 1e9
    for (const C of heist.H.cps) { heist.dbg.teleport(C.x - C.nx * 8, C.y - 1.1, C.z - C.nz * 8); const me = heist.me; for (let i = 0; i < 40 && !heist.H.over; i++) { me.vx = C.nx * 18; me.vz = C.nz * 18; me.vy = 0; me.y = C.y - 1.1; me.grounded = false; heist.dbg.step(1) } }
    return { end: heist.H.end, t: +heist.H.t.toFixed(2) }
  })
  expect(r.end === 'clear', r)
  await p.evaluate(() => heist.dbg.pause(false)); await p.waitForFunction(() => heist.mode === 'result', null, { timeout: 8000 })
  const q = await p.evaluate(() => ({ best: heist.bestOf(1), next: !document.getElementById('btnNext').classList.contains('hidden'), w: document.getElementById('slip').width, s: window.__lastSummary }))
  await p.screenshot({ path: ROOT + '/shots/v-clear.png' })
  expect(q.best && q.best.time > 0 && Array.isArray(q.best.path) && q.best.path.length >= 6 && q.next && q.w === 1080 && q.s.newBest && q.s.medal.time, q); return { time: q.best.time, medal: q.s.medal }
})
await t('2回目はゴースト（前のベストの軌跡）が一緒に飛ぶ', async () => {
  await p.tap('#btnAgain'); await p.waitForFunction(() => heist.mode === 'play')
  const r = await p.evaluate(() => { heist.dbg.pause(true); heist.dbg.step(30); return { ghost: !!heist.ghost, vis: heist.scene.children.some(o => o.isGroup && o.visible && o.children.length === 2 && o.children[0].geometry && o.children[0].geometry.type === 'CapsuleGeometry') } })
  expect(r.ghost && r.vis, r); return r
})
await t('メダル: タイム（金・銀・銅）・ノーミス・紙一重の3つを、記録に合わせて付ける', async () => {
  const r = await p.evaluate(() => { const M = heist.MEDAL[1]; const f = s => window.__medal ? 0 : 0; void f; return null })
  const m = await import('./shared/heist.js')
  const M = m.MEDAL[1]
  const a = m.medalOf(1, { end: 'clear', time: M.gold - 1, misses: 0, near: M.near }), b = m.medalOf(1, { end: 'clear', time: M.silver + 5, misses: 2, near: 0 }), c = m.medalOf(1, { end: 'timeout', time: 999, misses: 0, near: 9 })
  expect(a.time === 'gold' && a.nomiss && a.near && a.n === 5 && b.time === 'bronze' && !b.nomiss && !b.near && b.n === 1 && c.time === null && c.n === 0, { a, b, c }); void r; return { a: a.n, b: b.n, c: c.n }
})
await t('ドローン: 見張りのドローンは近づくと追ってくる', async () => {
  const r = await p.evaluate(() => {
    heist.start(3, 21); heist.dbg.pause(true); heist.H.inv = 1e9
    const d = heist.H.drones[0]; heist.dbg.teleport(d.x + 8, d.y, d.z); heist.me.grounded = false
    heist.dbg.step(2); return { mode: heist.H.drones[0].mode }
  })
  expect(r.mode === 'chase', r); return r
})
await t('ドローン: 真後ろを追ってきたドローンはビルの角で激突（技で懸賞金）', async () => {
  const r = await p.evaluate(() => {
    heist.start(4, 22); heist.dbg.pause(true); heist.H.noLight = true; heist.H.drones.length = 0; heist.H.inv = 1e9
    const B = heist.world.colliders.find(o => o.kind === 'building' && !o.small && Math.abs(65 - o.cx) < o.hw && Math.abs(750 - o.cz) < o.hl)
    const cx = B.cx + B.hw, cz = B.cz + B.hl   // 北東の角
    heist.dbg.teleport(cx + 4, 12, cz - 7); const me = heist.me
    heist.H.drones.push({ id: 999, x: cx - 3, y: 12.5, z: cz + 1.5, vx: 0, vy: 0, vz: 0, mode: 'chase', t: 0, life: 9, home: null, v: 15, nm: { min: 1e9, t: -9, hit: false, cd: 0 }, spin: 0, gone: false })
    for (let i = 0; i < 60 && heist.H.drones.length; i++) { me.vx = 0; me.vz = -12; me.vy = 0; me.y = 12; me.grounded = false; heist.dbg.step(1) }
    const c = heist.log.filter(e => e.t === 'droneCrash').pop()
    return { crash: !!c, mine: c && c.mine, tech: heist.log.some(e => e.t === 'tech' && e.kind === 'crash') }
  })
  expect(r.crash && r.mine && r.tech, r); return r
})
await t('何もしない通し: 時間切れでゴールできず、メダル0・スコア0（いちばん悪い）', async () => {
  const r = await p.evaluate(() => { heist.start(1, 31); heist.dbg.pause(true); heist.dbg.stepUntil('heist.H.over', 60 * 130); return { end: heist.H.end, t: Math.round(heist.H.t), score: heist.H.stats.score } })
  expect(r.end === 'timeout' && r.score === 0, r); return r
})
await t('コース4は4分で時間切れ', async () => {
  const r = await p.evaluate(() => { heist.start(4, 32); heist.dbg.pause(true); heist.dbg.safe(); heist.H.t = heist.H.limit - 0.02; heist.dbg.step(3); return { end: heist.H.end, limit: heist.H.limit } })
  expect(r.end === 'timeout', r); return r
})
await t('一時停止 → やり直す・やめるとコースの札に戻る', async () => {
  await p.evaluate(() => { heist.start(2, 33); heist.dbg.pause(false) }); await p.waitForTimeout(400)
  await p.tap('#btnPause'); const pv = await p.isVisible('#pause'); await p.tap('#btnRetry')
  const a = await p.evaluate(() => ({ mode: heist.mode, course: heist.course, t: heist.H.t }))
  await p.tap('#btnPause'); await p.tap('#btnQuit')
  const r = await p.evaluate(() => ({ mode: heist.mode, plates: document.querySelectorAll('.plate').length })); expect(pv && a.mode === 'play' && a.course === 2 && a.t < 2 && r.mode === 'title' && r.plates === 4, { a, r }); return { a, r }
})
await t('英語に切り替えられる（コースの札と記録紙）', async () => {
  await p.evaluate(() => { heist.toTitle(); heist.setLang('en') })
  const s = await p.textContent('.pick'), n = await p.textContent('.plate[data-c="1"] .pt b')
  await p.evaluate(() => { heist.start(1, 34); heist.dbg.pause(true); heist.dbg.stepUntil('heist.H.over', 60 * 130); heist.dbg.step(60); heist.showResult() })
  await p.screenshot({ path: ROOT + '/shots/v-result-en.png' })
  await p.evaluate(() => heist.setLang('ja')); expect(s === 'Choose a course' && n === 'Down the avenue', { s, n }); return s
})
await t('Chromium: 実際には無音（音を鳴らした後）', async () => { const r = await p.evaluate(() => window.__muteOk()); expect(r, r) })
await t('Chromium: エラーなし（通しの後）', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- スマホ縦3サイズ × 全画面で一画面に収まる
for (const [w, h, name] of [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'max']]) {
  const q = await open(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.tap('#btnHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.tap('#how [data-close]')
  await q.tap('.plate[data-c="1"]'); await q.waitForFunction(() => heist.mode === 'play', null, { timeout: 15000 }); await q.waitForTimeout(1500)
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await t(`${name}: 遊び中の表示（計時板・方角・スコア・中断・ボタン）が重ならない`, async () => {
    const pairs = [['#board', '#arrow'], ['#arrow', '#bounty'], ['#bounty', '#btnPause'], ['#arrow', '#btnPause'], ['#board', '#bounty'], ['#stick', '.tbtn[data-k=wire]'], ['#say', '.tbtn[data-k=wire]'], ['#say', '#stick'], ['#say', '#bounty'], ['#say', '#arrow']]
    const bad = []; for (const [a, b] of pairs) if (await overlap(q, a, b)) bad.push(a + '/' + b)
    expect(!bad.length, bad)
  })
  await q.tap('#btnPause'); views.pause = await fit(q); await q.tap('#btnResume')
  await q.evaluate(() => { heist.dbg.pause(true); heist.dbg.stepUntil('heist.H.over', 60 * 130); heist.dbg.step(60); heist.dbg.render(4); heist.showResult() })
  await q.waitForTimeout(400)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）で本物の指の通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: 指で始めて、大ボタンを指で押すとワイヤーが掛かる', async () => {
  await wp.tap('.plate[data-c="1"]'); await wp.waitForFunction(() => heist.mode === 'play', null, { timeout: 15000 })
  await calm(wp); await wp.evaluate(() => { heist.dbg.teleport(21, 0, 842, Math.PI / 2); heist.cam.hd = Math.PI / 2; heist.dbg.render(20) })
  await tapBtn(wp, true)
  const r = await wp.evaluate(() => { heist.dbg.step(2); return !!heist.me.rope }); expect(r, r); return r
})
await t('WebKit: ビルを指でタップするとワイヤーが掛かる', async () => {
  const a = await wp.evaluate(() => { heist.dbg.teleport(21, 0, 842, Math.PI / 2); heist.cam.hd = Math.PI / 2; heist.cam.pitch = 0.1; heist.dbg.render(30); return heist.dbg.screenAnchor() })
  expect(a, a); await wp.touchscreen.tap(a.x, a.y)
  const r = await wp.evaluate(h => { heist.dbg.step(2); const R = heist.me.rope; return R && Math.hypot(R.x - h.x, R.y - h.y, R.z - h.z) }, a.hit)
  expect(r != null && r < 3, r); return +r.toFixed(2)
})
await t('WebKit: 左のスティックを指で倒すと走る', async () => {
  const c = await wp.evaluate(() => { heist.dbg.teleport(60, 0, 866, Math.PI / 2); heist.me.stun = 0; heist.dbg.pause(false); return window.__stickCenter() })
  const x0 = await wp.evaluate(() => [heist.me.x, heist.me.z])
  await wp.evaluate(c => { const el = document.getElementById('stick'); const ev = (t, x, y) => new PointerEvent(t, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }); el.dispatchEvent(ev('pointerdown', c.x, c.y)); window.dispatchEvent(ev('pointermove', c.x, c.y - 50)) }, c)
  await wp.waitForTimeout(1200)
  await wp.evaluate(c => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: c.x, clientY: c.y, bubbles: true })), c)
  const x1 = await wp.evaluate(() => [heist.me.x, heist.me.z])
  const d = Math.hypot(x1[0] - x0[0], x1[1] - x0[1]); expect(d > 2, d); return Math.round(d)
})
await t('WebKit: 記録紙が描ける', async () => {
  const r = await wp.evaluate(() => { heist.dbg.pause(true); heist.dbg.stepUntil('heist.H.over', 60 * 130); heist.dbg.step(60); heist.showResult(); const c = document.getElementById('slip'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return Math.round(s2 / n - (s / n) ** 2) })
  expect(r > 800, r); return { variance: r }
})
await t('WebKit: 実際には無音（タップで音を鳴らした後）', async () => { const r = await wp.evaluate(() => window.__muteOk()); expect(r, r) })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
// ---- ページを離れた時の音（2026-11-11 横丁へ移っても BGM が鳴り続けた。sfx.js に止める処理が無かった）。音は鳴らさず、再生中のループの数で見る
await (async (ap, other, ready, tapXY) => {
  const e0 = ap.errs.length
  await t('WebKit: 裏に回ると BGM と環境音が止まり suspend。戻っても触るまで鳴らない（bfcache の pageshow でも）', async () => {
    await ap.waitForFunction(() => Snd.playing().length >= 1, null, { timeout: 15000 })
    const r = await ap.evaluate(async () => {
      const c = Snd.ctx; let sus = 0; const os = c.suspend; c.suspend = function () { sus++; return os.call(this) }
      const before = Snd.playing().length, w0 = Snd.life.wake
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))
      const hid = { away: Snd.away, playing: Snd.playing().length, sus, gain: Snd.master.gain.value }
      const fx = Object.keys(Snd.files)[0], url = Object.values(Snd.loops).find(l => l && l.url).url
      const pl = fx ? Snd.play(fx) : null; Snd.loop('awayTest', url, 0.2)   // 裏にいる間の音は鳴らさない
      await new Promise(r => setTimeout(r, 400)); const quiet = Snd.playing().length
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      await new Promise(r => setTimeout(r, 400)); const back = { away: Snd.away, playing: Snd.playing().length, gain: Snd.master.gain.value, state: c.state }
      Snd.loop('awayTest', null); c.suspend = os
      return { before, w0, hid, pl: pl === null, quiet, back }
    })
    const xy = await tapXY(ap); await ap.touchscreen.tap(xy.x, xy.y); await ap.waitForTimeout(700)
    const after = await ap.evaluate(() => ({ away: Snd.away, playing: Snd.playing().length, wake: Snd.life.wake, mute: window.__muteOk() }))
    expect(r.before >= 1 && r.hid.away && r.hid.playing === 0 && r.hid.sus >= 1 && r.hid.gain === 0 && r.pl && r.quiet === 0 && r.back.away && r.back.playing === 0 && r.back.gain === 0 && r.back.state !== 'running' && !after.away && after.playing >= 1 && after.wake === r.w0 + 1 && after.mute, JSON.stringify({ r, after }))
    return { before: r.before, hidden: r.hid.playing, back: r.back.playing, touched: after.playing }
  })
  await t('WebKit: 横丁へ移る（pagehide）と止まり、戻るで戻っても鳴っていない', async () => {
    await ap.evaluate(() => addEventListener('pagehide', () => { try { sessionStorage.setItem('awayHide', JSON.stringify({ away: Snd.away, playing: Snd.playing().length })) } catch (e) {} }))
    await ap.goto(URL0 + other); await ap.waitForTimeout(300)
    const h = JSON.parse(await ap.evaluate(() => sessionStorage.getItem('awayHide')) || '{}')
    await ap.goBack(); await ap.waitForFunction(ready, null, { timeout: 30000 }); await ap.waitForTimeout(800)
    const back = await ap.evaluate(() => ({ playing: Snd.playing().length, ctx: Snd.ctx ? Snd.ctx.state : 'none' }))
    expect(h.away && h.playing === 0 && back.playing === 0 && back.ctx !== 'running', JSON.stringify({ h, back })); return { h, back }
  })
  // 移る時に読み込み途中の音が中断されるのは数えない
  await t('WebKit: 離れる・戻るでエラーなし', async () => { const e = ap.errs.slice(e0).filter(s => !/^reqfail |__away__|status of 404/.test(s)); expect(!e.length, e.join('|')) })
})(wp, 'privacy.html', () => window.__wdReady, p => ({ x: Math.round(p.viewportSize().width / 2), y: 6 }))
await wb.close()
server.kill()
if (!process.env.LIVE) console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
