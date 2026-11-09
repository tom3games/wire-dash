// CPU（釣り合いの検証とタイトルのデモ用）。先読みして、危ない手を避け、輪へ近づく手を選ぶ
//   skilled: 0.1秒ごとに 1.3秒先まで読む。ナイスリリース・掛け替え・急降下・壁蹴りを使う
//   average: 0.22秒ごとに 1.0秒先まで。技も使うが、手を選ぶのが遅く、狙いが少しぶれる
//   notech:  ワイヤーを掛けるだけ（離すのは自動・技を使わない）。掛ける向きは先読みで選ぶ
//   idle:    何もしない（いちばん悪い結果になるはず）
import { findAnchor, stepRunner, floorAt, canKick, RUN } from './runner.js?v=1'
import { probe, target, HZ } from './heist.js?v=1'

const CFG = {
  skilled: { gap: 0.3, every: 0.1, horizon: 1.3, yaws: [0, 0.35, -0.35, 0.7, -0.7, 1.2, -1.2], tech: true, jitter: 0, lag: 0 },
  average: { gap: 0.45, every: 0.22, horizon: 1.0, yaws: [0, 0.4, -0.4, 0.9, -0.9], tech: true, jitter: 0.25, lag: 0.12 },
  notech: { gap: 0.5, every: 0.25, horizon: 1.0, yaws: [0, 0.4, -0.4, 0.9, -0.9], tech: false, jitter: 0.15, lag: 0 }
}
export function createBot(kind, seed = 1) {
  let q = (seed * 9301 + 49297) % 233280
  return { kind, cfg: CFG[kind], rnd: () => ((q = (q * 9301 + 49297) % 233280) / 233280), t: 0, next: 0, prevW: false, pending: null, queue: [], freeT: 0 }
}

function cloneR(r) {
  const c = { ...r }
  c.events = []; c.rope = r.rope ? { ...r.rope } : null; c.climbing = r.climbing ? { ...r.climbing } : null
  c.dmg = { ...r.dmg }; c.safeHist = []; c.wallN = r.wallN ? { ...r.wallN } : null
  return c
}
// 次に向かう点: 輪の手前側にいれば輪の中心、通り過ぎて外れていたら回り込む点
function goalOf(H, r, b) {
  // 通りの角の点を先にたどる（近づいたら次へ）
  const W = H.route && H.route[H.cp]
  if (b && W) {
    if (b.cp !== H.cp) { b.cp = H.cp; b.wi = 0 }
    while (b.wi < W.length && Math.hypot(W[b.wi].x - r.x, W[b.wi].z - r.z) < 22) b.wi++
    if (b.wi < W.length) return W[b.wi]
  }
  const T = target(H)
  if (!T.ring) return T
  const C = T.ring, s = (r.x - C.x) * C.nx + (r.z - C.z) * C.nz
  if (s > 2) return { x: C.x - C.nx * 18, y: C.y + 2, z: C.z - C.nz * 18, ring: C, behind: true }
  return T
}
// 張り付いている壁そのものに掛けない（同じ壁にぶつかってまた張り付くだけ）
function anchorOff(world, r, yaw) {
  const a = findAnchor(world, r, yaw)
  if (!a || !r.climbing) return a
  return (a.x - r.x) * r.climbing.nx + (a.z - r.z) * r.climbing.nz > 3 ? a : null
}
const dirTo = (r, g) => { const dx = g.x - r.x, dz = g.z - r.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l, d: l, yaw: Math.atan2(dx, dz) } }

// 1つの手を先読みする。返り値は点数（高いほど良い）
function simulate(H, world, r0, act, cfg, dt, b) {
  const r = cloneR(r0), g0 = goalOf(H, r0, b), bw = { cp: b.cp, wi: b.wi }
  const C = H.cps[H.cp]
  const N = Math.round(cfg.horizon / dt)
  let minGap = 1e9, hitAt = -1, passAt = -1, free = 0, prevX = r.x, prevY = r.y, prevZ = r.z, pressedW = false
  for (let i = 0; i < N; i++) {
    const g = goalOf(H, r, bw), d = dirTo(r, g)
    const inp = { throttle: r.rope && !r.climbing ? 1 : 0, steer: 0, moveDir: r.climbing ? null : { x: d.x, z: d.z }, wire: false }
    if (i === 0) {
      if (act.t === 'release') inp.wire = true
      else if (act.t === 'hook' || act.t === 'swapHook') { if (act.a) { inp.wire = true; inp.wireAt = act.a } }
      else if (act.t === 'dive') { inp.wire = true; inp.wireAt = act.a }
      else if (act.t === 'kick') inp.wire = true
      else if (act.t === 'swap') inp.wire = true
    } else if (act.t === 'swap' && i === 6 && !r.rope) {
      const a = findAnchor(world, r, act.yaw); if (a) { inp.wire = true; inp.wireAt = a }
    } else if (r.climbing && i >= 15 && i % 6 === 0) { const a = anchorOff(world, r, d.yaw); if (a) { inp.wire = true; inp.wireAt = a } }
    else if (!r.rope && !r.grounded && !r.climbing) {
      // その後の手: 落ち始めたら前へ掛け直す（だれでもやること）
      free += dt
      if (free > 0.35 && r.vy < -1 && i % 6 === 0) { const a = findAnchor(world, r, d.yaw); if (a) { inp.wire = true; inp.wireAt = a; free = 0 } }
    } else if (r.grounded && i >= 15 && i % 10 === 0) { const a = findAnchor(world, r, d.yaw); if (a) { inp.wire = true; inp.wireAt = a } }
    // 押した瞬間だけ効く（runner は押しっぱなしを見ない）
    if (inp.wire && pressedW) { inp.wire = false; delete inp.wireAt }
    pressedW = !!inp.wire
    r.events.length = 0
    stepRunner(r, inp, dt, world)
    if (i % 2 === 0 || i < 8) {
      const gp = probe(H, H.t + (i + 1) * dt, r.x, r.y, r.z, (i + 1) * dt)
      if (gp < minGap) minGap = gp
      if (gp < 0.05 && hitAt < 0 && H.inv < (i + 1) * dt) hitAt = i
    }
    if (C && passAt < 0) {
      const s0 = (prevX - C.x) * C.nx + (prevZ - C.z) * C.nz, s1 = (r.x - C.x) * C.nx + (r.z - C.z) * C.nz
      if ((s0 < 0) !== (s1 < 0)) { const k = s0 / (s0 - s1 || 1), ix = prevX + (r.x - prevX) * k, iy = prevY + 1.1 + (r.y - prevY) * k, iz = prevZ + (r.z - prevZ) * k; if (Math.hypot(ix - C.x, iy - C.y, iz - C.z) < (C.r || HZ.ringR) + 0.8) passAt = i }
    } else if (!C && H.goal && passAt < 0 && Math.hypot(r.x - H.goal.x, r.y + 1 - H.goal.y, r.z - H.goal.z) < HZ.goalR - 1) passAt = i
    prevX = r.x; prevY = r.y; prevZ = r.z
    if (hitAt >= 0) break
  }
  const g = goalOf(H, r, bw)
  let s = 0
  if (bw.wi > b.wi || bw.cp !== b.cp) s += 60   // 道しるべを1つ進んだ
  if (hitAt >= 0) s -= 1000 - hitAt * 4
  if (passAt >= 0) s += 600 - passAt * 2
  const dist = Math.hypot(g.x - r.x, (g.y - r.y) * 0.6, g.z - r.z)
  s -= dist * 1.2
  s += Math.hypot(r.vx, r.vz) * 0.35
  if (dist < 45 && g.y != null) s -= Math.abs(r.y + 1 - g.y) * 0.6
  if (r.grounded) s -= 35
  else if (r.y - floorAt(world, r.x, r.z, r.y).h < 3) s -= 12
  if (minGap < 1.2 && hitAt < 0) s -= (1.2 - minGap) * 8
  void g0
  return s
}

export function botInput(b, r, H, world, dt) {
  const inp = { throttle: 0, steer: 0 }
  if (b.kind === 'idle' || H.over) return inp
  const cfg = b.cfg
  b.t += dt
  const g = goalOf(H, r, b), d = dirTo(r, g)
  inp.throttle = r.rope && !r.climbing ? 1 : r.grounded ? 1 : 0; inp.moveDir = r.climbing ? null : { x: d.x, z: d.z }
  let press = null
  b.stillT = (r.climbing || r.grounded) ? (b.stillT || 0) + dt : 0
  // 予定の手（掛け替えの2手目）
  if (b.pending && b.t >= b.pending.at) {
    const a = !r.rope ? findAnchor(world, r, b.pending.yaw) : null
    if (a) press = { wireAt: a }
    b.pending = null
  } else if (b.queue.length && b.t >= b.queue[0].at) {
    press = b.queue.shift().press
  } else if (b.t >= b.next && b.t - (b.lastPress || -9) >= cfg.gap) {
    b.next = b.t + cfg.every
    const acts = [{ t: 'hold' }]
    const baseYaw = d.yaw + (cfg.jitter ? (b.rnd() - 0.5) * cfg.jitter * 2 : 0)
    if (!r.rope) {
      for (const yo of cfg.yaws) { const a = anchorOff(world, r, baseYaw + yo); if (a && !acts.some(x => x.a && Math.hypot(x.a.x - a.x, x.a.y - a.y, x.a.z - a.z) < 1)) acts.push({ t: 'hook', a, yaw: baseYaw + yo }) }
      if (canKick(r) && (cfg.tech || r.climbing)) acts.push({ t: 'kick' })   // 壁に張り付いている時のボタンはだれでも壁蹴りになる
      if (cfg.tech && !r.grounded && r.y - floorAt(world, r.x, r.z, r.y).h > HZ.diveH + 1) {
        const fx = r.x + d.x * Math.min(24, d.d), fz = r.z + d.z * Math.min(24, d.d), fy = floorAt(world, fx, fz, r.y).h
        if (fy < r.y - 4) acts.push({ t: 'dive', a: { x: fx, y: fy, z: fz, ground: true } })
      }
    } else if (cfg.tech) {
      acts.push({ t: 'release' })
      for (const yo of cfg.yaws.slice(0, 5)) acts.push({ t: 'swap', yaw: baseYaw + yo })
    }
    if (b.stillT > 0.8 && acts.length > 1) acts.shift()   // 壁や地面で止まったままにしない
    let best = acts[0], bs = -1e9
    for (const a of acts) { const sc = simulate(H, world, r, a, cfg, dt, b) + (a.t === 'hold' && !r.climbing && !r.grounded ? 3 : 0); if (sc > bs) { bs = sc; best = a } }
    if (best.t === 'hook' || best.t === 'dive') press = { wireAt: best.a }
    else if (best.t === 'release' || best.t === 'kick') press = {}
    else if (best.t === 'swap') { press = {}; b.pending = { at: b.t + 0.1 + cfg.lag, yaw: best.yaw } }
    if (press && cfg.lag && best.t !== 'swap') { b.queue.push({ at: b.t + cfg.lag, press }); press = null }
  }
  if (press && !b.prevW) { inp.wire = true; b.lastPress = b.t; if (press.wireAt) inp.wireAt = press.wireAt }
  b.prevW = !!inp.wire
  void RUN
  return inp
}
