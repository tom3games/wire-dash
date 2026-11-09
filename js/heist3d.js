// 仕掛けの見た目（レーザー・鉄球・高圧線・網・ドローン・ヘリのサーチライト・輪・気球・盗んだカツラ）
// 当たり判定は shared/heist.js。ここは同じ hazSegs / netPos から形を置くだけ
// 危ない物は全部「赤く光る」で揃える（ワイヤーは水色、輪は金）
import * as THREE from 'three'
import { Builder } from './geo.js?v=1'
import { hazSegs, netPos, HZ, LINE_H, PYLON_X, PYLON_Z } from '../shared/heist.js?v=1'

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 0, 1)
const RED = 0xff2a3a
// 線分（a から b）を、+z に長さ1の円柱の行列にする
function segMatrix(ax, ay, az, bx, by, bz, r, out) {
  _v.set(ax, ay, az); _w.set(bx - ax, by - ay, bz - az)
  const L = Math.max(0.01, _w.length()); _w.divideScalar(L)
  _q.setFromUnitVectors(_up, _w); _s.set(r, r, L)
  return out.compose(_v, _q, _s)
}
const unitCyl = (seg = 6) => new THREE.CylinderGeometry(1, 1, 1, seg, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5)
function obox(b, cx, cy, cz, hw, hh, hl, col) { b.box(cx, cy, cz, hw, hh, hl, col) }
// 細い棒（任意の向き）を Builder に足す
function rod(b, ax, ay, az, bx, by, bz, t, col) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1
  const ux = dx / L, uy = dy / L, uz = dz / L
  // 垂直に近い向きの横の軸
  let px = -uz, py = 0, pz = ux; if (Math.hypot(px, pz) < 0.2) { px = 1; py = 0; pz = 0 }
  const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px
  const P = (s, u, v) => [ax + dx * s + (px * u + qx * v) * t, ay + dy * s + (py * u + qy * v) * t, az + dz * s + (pz * u + qz * v) * t]
  b.hexa([P(0, -1, -1), P(0, 1, -1), P(0, 1, 1), P(0, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], col)
}

export class HeistView {
  constructor(scene, world, low = false) {
    this.scene = scene; this.low = low; this.world = world
    this.grp = new THREE.Group(); scene.add(this.grp)
    this.dyn = new THREE.Group(); scene.add(this.dyn)
    // レーザーの棒: 芯（白っぽい）と外の光（赤・加算）。全部の棒を2回の描画で
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xff1a2c, fog: false })   // 昼の空でも見えるよう、芯は濃い赤（白く飛ばない）
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xff5060, transparent: true, opacity: 0.35, depthWrite: false, fog: false })
    const N = 24
    this.cores = new THREE.InstancedMesh(unitCyl(6), this.coreMat, N); this.glows = new THREE.InstancedMesh(unitCyl(8), this.glowMat, N)
    for (const m of [this.cores, this.glows]) { m.frustumCulled = false; m.count = 0; m.renderOrder = 3; this.grp.add(m) }
    this.buildStatic(world)
    // ドローン（体と赤い目・光の輪）
    const db = new Builder()
    db.box(0, 0, 0, 0.55, 0.16, 0.55, 0x1c1e22); db.box(0, -0.2, 0, 0.22, 0.12, 0.22, 0x2a2c30)
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { rod(db, 0, 0, 0, sx * 0.85, 0.05, sz * 0.85, 0.05, 0x2a2c30); db.box(sx * 0.85, 0.12, sz * 0.85, 0.36, 0.02, 0.36, 0x484c52) }
    this.droneBody = new THREE.InstancedMesh(db.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), 14)
    this.droneEye = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3040, fog: false }), 14)
    this.droneHalo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.22, depthWrite: false, fog: false }), 14)
    for (const m of [this.droneBody, this.droneEye, this.droneHalo]) { m.frustumCulled = false; m.count = 0; this.grp.add(m) }
    // ヘリ（暗い機体・回る羽・点滅）とサーチライト（円すいの光と地面の輪）
    const hb = new Builder()
    hb.box(0, 0, 0, 1.4, 1.2, 2.6, 0x23262c); hb.box(0, 0.2, 2.2, 1.1, 0.8, 0.6, 0x3a5070); rod(hb, 0, 0.2, -2.4, 0, 0.6, -8, 0.28, 0x23262c); hb.box(0, 1.2, -8, 0.1, 0.9, 0.4, 0x23262c)
    hb.box(0, -1.4, 0, 1.6, 0.06, 0.08, 0x111214); rod(hb, -1, -1.2, 1.2, -1, -1.4, -1.2, 0.06, 0x111214); rod(hb, 1, -1.2, 1.2, 1, -1.4, -1.2, 0.06, 0x111214)
    this.heli = new THREE.Group()
    this.heli.add(new THREE.Mesh(hb.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 })))
    this.rotor = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.05, 20), new THREE.MeshBasicMaterial({ color: 0x0a0b0c, transparent: true, opacity: 0.35, depthWrite: false })); this.rotor.position.y = 1.45; this.heli.add(this.rotor)
    this.heliLamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 4), new THREE.MeshBasicMaterial({ color: RED, fog: false })); this.heliLamp.position.set(0, -1.3, 0); this.heli.add(this.heliLamp)
    this.grp.add(this.heli)
    const cc = document.createElement('canvas'); cc.width = 4; cc.height = 128
    { const x = cc.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,250,225,.65)'); g.addColorStop(1, 'rgba(255,245,210,.06)'); x.fillStyle = g; x.fillRect(0, 0, 4, 128) }
    this.coneMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cc), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    this.cone = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1, 1, 24, 1, true).translate(0, -0.5, 0), this.coneMat); this.grp.add(this.cone)
    this.spotMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), this.spotMat); this.spot.renderOrder = 2; this.grp.add(this.spot)
    // 輪（金）と、次の輪の光の柱
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffb400, fog: false })
    this.ringGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, fog: false })
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 220, 12, 1, true).translate(0, 110, 0), new THREE.MeshBasicMaterial({ color: 0xffc830, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, fog: false }))
    this.grp.add(this.pillar)
    this.rings = []
    this.nets = []; this.balls = []
    this.sparkT = 0
  }

  // 毎回同じ所に立つ物: クレーン2基・運河の鉄塔と高圧線・気球
  buildStatic(world) {
    const M = world.heistMap, b = new Builder(), glow = new Builder()
    const Y = 0xd8a020, Yd = 0xa87810
    for (const C of M.cranes) {
      const w = 1.1
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) obox(b, C.x + sx * w, C.h / 2, C.z + sz * w, 0.12, C.h / 2, 0.12, Y)
      for (let y = 3; y < C.h - 2; y += 3.2) { obox(b, C.x, y, C.z + w, w, 0.07, 0.07, Yd); obox(b, C.x, y, C.z - w, w, 0.07, 0.07, Yd); obox(b, C.x + w, y, C.z, 0.07, 0.07, w, Yd); obox(b, C.x - w, y, C.z, 0.07, 0.07, w, Yd); rod(b, C.x - w, y, C.z + w, C.x + w, y + 3.2, C.z + w, 0.05, Yd); rod(b, C.x + w, y, C.z - w, C.x - w, y + 3.2, C.z - w, 0.05, Yd) }
      // 腕（輪の上へ）と反対側の重り・運転席
      const ex = C.x + C.jx * C.jl, ez = C.z + C.jz * C.jl, ox = C.x - C.jx * 9, oz = C.z - C.jz * 9
      for (const dy of [-1.8, -0.6]) for (const side of [-0.6, 0.6]) rod(b, C.x - C.jz * side, C.h + dy, C.z + C.jx * side, ex - C.jz * side, C.h + dy, ez + C.jx * side, 0.09, Y)
      for (let k = 0; k <= 10; k++) { const f = k / 10, x = C.x + (ex - C.x) * f, z = C.z + (ez - C.z) * f; rod(b, x, C.h - 1.8, z, x, C.h - 0.6, z, 0.06, Yd) }
      rod(b, C.x, C.h - 1.2, C.z, ox, C.h - 1.2, oz, 0.3, Y); obox(b, ox, C.h - 2, oz, 1.4, 1.1, 1.4, 0x55585c)
      obox(b, C.x + C.jx * 1.6, C.h - 3.4, C.z + C.jz * 1.6, 1.1, 1, 1.1, 0x3a4048)
      rod(b, C.x, C.h + 3.5, C.z, ex, C.h - 0.6, ez, 0.05, 0x8a8a8a); rod(b, C.x, C.h + 3.5, C.z, ox, C.h - 1, oz, 0.05, 0x8a8a8a); rod(b, C.x, C.h - 0.4, C.z, C.x, C.h + 3.5, C.z, 0.2, Y)
      glow.box(C.x, C.h + 3.7, C.z, 0.3, 0.3, 0.3, 0xff3020); glow.box(ex, C.h - 0.2, ez, 0.25, 0.25, 0.25, 0xff3020)
    }
    // 鉄塔（4本の脚が上ですぼまる）と腕木
    for (const p of M.pylons) {
      const H = p.h
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(b, p.x + sx * 1.6, 0, p.z + sz * 1.6, p.x + sx * 0.35, H, p.z + sz * 0.35, 0.09, 0x6a6e74)
      for (let y = 4; y < H; y += 4) { const k = 1.6 - (1.25 * y / H); rod(b, p.x - k, y, p.z - k, p.x + k, y + 4, p.z + k, 0.05, 0x5a5e64); rod(b, p.x + k, y, p.z - k, p.x - k, y + 4, p.z + k, 0.05, 0x5a5e64) }
      for (const hy of LINE_H) obox(b, p.x, hy + 0.3, p.z, 1.6, 0.08, 0.12, 0x5a5e64)
      glow.box(p.x, H + 0.2, p.z, 0.25, 0.25, 0.25, 0xff3020)
    }
    // 運河のゲート（鉄骨の梁と2本の脚）: 黄色と黒のしま
    for (const g of M.gantry || []) {
      for (const s of [-1, 1]) { obox(b, g.x + s * g.hw, (g.y - 8) / 2, g.z, 0.7, (g.y + 8) / 2, 0.7, 0xd8a020); glow.box(g.x + s * g.hw, g.y + 0.4, g.z, 0.3, 0.3, 0.3, 0xff3020) }
      for (let k = 0; k < 16; k++) { const x0 = g.x - g.hw + k * (g.hw * 2 / 16); obox(b, x0 + g.hw / 16, g.y - 0.8, g.z, g.hw / 16, 0.8, 0.7, k % 2 ? 0x1c1c20 : 0xf2c230) }
      for (let k = 0; k <= 16; k++) { const x0 = g.x - g.hw + k * (g.hw * 2 / 16); rod(b, x0, g.y - 1.6, g.z - 0.7, x0 + (k % 2 ? 1 : -1) * 1.5, g.y, g.z + 0.7, 0.06, 0x8a8a8a) }
    }
    // 防犯カメラの柱（掛け点）: 細い柱・腕・カメラと赤い点
    for (const q of M.camPoles || []) {
      const y0 = q.y || 0
      obox(b, q.x, y0 + q.h / 2, q.z, 0.18, q.h / 2, 0.18, 0x3a3e46)
      rod(b, q.x, y0 + q.h - 0.6, q.z, q.x + 1.4, y0 + q.h - 0.9, q.z, 0.06, 0x3a3e46)
      obox(b, q.x + 1.6, y0 + q.h - 1.2, q.z, 0.35, 0.22, 0.22, 0xd8dade)
      glow.box(q.x + 1.95, y0 + q.h - 1.2, q.z, 0.06, 0.06, 0.06, 0xff3020)
    }
    // 高圧線（岸に沿って4段。たるみ付き）: 黒い線と赤い光
    const lineB = new Builder()
    for (const z of PYLON_Z) for (let i = 0; i < PYLON_X.length - 1; i++) for (const hy of LINE_H) {
      const ax = PYLON_X[i], bx = PYLON_X[i + 1], mx = (ax + bx) / 2
      rod(lineB, ax, hy, z, mx, hy - 1.1, z, 0.06, 0x1a1a1e); rod(lineB, mx, hy - 1.1, z, bx, hy, z, 0.06, 0x1a1a1e)
      rod(glow, ax, hy, z, mx, hy - 1.1, z, 0.07, 0xff2030); rod(glow, mx, hy - 1.1, z, bx, hy, z, 0.07, 0xff2030)
    }
    const lm = new THREE.Mesh(lineB.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })); lm.userData.keepColor = true; this.grp.add(lm)
    const lg = new Builder()
    for (const z of PYLON_Z) for (let i = 0; i < PYLON_X.length - 1; i++) for (const hy of LINE_H) {
      const ax = PYLON_X[i], bx = PYLON_X[i + 1], mx = (ax + bx) / 2
      rod(lg, ax, hy, z, mx, hy - 1.1, z, 0.26, 0xff2a3a); rod(lg, mx, hy - 1.1, z, bx, hy, z, 0.26, 0xff2a3a)
    }
    this.lineHalo = new THREE.Mesh(lg.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, fog: false }))
    this.lineHalo.userData.keepColor = true; this.grp.add(this.lineHalo)
    // 線を走る火花（点の粒）
    const n = 60, g = new THREE.BufferGeometry(); this.sparkPos = new Float32Array(n * 3); this.sparkLane = []
    for (let i = 0; i < n; i++) this.sparkLane.push({ z: PYLON_Z[i % 2], h: LINE_H[(i >> 1) % LINE_H.length], u: Math.random(), v: 0.08 + Math.random() * 0.12 })
    g.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3))
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd0a0, size: 0.6, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    this.sparks.frustumCulled = false; this.grp.add(this.sparks)
    // 気球（赤と白の縞の球・かご・綱・火）とかごの下の垂れ幕
    const G = M.goal
    const eg = new THREE.SphereGeometry(8.5, 24, 16); eg.scale(1, 1.15, 1)
    const col = [], pos = eg.attributes.position
    // 中の火で下から照らされている（下ほど明るい）
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = Math.floor((a + Math.PI) / (Math.PI * 2) * 12) % 2; col.push(...(k ? [0.92, 0.2, 0.18] : [0.98, 0.95, 0.88])) }
    eg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    this.balloon = new THREE.Group(); this.balloon.position.set(G.x, 0, G.z)
    const env = new THREE.Mesh(eg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })); env.position.y = G.y + 11; env.userData.keepColor = true
    this.balloon.add(env)
    const bk = new Builder(); bk.box(0, G.y - 0.6, 0, 1.4, 0.7, 1.4, 0x6a4a2a, 0, { top: 0x3a2814 })
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) rod(bk, sx * 1.3, G.y + 0.1, sz * 1.3, sx * 4.2, G.y + 5, sz * 4.2, 0.03, 0x2a2420)
    bk.box(0, G.y + 1.6, 0, 0.35, 0.3, 0.35, 0x3a3a3e)
    const basket = new THREE.Mesh(bk.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })); basket.userData.keepColor = true; this.balloon.add(basket)
    this.flame = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false })); this.flame.position.y = G.y + 2.3; this.balloon.add(this.flame)
    this.flameLight = new THREE.PointLight(0xffa050, 30, 30, 2); this.flameLight.position.y = G.y + 3; this.balloon.add(this.flameLight)
    const tc = document.createElement('canvas'); tc.width = 512; tc.height = 96
    { const x = tc.getContext('2d'); x.fillStyle = '#f4ecd8'; x.fillRect(0, 0, 512, 96); x.fillStyle = '#8a1a1a'; x.font = '900 54px "Hiragino Mincho ProN","Yu Mincho",serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GOAL', 256, 50) }
    const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: tt, side: THREE.DoubleSide })); banner.position.set(0, G.y - 2.2, 1.5); this.balloon.add(banner)
    this.grp.add(this.balloon)
    const sm = new THREE.Mesh(b.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.35 })); sm.castShadow = !this.low; sm.userData.keepColor = true; this.grp.add(sm)
    const gm = new THREE.Mesh(glow.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })); gm.userData.keepColor = true; this.grp.add(gm)
    this.blinkMat = gm.material
  }

  // 新しい回の仕掛け（網・鉄球・輪）を作り直す
  build(H) {
    for (const o of [...this.dyn.children]) { this.dyn.remove(o); o.traverse(q => { if (q.geometry) q.geometry.dispose() }) }
    this.nets = []; this.balls = []; this.rings = []
    this.balloon.position.y = 0   // 前の回で気球ごと上がっていった分を戻す
    const netCore = new THREE.MeshBasicMaterial({ color: 0xff1a2c, fog: false })
    const netSheet = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, fog: false })
    // 通りの障害物（ワイヤーが掛からない物）: 赤と白のしまの鋼材で、ビルの外壁と見分けがつくように。全部で1回の描画
    const ob = new Builder(), ol = new Builder()
    const stripe = (b, n) => { const L = Math.max(b.hw, b.hl), along = b.hw >= b.hl ? 'x' : 'z', k = Math.max(1, Math.round(L * 2 / 2.4)); for (let i = 0; i < k; i++) { const f = -L + (i + 0.5) * (2 * L / k), cx = along === 'x' ? b.cx + f : b.cx, cz = along === 'z' ? b.cz + f : b.cz; ob.box(cx, b.cy, cz, along === 'x' ? L / k : b.hw, b.hh, along === 'z' ? L / k : b.hl, (i + n) % 2 ? 0xf4f2ee : 0xe8262e) } }
    for (const h of H.haz) {
      if (h.kind !== 'shape') continue
      h.boxes.forEach((b, i) => {
        if (b.tag === 'pillar') ob.box(b.cx, b.cy, b.cz, b.hw, b.hh, b.hl, 0x9a9ea6)
        else if (b.tag === 'banner') { for (let k = 0; k < 6; k++) ob.box(b.cx, b.cy - b.hh + (k + 0.5) * b.hh / 3, b.cz, b.hw, b.hh / 6, b.hl, k % 2 ? 0xf4f2ee : 0xe8262e) }
        else stripe(b, i)
        // 端の赤い灯（遠くからでも見える）
        ol.box(b.cx + (b.hw > b.hl ? b.hw : 0), b.cy + b.hh, b.cz + (b.hl >= b.hw ? b.hl : 0), 0.35, 0.35, 0.35, 0xff2030)
        ol.box(b.cx - (b.hw > b.hl ? b.hw : 0), b.cy + b.hh, b.cz - (b.hl >= b.hw ? b.hl : 0), 0.35, 0.35, 0.35, 0xff2030)
      })
      for (const sg of h.segs) rod(ob, sg[0], sg[1], sg[2], sg[3], sg[4], sg[5], sg[6], sg[6] > 0.3 ? 0xe8262e : 0xd8202a)
    }
    if (!ob.empty) { const m = new THREE.Mesh(ob.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2, emissive: 0x401010, emissiveIntensity: 0.4 })); m.castShadow = !this.low; m.userData.keepColor = true; this.dyn.add(m) }
    if (!ol.empty) { const m = new THREE.Mesh(ol.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })); m.userData.keepColor = true; this.dyn.add(m) }
    for (const h of H.haz) {
      if (h.kind === 'net') {
        // 網: 縦横の細い光の線（ローカル: x=通りの幅, y=高さ）と、うっすら赤い面
        const nb = new Builder(), W = h.w, T = h.top
        for (let x = -W; x <= W + 0.01; x += W / 4) nb.box(x, T / 2, 0, 0.09, T / 2, 0.09, 0xffffff)
        for (let y = 0.6; y <= T + 0.01; y += T / 8) nb.box(0, y, 0, W, 0.09, 0.09, 0xffffff)
        nb.box(0, T, 0, W, 0.12, 0.12, 0xffffff)
        const g = new THREE.Group()
        const lines = new THREE.Mesh(nb.geometry(), netCore); lines.renderOrder = 3; g.add(lines)
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, T).translate(0, T / 2, 0), netSheet); g.add(sheet)
        if (h.axis === 'z') g.rotation.y = 0; else g.rotation.y = Math.PI / 2
        this.dyn.add(g); this.nets.push({ h, g })
      } else if (h.kind === 'ball') {
        const g = new THREE.Group()
        const iron = new THREE.Mesh(new THREE.SphereGeometry(h.R, 20, 14), new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.45, metalness: 0.85 }))
        iron.castShadow = !this.low; g.add(iron)
        const band = new THREE.Mesh(new THREE.TorusGeometry(h.R * 1.005, 0.16, 6, 28), new THREE.MeshBasicMaterial({ color: 0xff3040, fog: false })); band.rotation.x = Math.PI / 2; g.add(band)
        const band2 = band.clone(); band2.rotation.set(0, 0, 0); g.add(band2)
        const halo = new THREE.Mesh(new THREE.SphereGeometry(h.R * 1.3, 14, 10), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.16, depthWrite: false, fog: false })); g.add(halo)
        const chain = new THREE.Mesh(unitCyl(5), new THREE.MeshStandardMaterial({ color: 0x9a9ea8, roughness: 0.4, metalness: 0.6, emissive: 0x2a2c30 }))
        this.dyn.add(g); this.dyn.add(chain); this.balls.push({ h, g, chain, spin: 0 })
      }
    }
    // 輪: 金の輪と外側の光。次の輪だけ光の柱を立てる
    for (const C of H.cps) {
      const g = new THREE.Group(); g.position.set(C.x, C.y, C.z); g.rotation.y = Math.atan2(C.nx, C.nz)
      g.add(new THREE.Mesh(new THREE.TorusGeometry(C.r || HZ.ringR, 0.28, 8, 48), this.ringMat))
      g.add(new THREE.Mesh(new THREE.TorusGeometry(C.r || HZ.ringR, 0.9, 8, 48), this.ringGlowMat))
      // 真下の地面・川面に輪の影（どの高さでくぐるか、離す所の手がかり）
      const W = this.world, gy = Math.max(W.groundAt(C.x, C.z, C.y).h, W.water ? W.water.y : -99) + 0.08
      const sh = new THREE.Mesh(new THREE.RingGeometry(HZ.ringR - 0.6, HZ.ringR + 0.3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.55, depthWrite: false }))
      sh.position.set(C.x, gy, C.z); sh.scale.set(1, 1, 0.35); sh.rotation.y = Math.atan2(C.nx, C.nz); sh.renderOrder = 2
      this.dyn.add(sh); g.userData.shadow = sh
      this.dyn.add(g); this.rings.push({ C, g, pop: 0 })
    }
  }

  update(H, dt, now, camPos) {
    if (!H) return
    const t = H.t
    // レーザーの棒（回転・上下）
    let n = 0
    const seg = []
    for (const h of H.haz) {
      if (h.kind !== 'rotor' && h.kind !== 'shutter') continue
      if (Math.abs(h.cx - camPos.x) > 260 || Math.abs(h.cz - camPos.z) > 260) continue
      hazSegs(h, t, seg)
      for (const s of seg) {
        if (n >= this.cores.instanceMatrix.count) break
        this.cores.setMatrixAt(n, segMatrix(s[0], s[1], s[2], s[3], s[4], s[5], 0.14, _m))
        this.glows.setMatrixAt(n, segMatrix(s[0], s[1], s[2], s[3], s[4], s[5], s[6] * 1.6 + 0.1, _m)); n++
      }
    }
    this.cores.count = this.glows.count = n
    this.cores.instanceMatrix.needsUpdate = this.glows.instanceMatrix.needsUpdate = true
    this.glowMat.opacity = 0.3 + 0.1 * Math.sin(now * 11)
    // 網
    for (const N of this.nets) {
      const { p } = netPos(N.h, t)
      if (N.h.axis === 'x') N.g.position.set(p, 0, N.h.c); else N.g.position.set(N.h.c, 0, p)
    }
    // 鉄球と鎖
    for (const B of this.balls) {
      hazSegs(B.h, t, seg)
      const c = seg[0], ball = seg[1]
      B.g.position.set(ball[0], ball[1], ball[2]); B.g.rotation.z = Math.sin(t * 1.3) * 0.2
      B.chain.matrixAutoUpdate = false; segMatrix(c[0], c[1], c[2], ball[0], ball[1] + B.h.R * 0.9, ball[2], 0.16, B.chain.matrix); B.chain.matrixWorldNeedsUpdate = true
    }
    // 高圧線の火花
    for (let i = 0; i < this.sparkLane.length; i++) {
      const L = this.sparkLane[i]; L.u += L.v * dt; if (L.u > 1) L.u -= 1
      const x0 = PYLON_X[0], x1 = PYLON_X[PYLON_X.length - 1], x = x0 + (x1 - x0) * L.u
      const span = (x1 - x0) / (PYLON_X.length - 1), f = ((x - x0) % span) / span
      this.sparkPos[i * 3] = x; this.sparkPos[i * 3 + 1] = L.h - 1.1 * Math.sin(Math.PI * f) + 0.05; this.sparkPos[i * 3 + 2] = L.z
    }
    this.sparks.geometry.attributes.position.needsUpdate = true
    this.lineHalo.material.opacity = 0.5 + 0.2 * Math.sin(now * 6)   // 脈打つ赤（ふつうの電線と見分ける）
    // ドローン
    let k = 0
    for (const d of H.drones) {
      if (k >= 14) break
      _v.set(d.x, d.y, d.z); _q.setFromAxisAngle(_s.set(0, 1, 0), Math.atan2(d.vx, d.vz)); _w.set(1, 1, 1)
      this.droneBody.setMatrixAt(k, _m.compose(_v, _q, _w))
      _v.set(d.x + Math.sin(Math.atan2(d.vx, d.vz)) * 0.45, d.y - 0.05, d.z + Math.cos(Math.atan2(d.vx, d.vz)) * 0.45); this.droneEye.setMatrixAt(k, _m.compose(_v, _q, _w))
      const hs = d.mode === 'chase' ? 1.5 + 0.25 * Math.sin(now * 14 + d.id) : 1.1
      _v.set(d.x, d.y, d.z); _w.set(hs, hs, hs); this.droneHalo.setMatrixAt(k, _m.compose(_v, _q, _w)); k++
    }
    this.droneBody.count = this.droneEye.count = this.droneHalo.count = k
    for (const m of [this.droneBody, this.droneEye, this.droneHalo]) m.instanceMatrix.needsUpdate = true
    // ヘリとサーチライト
    const L = H.light
    this.heli.visible = this.cone.visible = this.spot.visible = !H.noLight
    if (!H.noLight) {
      this.heli.position.set(L.hx, L.hy, L.hz); this.heli.rotation.y = L.ang + Math.PI; this.rotor.rotation.y = now * 30
      this.heliLamp.visible = Math.sin(now * 6) > 0.4
      const gy = (L.gy || 0) + 0.15
      const dx = L.x - L.hx, dy = gy - L.hy, dz = L.z - L.hz, len = Math.hypot(dx, dy, dz)
      this.cone.position.set(L.hx, L.hy - 1.2, L.hz); this.cone.scale.set(HZ.lightR, len, HZ.lightR)
      _v.set(dx, dy, dz).normalize(); this.cone.quaternion.setFromUnitVectors(_s.set(0, -1, 0), _v)
      this.spot.position.set(L.x, gy, L.z); this.spot.scale.setScalar(HZ.lightR)
      const on = L.on ? 1 : 0.15, hot = Math.min(1, L.meter)
      this.coneMat.opacity = 0.32 * on; this.spotMat.opacity = (0.26 + hot * 0.25) * on
      this.spotMat.color.setRGB(1, 0.95 - hot * 0.6, 0.8 - hot * 0.65); this.coneMat.color.setRGB(1, 1 - hot * 0.5, 1 - hot * 0.6)
    }
    // 輪（くぐった輪は縮んで消える）と光の柱
    for (const R of this.rings) {
      const cur = H.cps[H.cp] === R.C
      if (R.C.passed) { R.pop += dt * 3; R.g.scale.setScalar(Math.max(0.001, 1 + R.pop * 0.6)); R.g.children[0].material = this.ringMat; R.g.visible = R.pop < 0.5 }
      if (R.g.userData.shadow) R.g.userData.shadow.visible = !R.C.passed
      else { const k = H.cps.indexOf(R.C) - H.cp; R.g.visible = k <= 1; const s = cur ? 1.1 + 0.05 * Math.sin(now * 5) : 0.7; R.g.scale.setScalar(s) }   // 次の輪だけ大きく、その次は小さく、先は隠す
    }
    const T = H.cps[H.cp] || H.goal || H.cps[H.cps.length - 1]
    this.pillar.visible = !H.over
    this.pillar.position.set(T.x, T === H.goal ? T.y + 18 : T.y + HZ.ringR, T.z)
    this.ringGlowMat.opacity = 0.3 + 0.12 * Math.sin(now * 4)
    // 気球の火と航空灯の点滅
    this.flame.scale.setScalar(0.8 + 0.3 * Math.sin(now * 17) * Math.sin(now * 5))
    this.flameLight.intensity = 22 + 10 * Math.sin(now * 13)
    this.blinkMat.color.setScalar(Math.sin(now * 3) > -0.2 ? 1 : 0.25)
  }
}

// 自己ベストのゴースト: 前の自分の軌跡を半透明の水色の人形で飛ばす（タイムアタックの相手）
export class GhostView {
  constructor(scene) {
    const m = new THREE.MeshBasicMaterial({ color: 0x18c8e0, transparent: true, opacity: 0.5, depthWrite: false })
    this.grp = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 4, 10), m); body.position.y = 0.95
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), m); head.position.y = 1.85
    this.grp.add(body, head); this.grp.visible = false; scene.add(this.grp)
    const n = 40, g = new THREE.BufferGeometry(); this.trail = new Float32Array(n * 3)
    g.setAttribute('position', new THREE.BufferAttribute(this.trail, 3))
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x18c8e0, transparent: true, opacity: 0.6 })); this.line.frustumCulled = false; this.line.visible = false; scene.add(this.line)
    this.n = n
  }
  // path: [x,y,z, x,y,z, ...]（1/20秒ごと）。t 秒の位置に置く
  update(path, t) {
    const on = !!(path && path.length >= 6)
    this.grp.visible = this.line.visible = on
    if (!on) return
    const N = path.length / 3, f = Math.min(N - 1, t * 20), i = Math.floor(f), k = f - i, j = Math.min(N - 1, i + 1)
    const P = a => [path[a * 3], path[a * 3 + 1], path[a * 3 + 2]]
    const A = P(i), B = P(j)
    this.grp.position.set(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k)
    this.grp.rotation.y = Math.atan2(B[0] - A[0], B[2] - A[2])
    for (let q = 0; q < this.n; q++) { const c = P(Math.max(0, i - q)); this.trail[q * 3] = c[0]; this.trail[q * 3 + 1] = c[1] + 1; this.trail[q * 3 + 2] = c[2] }
    this.line.geometry.attributes.position.needsUpdate = true
  }
}
