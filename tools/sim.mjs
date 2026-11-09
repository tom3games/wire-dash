// bot を種を変えて回し、結果の分布を出す。node tools/sim.mjs [回数] [性格] [v=1で出来事を全部出す]
import { createWorld } from '../shared/track.js?v=1'
import { createRunner, stepRunner } from '../shared/runner.js?v=1'
import { createStreet, buildPoles } from '../shared/street.js?v=1'
import { addTown, clearShopFront } from '../shared/town.js?v=1'
import { createHeist, stepHeist, summary, SHOP, addHeistMap, medalOf, MEDAL } from '../shared/heist.js?v=1'
import { createBot, botInput } from '../shared/heistbot.js?v=1'
const N = +(process.argv[2] || 8), only = process.argv[3], verbose = process.argv[4] === 'v'
const world = createWorld('city'); clearShopFront(world, SHOP); addTown(world, SHOP); buildPoles(world, SHOP); addHeistMap(world)
const dt = 1 / 60
const COURSE = +(process.env.C || 1)
export function play(kind, seed, course = COURSE) {
  const H = createHeist(world, seed, { course }), b = createBot(kind, seed), st = createStreet(world, seed)
  const r = createRunner({ id: 'me', spawn: H.start })
  const cnt = {}
  while (!H.over && H.t < 400) {
    const inp = botInput(b, r, H, world, dt)
    r.events.length = 0
    stepRunner(r, inp, dt, world); st.update(dt, r); st.collide(r)
    stepHeist(H, r, dt)
    for (const e of r.events) cnt['r:' + e.t] = (cnt['r:' + e.t] || 0) + 1
    for (const e of H.events) { cnt[e.t] = (cnt[e.t] || 0) + 1; if (verbose && !['pts', 'multUp'].includes(e.t)) console.log(H.t.toFixed(1), JSON.stringify(e)) }
    H.events.length = 0
    if (verbose && Math.round(H.t * 60) % 60 === 0) console.log(H.t.toFixed(0), 'pos', r.x.toFixed(0), r.y.toFixed(0), r.z.toFixed(0), 'v', Math.hypot(r.vx, r.vy, r.vz).toFixed(0), r.rope ? 'rope' : r.grounded ? 'ground' : r.climbing ? 'climb' : 'air', 'cp', H.cp)
  }
  return { ...summary(H), cnt }
}
const kinds = only ? only.split(',') : ['skilled', 'average', 'notech', 'idle']
console.log(`コース${COURSE}  メダルの境目 ${JSON.stringify(MEDAL[COURSE])}`)
for (const k of kinds) {
  const rows = [], t0 = Date.now()
  for (let s = +(process.env.S0 || 1); s < +(process.env.S0 || 1) + N; s++) rows.push(play(k, s))
  const avg = f => (rows.reduce((a, x) => a + f(x), 0) / rows.length)
  const cl = rows.filter(x => x.end === 'clear'), tm = cl.map(x => x.time).sort((a, b) => a - b)
  const md = { gold: 0, silver: 0, bronze: 0, none: 0, nomiss: 0, near: 0, n: 0 }
  rows.forEach(x => { const m = medalOf(COURSE, x); md[m.time || 'none']++; if (m.nomiss) md.nomiss++; if (m.near) md.near++; md.n += m.n })
  console.log(`${k.padEnd(8)} ゴール${cl.length}/${N} タイム 中央${tm.length ? tm[tm.length >> 1].toFixed(1) : '-'} 最速${tm.length ? tm[0].toFixed(1) : '-'} 最遅${tm.length ? tm[tm.length - 1].toFixed(1) : '-'}秒  ミス${avg(x => x.misses).toFixed(1)}  スコア${Math.round(avg(x => x.score))}  メダル ${JSON.stringify(md)} 平均${(md.n / N).toFixed(1)}/5  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  console.log(`         紙一重${avg(x => x.near).toFixed(1)}(極${avg(x => x.tight).toFixed(1)}) ナイス${avg(x => x.nice || 0).toFixed(1)} 急旋回${avg(x => x.turn || 0).toFixed(1)} 壁蹴り${avg(x => x.kick || 0).toFixed(1)} 急降下${avg(x => x.dive || 0).toFixed(1)} 激突${avg(x => x.crash || 0).toFixed(1)} 最高倍率${avg(x => x.bestMult).toFixed(2)} 内訳${JSON.stringify(Object.fromEntries(['rotor', 'ball', 'shutter', 'line', 'net', 'drone'].map(s => [s, +avg(x => x.hitBy[s] || 0).toFixed(1)])))}`)
}
