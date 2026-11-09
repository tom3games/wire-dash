// ワイヤーダッシュ（wire-dash）の中身。three.js に依存しない。画面と bot（tools/sim.mjs）で同じものが動く
// 固定ステップで stepHeist を呼ぶ（stepRunner の後）。runner の状態と events を読み、当たった時だけ runner を書き換える
//
// 遊び: 昼の街をワイヤーで飛び、金の輪を順にくぐってゴールまでのタイムを競う。コースは4本（だんだん技が要る）
//   1. 赤く光る物（レーザー・鉄球・高圧線・網・ドローン）に触れたらミス（+3秒・はじかれる）
//   2. 金の輪を順にくぐる。最後の輪（4本目は気球のかご）でゴール
//   3. 紙一重・ナイスリリース・急旋回・壁蹴り・急降下でスコア（地面に着かずにつなぐと倍率）。メダルはタイム・ノーミス・紙一重
// 2026-11-09 wig-heist（怪盗）の作り直し。本人「カツラを盗む必要はない。アクションがそもそも楽しい」「ステージが暗い」

import { floorAt, blocked } from './runner.js?v=1'
import { buildPoles } from './street.js?v=1'

export const BASE = { x: 30, y: 0, z: 842, r: 7 }   // 町（town.js）と電柱（street.js）の中心。開始は広場の西
export const SHOP = BASE
export const SPAWN = { x: 21, y: 0, z: 842, yaw: Math.PI / 2 }

export const HZ = {
  penalty: 3,             // ミス1回でタイムに足す秒
  inv: 2.0,               // 当たった後の無敵（秒）
  stun: 0.45, knock: 7, knockUp: 4,
  body: 0.42,             // 体の太さ（当たり判定のカプセル）
  ringR: 6, ringPass: 7.6, // 輪の見た目の半径・くぐったと数える半径
  goalR: 6.5,             // 気球のかごに入ったと数える距離
  timeLimit: 300,         // これを過ぎると時間切れ（コースごとに COURSES の limit）
  nearGap: 1.5, nearMinV: 9, nearCd: 1.1, nearTight: 0.5,   // 紙一重: すき間 1.5m 以内を速さ 9 以上で抜けた。0.5m 以内は極
  groundBreak: 0.7, chainIdle: 7,
  // 警備ドローン
  droneR: 0.85, droneV0: 11.5, droneVmax: 16, droneAcc: 0.45, droneLife: 13, droneTail: 12, droneSee: 26,
  // ヘリのサーチライト
  lightR: 9.5, lightV: 9, lightFill: 1.25, lightDecay: 0.6, lightCd: 8, lightH: 52, lightFirst: 7,
  diveH: 8                // この高さ以上から地面ワイヤーで降りると急降下
}
// 倍率: 連続の数ごとの倍率
export const MULT = [[12, 3], [7, 2], [3, 1.5], [0, 1]]
export const multOf = n => MULT.find(([k]) => n >= k)[1]
// スコア（倍率を掛ける前）。技と紙一重の見せ方の点。タイムとは別
export const PTS = { ring: 50, near: 20, tight: 40, nice: 10, niceQ: 12, rehook: 4, turn: 12, kick: 20, dive: 10, crash: 30, shake: 12, goal: 100 }
export const RANKS = [2200, 1500, 900, 400]   // （使っていない。メダルは MEDAL）
// コース（だんだん技が要る）。rings は輪の番号（0 広場の回転レーザー・1 工事現場の鉄球・2 ビルの谷の上下レーザー・3 運河の高圧線・4 南の通りの回転レーザーとドローン）
export const COURSES = [
  { id: 1, rings: [0, 1], goal: false, start: SPAWN, limit: 120 },
  { id: 2, rings: [2, 3], goal: false, start: { x: 305, y: 0, z: 712, yaw: -Math.PI / 2 }, limit: 120 },
  { id: 3, rings: [4], goal: true, start: null, limit: 120 },
  { id: 4, rings: [0, 1, 2, 3, 4], goal: true, start: SPAWN, limit: 300 }
]
// メダル: タイム（金・銀の秒。ゴールすれば銅）／ノーミス／紙一重の数。tools/sim.mjs の bot の分布で決める
export const MEDAL = { 1: { gold: 10, silver: 16, near: 1 }, 2: { gold: 17, silver: 28, near: 2 }, 3: { gold: 20, silver: 32, near: 2 }, 4: { gold: 46, silver: 65, near: 4 } }
export function medalOf(course, s) {
  const M = MEDAL[course]
  if (s.end !== 'clear') return { time: null, nomiss: false, near: false, n: 0 }
  const time = s.time <= M.gold ? 'gold' : s.time <= M.silver ? 'silver' : 'bronze'
  const r = { time, nomiss: s.misses === 0, near: s.near >= M.near }
  r.n = (time === 'gold' ? 3 : time === 'silver' ? 2 : 1) + (r.nomiss ? 1 : 0) + (r.near ? 1 : 0)
  return r
}

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const pickOf = (rnd, a) => a[Math.floor(rnd() * a.length)]

// 建物の中か（ドローンの激突）
export function insideSolid(world, x, y, z) {
  for (const o of world.nearby(x, z)) {
    if (o.slab || o.y1 == null || o.kind === 'bound' || y < (o.y0 || 0) || y > o.y1) continue
    const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), dx = x - o.cx, dz = z - o.cz
    if (Math.abs(dx * c - dz * s) < o.hw && Math.abs(dx * s + dz * c) < o.hl) return true
  }
  return false
}

// ---------------------------------------------------------------- コース（毎回くじで2通りずつ）
// 区画の座標は shared/city.js（130m 四方）。広場（x 0〜130, z 820〜950）から南東の工事現場、都心のビル街、運河、南の公園へ
const COURSE = [
  { name: 'plaza', guard: 'rotor', at: [[75, 12, 820], [100, 13, 820]] },
  { name: 'site', guard: 'balls', at: [[318, 16, 752], [330, 16, 736]] },
  { name: 'tower', guard: 'shutter', at: [[130, 18, 628], [0, 19, 622]] },
  { name: 'canal', guard: 'lines', at: [[130, 10, 514], [64, 10, 514]] },
  { name: 'south', guard: 'rotor2', at: [[130, 14, 368], [0, 14, 362]] }
]
// 区間の間に置く、通りを走査するレーザーの網（axis: 動く向き。across は通りの幅）
const NETS = [
  { axis: 'x', c: 690, w: 9, p0: 150, p1: 372, top: 26, v: 8 },     // 工事現場から都心へ戻る通り（z=690）
  { axis: 'z', c: null, w: 9, p0: 568, p1: 676, top: 24, v: 6.5, follow: 2 },   // 都心の通り（輪3と同じ通り）
  { axis: 'x', c: 430, w: 9, p0: -40, p1: 300, top: 22, v: 9 }      // 運河の南の通り（z=430）を横切る
]

// 工事現場のクレーン・運河の鉄塔・気球の当たり（画面と bot で同じ。ワイヤーを掛けられる）。毎回同じ所に立つ（くじで変わるのは輪と仕掛けの動き）
const SITE_N = (() => { const l = Math.hypot(1, -0.3); return { x: 1 / l, z: -0.3 / l } })()
export const GOAL = { x: 196, y: 18, z: 236 }
export const PYLON_X = [22, 46, 88, 112, 152, 176], PYLON_Z = [538, 491], PYLON_H = 28   // 輪（x=64・x=130）の前に鉄塔が立たないように
export const LINE_H = [5.5, 11.5, 17.5, 23.5]
// 防犯カメラの柱（高さ20m）。運河の両岸と、南の通り・公園のまわりの開けた所に立てる（掛け点が少ない所。tools/reach.mjs で測って足した）
export const CAM_POLES = (() => {
  const out = [], row = (z, x0, x1, step) => { for (let x = x0; x <= x1 + 0.1; x += step) out.push({ x, z, h: 20 }) }
  row(462, -40, 230, 27); row(546, -40, 230, 30); row(313, 10, 250, 30); row(182, 140, 250, 28)
  return out
})()
export function craneOf(v) {
  const [x, , z] = COURSE[1].at[v], ux = -SITE_N.z, uz = SITE_N.x
  return { x: x + ux * 15, z: z + uz * 15, h: 46, jx: -ux, jz: -uz, jl: 22 }
}
function addBox(world, c) { world.colliders.push(c); world.colGrid.add(c, c.cx - c.hw - 1, c.cz - c.hl - 1, c.cx + c.hw + 1, c.cz + c.hl + 1) }
export function addHeistMap(world) {
  if (world.heistMap) return world.heistMap
  const cranes = [0, 1].map(craneOf), pylons = []
  for (const C of cranes) {
    addBox(world, { cx: C.x, cz: C.z, yaw: 0, hw: 1.3, hl: 1.3, y0: 0, y1: C.h, kind: 'building', small: true, crane: true })
    // 腕（水平。下にワイヤーを掛けられる）
    addBox(world, { cx: C.x + C.jx * C.jl / 2, cz: C.z + C.jz * C.jl / 2, yaw: 0, hw: Math.abs(C.jx) * C.jl / 2 + 0.6, hl: Math.abs(C.jz) * C.jl / 2 + 0.6, y0: C.h - 2.2, y1: C.h - 0.4, kind: 'building', small: true, crane: true, jib: true })
  }
  for (const z of PYLON_Z) for (const x of PYLON_X) { const p = { x, z, h: PYLON_H }; pylons.push(p); addBox(world, { cx: x, cz: z, yaw: 0, hw: 0.8, hl: 0.8, y0: world.groundAt(x, z, 3).h, y1: PYLON_H, kind: 'building', small: true, pylon: true }) }
  // 柱は細いので、電柱と同じ「線の近くを通れば掛かる」扱い（world.poles）にもする。見た目は js/heist3d.js
  const poles = buildPoles(world, BASE)
  for (const q of CAM_POLES) { const gy = world.groundAt(q.x, q.z, 3).h; q.y = gy; addBox(world, { cx: q.x, cz: q.z, yaw: 0, hw: 0.35, hl: 0.35, y0: gy, y1: gy + q.h, kind: 'building', small: true, camPole: true }); poles.push({ x: q.x, z: q.z, y0: gy, y1: gy + q.h, kind: 'pole', prop: true }) }
  const G = GOAL
  addBox(world, { cx: G.x, cz: G.z, yaw: 0, hw: 5.2, hl: 5.2, y0: G.y + 5, y1: G.y + 15, kind: 'building', small: true, balloon: true })
  world._anchorBoxes = null
  world.heistMap = { cranes, pylons, goal: G, camPoles: CAM_POLES }
  return world.heistMap
}

export function createHeist(world, seed = 1, opt = {}) {
  const rnd = rng(seed)
  const course = COURSES.find(c => c.id === (opt.course || 1)) || COURSES[0]
  const H = {
    world, seed, key: 0, rnd, t: 0, over: false, end: null, endT: 0, course: course.id, limit: course.limit,
    cp: 0, cps: [], all: [], goal: course.goal ? { ...GOAL } : null, haz: [], drones: [], nextId: 1, events: [],
    misses: 0, penalty: 0, inv: 0, chain: 0, mult: 1, chainT: 0, groundT: 0,
    light: { x: 0, z: 0, hx: 0, hy: -999, hz: 0, ang: 0, meter: 0, cd: 1e9, on: false, saw: false },
    stats: { score: 0, rings: 0, near: 0, tight: 0, nice: 0, rehook: 0, turn: 0, kick: 0, dive: 0, crash: 0, shake: 0, hits: 0, hitBy: {}, bestChain: 0, bestMult: 1, ringT: [], time: 0, techs: 0 },
    tut: !!opt.tut, noDrones: !!opt.noDrones, noLight: true
  }
  addHeistMap(world)
  // 輪の位置（区間ごとに2通り）。仕掛けは街の全部に置く（コースで使う所だけ通る）
  const pts = COURSE.map(c => { const k = Math.floor(rnd() * c.at.length); const [x, y, z] = c.at[k]; return { ...c, x, y, z, v: k } })
  for (let i = 0; i < pts.length; i++) {
    const P = pts[i], prev = i ? pts[i - 1] : SPAWN
    let nx = P.x - prev.x, nz = P.z - prev.z
    if (P.name === 'tower' || P.name === 'south') { nx = 0; nz = -1 }        // 南北の通りの中
    else if (P.name === 'canal') { nx = 0; nz = -1 }
    else if (P.name === 'plaza') { nx = 1; nz = 0 }
    else if (P.name === 'site') { nx = SITE_N.x; nz = SITE_N.z }
    const l = Math.hypot(nx, nz) || 1
    H.all.push({ i, name: P.name, x: P.x, y: P.y, z: P.z, nx: nx / l, nz: nz / l, guard: P.guard, v: P.v, passed: false })
  }
  for (const C of H.all) buildGuard(H, C, rnd)
  const R = routeOf(H.all)
  H.cps = course.rings.map(i => H.all[i])
  H.route = course.rings.map(i => course.id === 3 && i === 4 ? [{ x: H.all[2].x, y: 16, z: 578 }, { x: H.all[3].x, y: 22, z: 548 }, { x: H.all[3].x, y: 16, z: 480 }, ...R[4]] : R[i]).concat(course.goal ? [R[5]] : [])
  H.start = course.start || { x: H.all[2].x, y: 0, z: 590, yaw: Math.PI }   // コース3: ビルの谷の南の端から、運河の高圧線を越えて南へ
  // 区間の網
  NETS.forEach(N => {
    let c = N.c
    if (N.follow != null) c = H.all[N.follow].x
    const span = N.p1 - N.p0, ph = rnd() * span * 2
    addHaz(H, { kind: 'net', axis: N.axis, c, w: N.w, p0: N.p0, p1: N.p1, top: N.top + (rnd() - 0.5) * 4, v: N.v * (0.9 + rnd() * 0.25), ph, cx: N.axis === 'x' ? (N.p0 + N.p1) / 2 : c, cz: N.axis === 'x' ? c : (N.p0 + N.p1) / 2, cy: N.top / 2, rad: span / 2 + N.w + N.top })
  })
  // 気球のまわりを回る見張りのドローン
  const G = GOAL
  for (let k = 0; k < 2; k++) addDrone(H, { x: G.x + (k ? 14 : -14), y: G.y + 4, z: G.z, mode: 'patrol', home: { x: G.x, y: G.y + 3, z: G.z, r: 15, a: k * Math.PI, w: 0.5 * (k ? 1 : -1) } })
  return H
}
const ev = (H, e) => H.events.push(e)
// bot の道しるべ（通りに沿った角の点）。route[i] は輪 i（最後は気球）の手前でたどる点
function routeOf(all) {
  const [c1, c2, c3, c4, c5] = all, R = []
  R.push([])
  R.push([{ x: 190, y: 18, z: 820 }, { x: 262, y: 18, z: 808 }])
  R.push([{ x: 300, y: 18, z: 690 }, { x: c3.x + 10, y: 18, z: 690 }, { x: c3.x, y: 18, z: 664 }])
  R.push([{ x: c3.x, y: 16, z: 578 }, { x: c4.x, y: 13, z: 548 }])
  R.push([{ x: c4.x, y: 14, z: 470 }, { x: c5.x, y: 14, z: 412 }])
  R.push([{ x: c5.x, y: 16, z: 305 }, { x: c5.x < 60 ? 130 : 160, y: 18, z: 300 }])
  void c1; void c2
  return R
}
function addHaz(H, h) { h.id = H.nextId++; h.nm = { min: 1e9, t: -9, hit: false, cd: 0 }; H.haz.push(h); return h }
function addDrone(H, o) {
  const d = { id: H.nextId++, x: o.x, y: o.y, z: o.z, vx: 0, vy: 0, vz: 0, mode: o.mode || 'chase', t: 0, life: o.life || HZ.droneLife, home: o.home || null, v: HZ.droneV0, nm: { min: 1e9, t: -9, hit: false, cd: 0 }, spin: 0, gone: false }
  H.drones.push(d); return d
}

// 輪を守る仕掛け（4種類）
function buildGuard(H, C, rnd) {
  const ux = -C.nz, uz = C.nx   // 輪の面の横向き（水平）
  if (C.guard === 'rotor' || C.guard === 'rotor2') {
    // 回転レーザー: 輪の中心から縁へ伸びる棒が回る（すき間を抜ける）
    const n = C.guard === 'rotor2' ? 3 : pickOf(rnd, [3, 4])
    const w = (C.guard === 'rotor2' ? 1.25 : 0.85) * (0.9 + rnd() * 0.3) * (rnd() < 0.5 ? -1 : 1)
    addHaz(H, { kind: 'rotor', cx: C.x, cy: C.y, cz: C.z, ux, uz, n, L: HZ.ringR + 0.7, hub: 0.5, w, ph: rnd() * 6, r: 0.16, rad: HZ.ringR + 2, cp: C.i })
    if (C.guard === 'rotor2') for (let k = 0; k < 2; k++) addDrone(H, { x: C.x + ux * 12, y: C.y, z: C.z + uz * 12, mode: 'patrol', home: { x: C.x, y: C.y + 1, z: C.z, r: 11 + k * 3, a: k * Math.PI + rnd(), w: 0.6 * (k ? -1 : 1) } })
  } else if (C.guard === 'balls') {
    // 鉄球: 輪の真上を通るクレーンの腕から2つ（輪の左半分と右半分）。進む向きに前後へ振れ、互い違い（片方が下に来た時、もう片方は前か後ろの端）
    const crane = craneOf(C.v)
    const T = 4.6 + rnd() * 1.4, ph = rnd() * 6
    for (const [k, off] of [[0, -2.8], [1, 2.8]]) {
      const px = C.x + ux * off, pz = C.z + uz * off, py = crane.h - 2.2
      const Lc = py - C.y, A = 0.46
      addHaz(H, { kind: 'ball', px, py, pz, sx: C.nx, sz: C.nz, Lc, A, T, ph: ph + k * Math.PI / 2, R: 2.1, r: 0.14, crane, cx: px, cy: (py + C.y) / 2, cz: pz, rad: Lc + 3, cp: C.i })
    }
  } else if (C.guard === 'shutter') {
    // 上下するレーザーの棒（2本・逆向き）。通りの幅いっぱい
    const W = Math.abs(C.x) < 1 ? 13 : 8.6, w = 1.15 + rnd() * 0.45, ph = rnd() * 6
    for (const k of [0, 1]) addHaz(H, { kind: 'shutter', cx: C.x, cy: C.y, cz: C.z, ux, uz, W, A: 7.5, w, ph: ph + k * Math.PI, r: 0.16, rad: W + 8, cp: C.i })
  } else if (C.guard === 'lines') {
    // 高圧線: 運河の両岸に鉄塔が並び、岸に沿って4段の線（すき間は6m）。上を越えて急降下でくぐるか、すき間を抜ける
    for (const bz of PYLON_Z) for (let i = 0; i < PYLON_X.length - 1; i++) for (const hy of LINE_H) {
      const ax = PYLON_X[i], bx = PYLON_X[i + 1]
      addHaz(H, { kind: 'line', ax, ay: hy, az: bz, bx, by: hy, bz, sag: 1.1, r: 0.14, cx: (ax + bx) / 2, cy: hy, cz: bz, rad: (bx - ax) / 2 + 2, cp: C.i })
    }
  }
}

// ---------------------------------------------------------------- 仕掛けの形（時刻 t の線分）
// out に [ax,ay,az,bx,by,bz,r] を足す。球は a=b
const _seg = []
export function hazSegs(h, t, out) {
  out.length = 0
  if (h.kind === 'rotor') {
    const a0 = h.ph + h.w * t
    for (let i = 0; i < h.n; i++) {
      const a = a0 + i * Math.PI * 2 / h.n, c = Math.cos(a), s = Math.sin(a)
      out.push([h.cx + h.ux * c * h.hub, h.cy + s * h.hub, h.cz + h.uz * c * h.hub, h.cx + h.ux * c * h.L, h.cy + s * h.L, h.cz + h.uz * c * h.L, h.r])
    }
  } else if (h.kind === 'ball') {
    const th = h.A * Math.sin(Math.PI * 2 * t / h.T + h.ph), s = Math.sin(th), c = Math.cos(th)
    const bx = h.px + h.sx * s * h.Lc, by = h.py - c * h.Lc, bz = h.pz + h.sz * s * h.Lc
    out.push([h.px, h.py, h.pz, bx, by + h.R * 0.8, bz, h.r])
    out.push([bx, by, bz, bx, by, bz, h.R])
  } else if (h.kind === 'shutter') {
    const y = h.cy + h.A * Math.sin(h.w * t + h.ph)
    out.push([h.cx - h.ux * h.W, y, h.cz - h.uz * h.W, h.cx + h.ux * h.W, y, h.cz + h.uz * h.W, h.r])
  } else if (h.kind === 'line') {
    // たるみ: 真ん中を少し下げた2本
    const mx = (h.ax + h.bx) / 2, my = (h.ay + h.by) / 2 - h.sag, mz = (h.az + h.bz) / 2
    out.push([h.ax, h.ay, h.az, mx, my, mz, h.r], [mx, my, mz, h.bx, h.by, h.bz, h.r])
  }
  return out
}
// 網の位置（三角波で往復）
export function netPos(h, t) {
  const span = h.p1 - h.p0, u = ((h.ph + h.v * t) % (span * 2) + span * 2) % (span * 2)
  return { p: u < span ? h.p0 + u : h.p1 - (u - span), dir: u < span ? 1 : -1 }
}

// 2つの線分の最短距離（体のカプセル × 仕掛けの線分）
function segSeg(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z, d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz
  let s, t
  if (a < 1e-9 && e < 1e-9) { s = t = 0 }
  else if (a < 1e-9) { s = 0; t = clamp(f / e, 0, 1) }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz
    if (e < 1e-9) { t = 0; s = clamp(-c / a, 0, 1) }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1) } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1) }
    }
  }
  const x = p1x + d1x * s - (p2x + d2x * t), y = p1y + d1y * s - (p2y + d2y * t), z = p1z + d1z * s - (p2z + d2z * t)
  return Math.sqrt(x * x + y * y + z * z)
}
// 体（足元 x,y,z）と仕掛け h の時刻 t でのすき間（負なら当たっている）
export function hazGap(h, t, x, y, z) {
  const B = HZ.body, y0 = y + 0.35, y1 = y + 1.45
  if (Math.abs(x - h.cx) > h.rad + 6 || Math.abs(z - h.cz) > h.rad + 6) return 1e9
  if (h.kind === 'net') {
    const { p } = netPos(h, t), along = h.axis === 'x' ? x : z, across = h.axis === 'x' ? z : x
    if (Math.abs(across - h.c) > h.w) return 1e9
    const dh = Math.abs(along - p) - 0.25 - B, dv = y0 - B - h.top
    if (dv > 0) return dh > 0 ? Math.hypot(dh, dv) : dv
    return dh
  }
  hazSegs(h, t, _seg)
  let g = 1e9
  for (const s of _seg) { const d = segSeg(x, y0, z, x, y1, z, s[0], s[1], s[2], s[3], s[4], s[5]) - s[6] - B; if (d < g) g = d }
  return g
}
function droneGap(d, x, y, z) { const B = HZ.body, cy = clamp(d.y, y + 0.35, y + 1.45); return Math.hypot(d.x - x, d.y - cy, d.z - z) - HZ.droneR - B }
// bot の先読み: 時刻 t（今から dtA 秒後）のいちばん狭いすき間。ドローンは今の速度のまま進むとみなす
export function probe(H, t, x, y, z, dtA = 0) {
  let g = 1e9
  for (const h of H.haz) { const q = hazGap(h, t, x, y, z); if (q < g) g = q }
  for (const d of H.drones) { if (d.gone || d.mode === 'leave') continue; const q = Math.hypot(d.x + d.vx * dtA - x, d.y + d.vy * dtA - (y + 0.9), d.z + d.vz * dtA - z) - HZ.droneR - HZ.body - 0.3; if (q < g) g = q }
  return g
}

// ---------------------------------------------------------------- 点と連続
function score(H, base, why, at, chain = false) {
  if (chain) { H.chain++; H.chainT = 0; H.stats.bestChain = Math.max(H.stats.bestChain, H.chain) }
  const m = multOf(H.chain)
  if (m > H.mult) ev(H, { t: 'multUp', mult: m, chain: H.chain })
  H.mult = m; H.stats.bestMult = Math.max(H.stats.bestMult, m)
  const flat = why === 'goal' || why === 'time' || why === 'wig'
  const pts = Math.round(base * (flat ? 1 : m))
  H.stats.score += pts
  ev(H, { t: 'pts', pts, why, mult: m, chain: H.chain, ...(at || {}) })
  return pts
}
function breakChain(H, why) {
  if (H.chain >= 3) ev(H, { t: 'chainEnd', n: H.chain, why })
  H.chain = 0; H.mult = 1; H.chainT = 0
}
function tech(H, kind, base, r, extra = {}, count = true) {
  if (count) H.stats[kind] = (H.stats[kind] || 0) + 1
  H.stats.techs++
  const pts = score(H, base, kind, { x: r.x, y: r.y + 1.2, z: r.z }, true)
  ev(H, { t: 'tech', kind, pts, x: r.x, y: r.y + 1.2, z: r.z, chain: H.chain, ...extra })
}

// ---------------------------------------------------------------- 毎歩
export function stepHeist(H, r, dt) {
  if (H.over) { H.endT += dt; return }
  H.t += dt
  if (H.inv > 0) H.inv -= dt
  const px = H.lastX ?? r.x, py = H.lastY ?? r.y, pz = H.lastZ ?? r.z
  H.lastX = r.x; H.lastY = r.y; H.lastZ = r.z
  // 連続: 地面に少し立つ・しばらく何もしないと切れる
  if (H.chain) {
    H.chainT += dt
    if (r.grounded) { H.groundT += dt; if (H.groundT > HZ.groundBreak) breakChain(H, 'ground') } else H.groundT = 0
    if (H.chain && H.chainT > HZ.chainIdle) breakChain(H, 'idle')
  } else H.groundT = 0

  // 技（runner の出来事から）
  for (const e of r.events) {
    if (e.t === 'unwire' && e.nice != null) tech(H, 'nice', PTS.nice + PTS.niceQ * e.nice, r, { q: e.nice, v: e.v })
    else if (e.t === 'rehookTurn') { H.stats.rehook++; if (e.deg >= 40) tech(H, 'turn', PTS.turn, r, { deg: e.deg }) }
    else if (e.t === 'wallkick' && !e.climb) tech(H, 'kick', PTS.kick, r, { v: e.v })   // 張り付いてからの蹴りはただの移動（ぶつかった瞬間だけ技）
    else if (e.t === 'wire' && e.ground && !e.low && H.t - (H.diveT || -9) > 2 && (r.y - floorAt(H.world, r.x, r.z, r.y).h) >= HZ.diveH) { H.diveT = H.t; tech(H, 'dive', PTS.dive, r) }
  }

  // 輪をくぐる
  const C = H.cps[H.cp]
  if (C) {
    const s0 = (px - C.x) * C.nx + (pz - C.z) * C.nz, s1 = (r.x - C.x) * C.nx + (r.z - C.z) * C.nz
    if ((s0 < 0) !== (s1 < 0) || Math.abs(s1) < 0.2) {
      const k = Math.abs(s1 - s0) > 1e-6 ? s0 / (s0 - s1) : 0
      const ix = px + (r.x - px) * k, iy = py + 1.1 + (r.y - py) * k, iz = pz + (r.z - pz) * k
      const d = Math.hypot(ix - C.x, iy - C.y, iz - C.z)
      if (d < HZ.ringPass) {
        C.passed = true; H.cp++; H.stats.rings++; H.stats.ringT.push(Math.round(H.t))
        const pts = score(H, PTS.ring, 'ring', { x: C.x, y: C.y, z: C.z }, true)
        ev(H, { t: 'ring', n: H.cp, of: H.cps.length + (H.goal ? 1 : 0), pts, x: C.x, y: C.y, z: C.z, center: d < 2.5 })
        if (H.cp >= H.cps.length && !H.goal) { ev(H, { t: 'goal', time: H.t + H.penalty }); finish(H, 'clear'); return }
      }
    }
  } else if (H.goal && Math.hypot(r.x - H.goal.x, r.y + 1 - H.goal.y, r.z - H.goal.z) < HZ.goalR) {
    // 気球のかご
    score(H, PTS.goal, 'goal', H.goal)
    ev(H, { t: 'goal', time: H.t + H.penalty }); finish(H, 'clear')
    r.vx *= 0.1; r.vz *= 0.1; r.vy = 0; r.rope = null
    return
  }

  // 仕掛けとドローン
  for (const h of H.haz) touch(H, h, hazGap(h, H.t, r.x, r.y, r.z), r, h.kind)
  stepDrones(H, r, dt)
  if (H.t >= H.limit && !H.over) { ev(H, { t: 'timeout' }); finish(H, 'timeout') }
}

// すき間 g の判定: 当たり（警報）と紙一重
function touch(H, h, g, r, src) {
  const nm = h.nm
  if (nm.cd > 0) nm.cd -= 1 / 60
  if (g < 0) {
    if (H.inv <= 0) hit(H, r, src, h)
    nm.hit = true; nm.min = 1e9
    return
  }
  if (g < HZ.nearGap) { if (g < nm.min) nm.min = g; nm.t = H.t; return }
  if (nm.min < HZ.nearGap && H.t - nm.t > 0.1) {
    const v = Math.hypot(r.vx, r.vy, r.vz)
    if (!nm.hit && nm.cd <= 0 && v >= HZ.nearMinV && H.inv <= 0) {
      const tight = nm.min < HZ.nearTight
      H.stats.near++; if (tight) H.stats.tight++
      const k = clamp(v / 20, 0.6, 1.5)
      const pts = score(H, (tight ? PTS.tight : PTS.near) * k, tight ? 'tight' : 'near', { x: r.x, y: r.y + 1, z: r.z }, true)
      ev(H, { t: 'near', tight, gap: +nm.min.toFixed(2), pts, src, v, x: r.x, y: r.y + 1, z: r.z })
      nm.cd = HZ.nearCd
    }
    nm.min = 1e9; nm.hit = false
  } else if (g > HZ.nearGap + 1) nm.hit = false
}

function hit(H, r, src, h) {
  H.misses++; H.penalty += HZ.penalty; H.inv = HZ.inv
  H.stats.hits++; H.stats.hitBy[src] = (H.stats.hitBy[src] || 0) + 1
  breakChain(H, 'hit')
  // はじかれる: ワイヤーが切れ、仕掛けから離れる向きと上へ
  let ax = 0, az = 0
  if (h && h.cx != null) { ax = r.x - h.cx; az = r.z - h.cz }
  if (h && h.kind === 'net') { const { dir } = netPos(h, H.t); if (h.axis === 'x') { ax = dir; az = 0 } else { ax = 0; az = dir } }
  if (h && h.x != null && h.kind == null) { ax = r.x - h.x; az = r.z - h.z }
  const l = Math.hypot(ax, az) || 1
  if (r.rope) { r.rope = null; r.events.push({ t: 'unwire', auto: true, cut: true }) }
  r.climbing = null
  r.vx = r.vx * 0.25 + ax / l * HZ.knock; r.vz = r.vz * 0.25 + az / l * HZ.knock; r.vy = Math.max(r.vy * 0.3, HZ.knockUp)
  r.grounded = false; r.stun = Math.max(r.stun || 0, HZ.stun)
  ev(H, { t: 'hit', src, n: H.misses, x: r.x, y: r.y + 1, z: r.z })
}

// ---------------------------------------------------------------- 警備ドローン
// 追ってくる。建物はふつう上へよけるが、真後ろ（12m 以内）を追っている時はまっすぐ来るので、ビルの角や隙間で振ると激突する
function stepDrones(H, r, dt) {
  const tx = r.x, ty = r.y + 1.0, tz = r.z
  for (const d of H.drones) {
    if (d.gone) continue
    d.t += dt; d.spin += dt * 30
    const dist = Math.hypot(tx - d.x, ty - d.y, tz - d.z)
    if (d.mode === 'patrol') {
      const o = d.home; o.a += o.w * dt
      const wx = o.x + Math.cos(o.a) * o.r, wz = o.z + Math.sin(o.a) * o.r, wy = o.y + Math.sin(d.t * 1.3) * 1.2
      d.vx = (wx - d.x) * 2; d.vy = (wy - d.y) * 2; d.vz = (wz - d.z) * 2
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt
      if (dist < HZ.droneSee && !H.noDrones && !blocked(H.world, d.x, d.y, d.z, tx, ty, tz)) { d.mode = 'chase'; d.t = 0; d.life = 7; ev(H, { t: 'droneSee', id: d.id, x: d.x, y: d.y, z: d.z }) }
    } else if (d.mode === 'chase') {
      d.v = Math.min(HZ.droneVmax, HZ.droneV0 + HZ.droneAcc * d.t)
      const lead = Math.min(0.5, dist / 30)
      let gx = tx + r.vx * lead - d.x, gy = ty + r.vy * lead * 0.5 - d.y, gz = tz + r.vz * lead - d.z
      const tail = dist < HZ.droneTail
      if (tail) d.tailT = H.t
      // 見えない（建物の向こう）なら上へよける。真後ろを追っている時はよけない
      if (!tail && blocked(H.world, d.x, d.y, d.z, tx, ty, tz)) gy = Math.max(gy, 0) + 12
      const gl = Math.hypot(gx, gy, gz) || 1
      const k = Math.min(1, dt * 2.6)
      d.vx += (gx / gl * d.v - d.vx) * k; d.vy += (gy / gl * d.v - d.vy) * k; d.vz += (gz / gl * d.v - d.vz) * k
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt, nz = d.z + d.vz * dt
      const fy = floorAt(H.world, nx, nz, ny + 1).h
      if (!insideSolid(H.world, nx, ny, nz) && ny < fy + 0.8) { d.vy = Math.max(d.vy, 0) }   // 地面すれすれは滑るように飛ぶ（ぶつからない）
      if (insideSolid(H.world, nx, ny, nz)) {
        d.gone = true
        // 振り回して当てた: 真後ろを追われていて、空中を速く飛んでいた時だけ
        const near = d.tailT != null && H.t - d.tailT < 0.8 && !r.grounded && !r.climbing && Math.hypot(r.vx, r.vy, r.vz) >= 10
        ev(H, { t: 'droneCrash', id: d.id, x: nx, y: ny, z: nz, mine: near })
        if (near) tech(H, 'crash', PTS.crash, r, { x: nx, y: ny, z: nz })
        continue
      }
      d.x = nx; d.y = ny; d.z = nz
      if (d.t > d.life || dist > 110) { d.mode = 'leave'; d.t = 0 }
    } else {
      d.vy += (14 - d.vy) * Math.min(1, dt * 2); d.y += d.vy * dt; d.x += d.vx * dt * 0.3; d.z += d.vz * dt * 0.3
      if (d.t > 4) d.gone = true
      continue
    }
    if (d.mode !== 'leave') touch(H, d, droneGap(d, r.x, r.y, r.z), r, 'drone')
  }
  H.drones = H.drones.filter(d => !d.gone)
}

// ---------------------------------------------------------------- ヘリのサーチライト
// 光の輪が追ってくる（9m/s まで）。輪の中で見通しが通っていると警報計がたまり、満タンでドローン2機が来る。速さか建物の陰で振り切る
function stepLight(H, r, dt) {
  const L = H.light
  if (H.noLight) return
  const dx = r.x - L.x, dz = r.z - L.z, d = Math.hypot(dx, dz)
  const v = Math.min(HZ.lightV, d * 1.6)
  if (d > 0.01) { L.x += dx / d * v * dt; L.z += dz / d * v * dt }
  L.ang += dt * 0.35
  const gy = floorAt(H.world, L.x, L.z, 200).h
  L.hx = L.x + Math.cos(L.ang) * 22; L.hz = L.z + Math.sin(L.ang) * 22; L.hy = Math.max(gy, r.y) + HZ.lightH
  L.gy = gy
  if (L.cd > 0) { L.cd -= dt; L.on = L.cd < 1.5; L.meter = Math.max(0, L.meter - dt * HZ.lightDecay); return }
  L.on = true
  const lit = Math.hypot(r.x - L.x, r.z - L.z) < HZ.lightR && !blocked(H.world, L.hx, L.hy, L.hz, r.x, r.y + 1.2, r.z)
  if (lit) {
    L.meter += dt / HZ.lightFill
    if (!L.saw) { L.saw = true; ev(H, { t: 'lit' }) }
    if (L.meter >= 1) {
      L.meter = 0; L.cd = HZ.lightCd; L.saw = false
      ev(H, { t: 'spotted', x: L.hx, y: L.hy, z: L.hz })
      if (!H.noDrones) for (let k = 0; k < 2; k++) { const dd = addDrone(H, { x: L.hx + (k ? 3 : -3), y: L.hy - 4, z: L.hz }); dd.vx = (r.x - L.hx) * 0.2; dd.vz = (r.z - L.hz) * 0.2 }
    }
  } else {
    if (L.saw && L.meter > 0.45) { L.saw = false; tech(H, 'shake', PTS.shake, r) }
    else if (L.meter <= 0) L.saw = false
    L.meter = Math.max(0, L.meter - dt * HZ.lightDecay)
  }
}

function finish(H, how) {
  if (H.over) return
  H.over = true; H.end = how; H.stats.time = H.t + H.penalty
  ev(H, { t: 'end', how })
}
export function summary(H) {
  const S = H.stats
  return { ...S, end: H.end, course: H.course, rings: S.rings, of: H.cps.length, t: H.t, time: H.t + H.penalty, misses: H.misses, penalty: H.penalty, mult: H.mult, chain: H.chain }
}
export function rankOf(score) { return score >= RANKS[0] ? 0 : score >= RANKS[1] ? 1 : score >= RANKS[2] ? 2 : score >= RANKS[3] ? 3 : 4 }
// 次の目標（輪か気球）
export function target(H) { const C = H.cps[H.cp]; return C ? { x: C.x, y: C.y, z: C.z, ring: C } : H.goal ? { x: H.goal.x, y: H.goal.y, z: H.goal.z, goal: true } : { x: H.cps[H.cps.length - 1].x, y: 0, z: H.cps[H.cps.length - 1].z } }
