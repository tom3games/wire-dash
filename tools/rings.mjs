// 全コース・全部の輪を、いろいろな速さ・向き・場所（真ん中と縁の近く）で通して、くぐったと数えるか調べる。node tools/rings.mjs
import { createWorld } from '../shared/track.js?v=1'
import { createRunner } from '../shared/runner.js?v=1'
import { buildPoles } from '../shared/street.js?v=1'
import { addTown } from '../shared/town.js?v=1'
import { SHOP, addHeistMap, createHeist, stepHeist, HZ } from '../shared/heist.js?v=1'
const world = createWorld('city'); addTown(world, SHOP); buildPoles(world, SHOP); addHeistMap(world)
const dt = 1 / 60
let total = 0, skipped = 0, bad = []
const HITS = process.argv.includes('hits')   // 仕掛けに当たる回も入れる（当たった時のはじき方で輪の手前に戻されないか）
for (const course of [1, 2, 3, 4]) for (const seed of [1, 2, 3]) {
  const H0 = createHeist(world, seed, { course })
  H0.cps.forEach((C, ci) => {
    const R = C.r || HZ.ringR, ux = -C.nz, uz = C.nx
    for (const v of [8, 15, 25, 38, 60, 90]) for (const yaw of [-40, 0, 40]) for (const pitch of [-30, 0, 30]) for (const [a, b] of [[0, 0], [0.85, 0], [-0.85, 0], [0, 0.85], [0, -0.85], [0.6, 0.6]]) {
      const H = createHeist(world, seed, { course }); H.inv = HITS ? 0 : 1e9; H.cp = ci; if (HITS) H.t = (v * 7 + yaw + pitch) % 5
      // 輪の面の上の点（見た目の輪の内側）。胸の高さ（足 +1.1）がそこを通るように
      const px = C.x + ux * a * R, py = C.y + b * R, pz = C.z + uz * a * R
      const yr = yaw * Math.PI / 180, pr = pitch * Math.PI / 180
      const dx = (C.nx * Math.cos(yr) - C.nz * Math.sin(yr)) * Math.cos(pr), dz = (C.nz * Math.cos(yr) + C.nx * Math.sin(yr)) * Math.cos(pr), dy = Math.sin(pr)
      const r = createRunner({ id: 'm', spawn: { x: px - dx * v * 0.5, y: py - 1.1 - dy * v * 0.5, z: pz - dz * v * 0.5 } }); r.vx = dx * v; r.vy = dy * v; r.vz = dz * v
      H.lastX = r.x; H.lastY = r.y; H.lastZ = r.z
      let ok = false, far = false
      for (let i = 0; i < 60 && !ok; i++) {
        r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; r.events.length = 0
        stepHeist(H, r, dt)
        if (H.events.some(e => e.t === 'ring')) ok = true
        // 輪から 8m 以上手前で別の障害物にぶつかった回は「輪に届いていない」ので数えない側に分ける
        if (H.events.some(e => e.t === 'hit' && Math.abs((e.x - C.x) * C.nx + (e.z - C.z) * C.nz) >= 8)) far = true
        H.events.length = 0
      }
      total++
      if (!ok && far) { skipped++; continue }
      if (!ok) bad.push((H.misses ? '[当たった] ' : '') + `c${course} s${seed} 輪${ci + 1}(${C.x},${C.y},${C.z}) v${v} yaw${yaw} pitch${pitch} at(${a},${b})`)
    }
  })
}
console.log(`通した軌道 ${total} 本 → 数えなかった ${bad.length} 本（輪の8m以上手前で別の物に当たって届かなかった ${skipped} 本は除外）`)
const byRing = {}; for (const b of bad) { const k = b.split(' v')[0].replace('[当たった] ', ''); byRing[k] = (byRing[k] || 0) + 1 }
console.log('輪ごと', JSON.stringify(byRing))
console.log(bad.slice(0, 40).join('\n'))
process.exit(bad.length ? 1 : 0)
