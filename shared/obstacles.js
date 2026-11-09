// 繁華街の谷間の障害物（ビルとビルの間の空中）。three.js に依存しない。画面と bot で同じ形を使う
// 2026-11-09 本人「街中のごちゃごちゃした所を避けながらスイング。ビルとビルの間に謎の架け橋みたいな障害物。障害物にはワイヤーは掛からないように」
//
// 障害物は world.colliders に入れない（＝ワイヤーの狙い rayHit / findAnchor の対象にならない。掛かるのはビルの壁と屋上の縁だけ）。
// 当たりは shared/heist.js の hazGap（kind 'shape'）。触れるとミス（+3秒・はじかれる）
//
// 形は箱（向きつき）と細い線分の集まり。種類:
//   skybridge 渡り廊下（通りの幅いっぱいの箱。上か下をくぐる）
//   arch      謎の架け橋（細い弓なりの橋を2〜3本、高さを変えて斜めに）
//   cables    電線の束（たるんだ線を4〜6本、同じくらいの高さに）
//   sign      横に突き出た看板（片側の壁から通りの半分まで）
//   crane     クレーンのアーム（屋上から通りへ長い腕と、垂れた鉤）
//   monorail  モノレールの高架（通りの真ん中を長く。柱つき）
//   banner    垂れ幕（細い桁から縦に長い幕）

// 通りの1本（直線）。axis: 進む向き 'x' か 'z'。c: 通りの中心の座標。w: 中心から壁までの距離。a〜b: 区間
function rnd0(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// 区間の中の位置 u（進む向き）と横 v・高さ y から世界の座標へ
const P = (L, u, v) => L.axis === 'z' ? { x: L.c + v, z: u } : { x: u, z: L.c + v }
// 進む向きに沿った箱: du 進む向きの半分の長さ、dv 横の半分、hh 高さの半分
function box(L, u, v, y, du, dv, hh, tag) { const p = P(L, u, v); return L.axis === 'z' ? { cx: p.x, cz: p.z, cy: y, hw: dv, hl: du, hh, tag } : { cx: p.x, cz: p.z, cy: y, hw: du, hl: dv, hh, tag } }
function seg(L, u0, v0, y0, u1, v1, y1, r) { const a = P(L, u0, v0), b = P(L, u1, v1); return [a.x, y0, a.z, b.x, y1, b.z, r] }

export function makeObstacle(type, L, u, rnd) {
  const W = L.w, boxes = [], segs = []
  if (type === 'skybridge') {
    const y = 12 + rnd() * 22
    boxes.push(box(L, u, 0, y, 2.2, W, 1.8, 'deck'))
    if (rnd() < 0.5) boxes.push(box(L, u, 0, y + 9 + rnd() * 6, 1.6, W, 1.2, 'deck'))   // 2段の時もある
  } else if (type === 'arch') {
    const n = 2 + Math.floor(rnd() * 2)
    for (let k = 0; k < n; k++) {
      const y0 = 10 + rnd() * 26, rise = 3 + rnd() * 4, du = (rnd() - 0.5) * 14, side = rnd() < 0.5 ? 1 : -1
      const K = 6
      for (let i = 0; i < K; i++) {
        const f0 = i / K, f1 = (i + 1) / K
        const v0 = -W + 2 * W * f0, v1 = -W + 2 * W * f1
        segs.push(seg(L, u + du * (f0 - 0.5) * side, v0, y0 + Math.sin(Math.PI * f0) * rise, u + du * (f1 - 0.5) * side, v1, y0 + Math.sin(Math.PI * f1) * rise, 0.55))
      }
      u += 6 + rnd() * 5
    }
  } else if (type === 'cables') {
    const y = 9 + rnd() * 24, n = 4 + Math.floor(rnd() * 3)
    for (let k = 0; k < n; k++) {
      const yy = y + k * 0.9 + rnd() * 0.4, uu = u + (rnd() - 0.5) * 3, sag = 1 + rnd() * 1.5
      segs.push(seg(L, uu, -W, yy, uu, 0, yy - sag, 0.12), seg(L, uu, 0, yy - sag, uu, W, yy, 0.12))
    }
  } else if (type === 'sign') {
    const side = rnd() < 0.5 ? 1 : -1, len = W * (0.75 + rnd() * 0.35), y = 10 + rnd() * 24, h = 2.5 + rnd() * 2
    boxes.push(box(L, u, side * (W - len / 2), y, 0.5, len / 2, h, 'sign'))
    if (rnd() < 0.6) { const y2 = y + (rnd() < 0.5 ? -1 : 1) * (9 + rnd() * 4), len2 = W * (0.7 + rnd() * 0.3); boxes.push(box(L, u + 7, -side * (W - len2 / 2), y2, 0.5, len2 / 2, 2.5, 'sign')) }
  } else if (type === 'crane') {
    const side = rnd() < 0.5 ? 1 : -1, y = 26 + rnd() * 14, len = W * 1.5
    boxes.push(box(L, u, side * (W - len / 2), y, 0.8, len / 2, 0.8, 'arm'))
    const hv = side * (W - len * 0.85)
    segs.push(seg(L, u, hv, y, u, hv, y - 9 - rnd() * 6, 0.15))
    boxes.push(box(L, u, hv, y - 15, 1, 1, 1, 'hook'))
  } else if (type === 'banner') {
    const v = (rnd() - 0.5) * W, y = 18 + rnd() * 14
    boxes.push(box(L, u, 0, y + 6, 0.4, W, 0.4, 'deck'))
    boxes.push(box(L, u, v, y + 2.5, 0.15, 2.4, 3.5, 'banner'))   // 視界をふさがない大きさ
  }
  let cx = 0, cz = 0, n = 0
  for (const b of boxes) { cx += b.cx; cz += b.cz; n++ }
  for (const s of segs) { cx += (s[0] + s[3]) / 2; cz += (s[2] + s[5]) / 2; n++ }
  cx /= n; cz /= n
  let rad = 0
  for (const b of boxes) rad = Math.max(rad, Math.hypot(b.cx - cx, b.cz - cz) + Math.max(b.hw, b.hl))
  for (const s of segs) rad = Math.max(rad, Math.hypot(s[0] - cx, s[2] - cz), Math.hypot(s[3] - cx, s[5] - cz))
  return { kind: 'shape', type, boxes, segs, cx, cz, cy: 20, rad }
}

// モノレールの高架: 通りの真ん中を長く。軌道（箱）と柱
export function makeMonorail(L, a, b, y) {
  const boxes = [], len = Math.abs(b - a), mid = (a + b) / 2
  boxes.push(box(L, mid, 0, y, len / 2, 1.6, 0.9, 'rail'))
  for (let u = Math.min(a, b) + 10; u < Math.max(a, b); u += 32) boxes.push(box(L, u, 0, (y - 0.9) / 2, 0.8, 0.8, (y - 0.9) / 2, 'pillar'))
  const p = P(L, mid, 0)
  return { kind: 'shape', type: 'monorail', boxes, segs: [], cx: p.x, cz: p.z, cy: y, rad: len / 2 + 4 }
}

// 区間に障害物を並べる。mix: 種類の重み。skip: 輪の近く（u の範囲）は空ける
export function fillLane(L, mix, seed, skip = [], gap = [24, 34]) {
  const rnd = rnd0(seed), out = [], types = Object.keys(mix), tot = types.reduce((s, k) => s + mix[k], 0)
  const dir = Math.sign(L.b - L.a) || 1
  for (let u = L.a + dir * 22; dir > 0 ? u < L.b - 8 : u > L.b + 8; u += dir * (gap[0] + rnd() * (gap[1] - gap[0]))) {
    if (skip.some(([s0, s1]) => u > Math.min(s0, s1) && u < Math.max(s0, s1))) continue
    let r = rnd() * tot, type = types[0]
    for (const k of types) { r -= mix[k]; if (r <= 0) { type = k; break } }
    out.push(makeObstacle(type, L, u, rnd))
  }
  return out
}

// 箱（向きなし）と点の距離
export function boxDist(b, x, y, z) {
  const dx = Math.max(0, Math.abs(x - b.cx) - b.hw), dy = Math.max(0, Math.abs(y - b.cy) - b.hh), dz = Math.max(0, Math.abs(z - b.cz) - b.hl)
  return Math.hypot(dx, dy, dz)
}
