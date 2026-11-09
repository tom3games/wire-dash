import { createWorld } from '../shared/track.js'
import { createRunner, stepRunner, RUN } from '../shared/runner.js'
import { createStreet, buildPoles } from '../shared/street.js'
import { addTown, clearShopFront } from '../shared/town.js'
import { createHeist, stepHeist, SHOP, addHeistMap } from '../shared/heist.js'
import { createBot, botInput } from '../shared/heistbot.js'
import { sweep } from './reach.mjs'
const world = createWorld('city'); clearShopFront(world, SHOP); addTown(world, SHOP); buildPoles(world, SHOP); addHeistMap(world)
const dt = 1 / 60, N = +(process.argv[2] || 16)
// 1) 掛かる向き: 運河の輪の手前（z=548・530）と輪の上
for (const seed of [1, 2]) {
  const H = createHeist(world, seed, { course: 2 }), C = H.cps[1]
  const pts = [[C.x, 0, 560, '手前の岸 地上'], [C.x, 14, 548, '手前の岸 14m'], [C.x, C.y, C.z + 10, '輪の手前10m 空中'], [C.x, C.y, C.z, '輪の中'], [C.x, C.y, C.z - 20, '輪の先20m']]
  for (const [x, y, z, n] of pts) {
    const rows = sweep(world, x, y, z, RUN.wireRange, 5)
    const ds = rows.filter(r => r.hit).map(r => r.hit.d).sort((a, b) => a - b)
    console.log(`輪x=${C.x} ${n}: タップで掛からない ${rows.filter(r => !r.hit).length}/72 ボタン不発 ${rows.filter(r => r.btn == null).length}/72 最寄り ${ds[0] ? ds[0].toFixed(0) : '-'}m`)
  }
}
// 2) bot: 輪ごとの区間タイムとミス・失敗
for (const kind of ['skilled', 'average', 'notech']) {
  const seg = [[], []], miss = [0, 0]; let fail = [0, 0]
  for (let s = 1; s <= N; s++) {
    const H = createHeist(world, s, { course: 2 }), b = createBot(kind, s), st = createStreet(world, s), r = createRunner({ id: 'me', spawn: H.start })
    let last = 0
    while (!H.over && H.t < 120) {
      const inp = botInput(b, r, H, world, dt); r.events.length = 0
      stepRunner(r, inp, dt, world); st.update(dt, r); st.collide(r); stepHeist(H, r, dt)
      for (const e of H.events) { if (e.t === 'ring') { seg[e.n - 1].push(H.t - last); last = H.t } if (e.t === 'hit') miss[H.cp]++ }
      H.events.length = 0
    }
    if (H.end !== 'clear') fail[Math.min(1, H.cp)]++
  }
  const md = a => a.length ? a.sort((x, y) => x - y)[a.length >> 1].toFixed(1) : '-'
  console.log(`${kind.padEnd(8)} 輪1(ビルの谷) 区間中央${md(seg[0])}秒 ミス${miss[0]} 失敗${fail[0]} ／ 輪2(運河) 区間中央${md(seg[1])}秒 ミス${miss[1]} 失敗${fail[1]}  (${N}回)`)
}
