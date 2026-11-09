// 障害物にワイヤーが掛からないこと・ビルには全方位で掛かることを数える。node tools/nohook.mjs
import { createWorld } from '../shared/track.js?v=1'
import { createRunner, findAnchor, rayHit, RUN } from '../shared/runner.js?v=1'
import { buildPoles } from '../shared/street.js?v=1'
import { addTown } from '../shared/town.js?v=1'
import { SHOP, addHeistMap, createHeist } from '../shared/heist.js?v=1'
import { sweep } from './reach.mjs'
const world = createWorld('city'); addTown(world, SHOP); buildPoles(world, SHOP); addHeistMap(world)
const inside = (p, b, m = 0.05) => p.x > b.x0 - m && p.x < b.x1 + m && p.y > b.y0 - m && p.y < b.y1 + m && p.z > b.z0 - m && p.z < b.z1 + m
for (const c of [1, 2, 3, 4]) {
  let rays = 0, onObs = 0, noHook = 0, btn = 0, btnIn = 0
  for (const seed of [1, 2, 3]) {
    const H = createHeist(world, seed, { course: c })
    // 1) 障害物の真ん中へ、まわり 8 方向・3 高さから線を飛ばす
    for (const b of world.noHook) {
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2
      for (let k = 0; k < 8; k++) for (const dy of [-8, 0, 8]) {
        const a = k * Math.PI / 4, ox = cx + Math.sin(a) * 16, oz = cz + Math.cos(a) * 16, oy = Math.max(1, cy + dy)
        const dx = cx - ox, dyy = cy - oy, dz = cz - oz, l = Math.hypot(dx, dyy, dz)
        const h = rayHit(world, ox, oy, oz, dx / l, dyy / l, dz / l, 120); rays++
        if (h && h.noHook) noHook++
        else if (h && world.noHook.some(q => inside(h, q))) onObs++
      }
    }
    // 2) 大ボタンの自動の狙い: コースの輪のまわり・通りの上から全方位
    for (const C of H.cps) for (const y of [4, 14, 24]) for (let k = 0; k < 24; k++) {
      const r = createRunner({ id: 'm', spawn: { x: C.x - C.nx * 25, y, z: C.z - C.nz * 25, yaw: k * Math.PI / 12 } }); r.grounded = false
      const a = findAnchor(world, r, k * Math.PI / 12); btn++
      if (a && world.noHook.some(q => inside(a, q))) btnIn++
    }
  }
  console.log(`コース${c}: 障害物へ向けた線 ${rays} 本 → 障害物に掛かった ${onObs}・「掛からない」で止まった ${noHook}／ボタンの自動の狙い ${btn} 回 → 障害物の中の点 ${btnIn}`)
  // 3) ビルには掛かるか: 輪の手前の空中から 72 方向
  const H = createHeist(world, 1, { course: c })
  let miss = 0, bmiss = 0, n = 0
  for (const C of H.cps) { const rows = sweep(world, C.x - C.nx * 25, C.y, C.z - C.nz * 25, RUN.wireRange, 5); miss += rows.filter(r => !r.hit).length; bmiss += rows.filter(r => r.btn == null).length; n += 72 }
  const S = H.start, rows = sweep(world, S.x, 0, S.z, RUN.wireRange, 5)
  console.log(`         輪の手前25mの空中から72方向: タップで掛からない ${miss}/${n}・ボタン不発 ${bmiss}/${n}／スタート地点 ${72 - rows.filter(r => !r.hit).length}/72`)
}
