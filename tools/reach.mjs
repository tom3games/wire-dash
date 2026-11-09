// 開始地点から、どの向きにワイヤーが掛かるかを角度別のレイトレースで測る。node tools/reach.mjs
// 実際の判定（runner.js の rayHit＝画面タップ、findAnchor＝ワイヤーボタン）をそのまま使う
import { createWorld } from '../shared/track.js?v=1'
import { createRunner, findAnchor, rayHit, RUN } from '../shared/runner.js?v=1'
import { SHOP as SHOP0, SPAWN, addHeistMap, createHeist } from '../shared/heist.js?v=1'
const JOB = { shop: SHOP0 }
import { buildPoles } from '../shared/street.js?v=1'
import { addTown } from '../shared/town.js?v=1'

// 向き deg（0=南+z、90=東+x）に、水平から pitchTop 度までの上向きの線を振って、最初に掛かる点の距離（無ければ null）
export function tapReach(world, x, y, z, deg, range = RUN.wireRange) {
  const a = deg * Math.PI / 180, ox = x, oy = y + 1.5, oz = z
  let best = null
  for (let p = -6; p <= 80; p += 1) {
    const pr = p * Math.PI / 180, dx = Math.sin(a) * Math.cos(pr), dy = Math.sin(pr), dz = Math.cos(a) * Math.cos(pr)
    const h = rayHit(world, ox, oy, oz, dx, dy, dz, range)
    if (!h) continue
    if (!h.low && h.y <= y + 2) continue                  // 自分より低い点は掛からない（stepRunner の条件）
    const d = Math.hypot(h.x - x, h.y - (y + 1.5), h.z - z)
    if (d > range) continue
    if (best == null || d < best.d) best = { d, low: !!h.low, pole: !!h.pole }
  }
  return best
}
export function sweep(world, x, y, z, range, step = 5) {
  const rows = []
  for (let deg = 0; deg < 360; deg += step) {
    const hit = tapReach(world, x, y, z, deg, range)
    const r = createRunner({ id: 'm', spawn: { x, y, z, yaw: deg * Math.PI / 180 } })
    const btn = findAnchor(world, r, deg * Math.PI / 180)
    rows.push({ deg, hit, btn: btn && Math.round(Math.hypot(btn.x - x, btn.y - (y + 1.5), btn.z - z)) })
  }
  return rows
}
if (process.argv[1] && process.argv[1].endsWith('reach.mjs')) {
  const world = createWorld('city'); addTown(world, JOB.shop); buildPoles(world, JOB.shop); addHeistMap(world)
  const start = { x: SPAWN.x, z: SPAWN.z }
  for (const range of [RUN.wireRange, 35, 20]) {
    const rows = sweep(world, start.x, 0, start.z, range)
    const miss = rows.filter(r => !r.hit).map(r => r.deg)
    const ds = rows.filter(r => r.hit).map(r => r.hit.d).sort((a, b) => a - b)
    console.log(`開始地点 ${range}m: 掛かる向き ${rows.length - miss.length}/${rows.length}  掛からない向き [${miss.join(',')}]  距離の中央 ${ds.length ? Math.round(ds[ds.length >> 1]) : '-'}m 最大 ${ds.length ? Math.round(ds[ds.length - 1]) : '-'}m`)
  }
  const rows = sweep(world, start.x, 0, start.z, RUN.wireRange, 30)
  console.log('向き別（度: タップで掛かる最短 / ボタンの点）', rows.map(r => `${r.deg}:${r.hit ? Math.round(r.hit.d) + (r.hit.low ? '低' : r.hit.pole ? '柱' : '') : '×'}/${r.btn ?? '×'}`).join('  '))
  // 店の区画の中を 10m ごとに歩いて、35m 以内に掛けられない向きがいくつあるか
  for (const range of [RUN.wireRange, 35]) {
    let pts = 0, bad = 0, worst = 0, btnBad = 0
    for (let x = 20; x <= 116; x += 12) for (let z = 834; z <= 936; z += 12) {
      if (world.colliders.some(o => o.y1 != null && !o.slab && Math.abs(x - o.cx) < o.hw + 0.5 && Math.abs(z - o.cz) < o.hl + 0.5)) continue
      const rr = sweep(world, x, 0, z, range, 15), n = rr.filter(r => !r.hit).length
      pts++; bad += n ? 1 : 0; worst = Math.max(worst, n); btnBad += rr.filter(r => r.btn == null).length
    }
    console.log(`区画の中 ${pts} 地点（${range}m・15度刻み）: 掛からない向きが残る地点 ${bad}／最悪 ${worst} 向き／ワイヤーボタンが不発の向き 計 ${btnBad}`)
  }
}
// コースの上（輪・道しるべ・気球の手前）で、地上と空中10mから全方位に掛かるか（怪盗、2026-11-09）
if (process.argv[1] && process.argv[1].endsWith('reach.mjs')) {
  const world = createWorld('city'); addTown(world, JOB.shop); buildPoles(world, JOB.shop); addHeistMap(world)
  for (const seed of [1, 2]) {
    const H = createHeist(world, seed, { course: 4 })
    const pts = [...H.cps.map(C => ({ x: C.x - C.nx * 20, z: C.z - C.nz * 20, n: 'ring' + C.i })), ...H.route.flat().map((w, i) => ({ x: w.x, z: w.z, n: 'way' + i })), { x: H.goal.x - 25, z: H.goal.z + 20, n: 'goal' }, ...[1, 2, 3].map(c => { const S = createHeist(world, seed, { course: c }).start; return { x: S.x, z: S.z, n: 'start' + c } })]
    let worst = 0, sum = 0, btn = 0
    const bad = []
    for (const q of pts) for (const y of [0, 10]) {
      const rows = sweep(world, q.x, y, q.z, RUN.wireRange, 5), miss = rows.filter(r => !r.hit).length
      worst = Math.max(worst, miss); sum += miss; btn += rows.filter(r => r.btn == null).length
      if (miss > 6) bad.push(`${q.n}@${y}m:${miss}`)
    }
    console.log(`コース（種${seed}）${pts.length}地点×地上/空中10m: 掛からない向き 平均${(sum / pts.length / 2).toFixed(1)}/72 最悪${worst}/72 ボタン不発 計${btn}  多い所 ${bad.join(' ') || 'なし'}`)
  }
}
