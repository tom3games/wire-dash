// ワイヤーダッシュ（wire-dash）。空中出前（sky-delivery）・廃都迎撃（ufo-demae v4）の街とワイヤーで、昼の街の障害物コースを飛ぶタイムアタック
// 赤く光る物（レーザー・鉄球・高圧線・網・ドローン）に触れたらミス（+3秒）。金の輪を順にくぐってゴール。コース4本・メダル・自己ベストのゴースト
// 2026-11-09 怪盗（wig-heist）の作り直し。本人「カツラを盗む必要はない。アクションがそもそも楽しい」「ステージが暗い」
import * as THREE from 'three'
import { GAME } from '../shared/config.js?v=1'
import { createWorld } from '../shared/track.js?v=1'
import { buildScene } from './scene.js?v=1'
import { FX } from './fx.js?v=1'
import { setAniso, lazyStart } from './look.js?v=1'
import { Q, LOW } from './quality.js?v=1'
import { RunnerModel } from './runnermodel.js?v=1'
import { CharRunnerModel, loadCharAssets, charAssets } from './charmodel.js?v=1'
import { createRunner, stepRunner, findAnchor, rayHit, floorAt, canKick, RUN } from '../shared/runner.js?v=1'
import { createStreet, buildPoles } from '../shared/street.js?v=1'
import { addTown, clearShopFront } from '../shared/town.js?v=1'
import { buildPoles3d, buildHouses3d, trafficPool } from './street3d.js?v=1'
import { carLights } from './carmodel.js?v=1'
import { createHeist, stepHeist, summary, addHeistMap, target, medalOf, BASE, HZ, PTS, COURSES, MEDAL } from '../shared/heist.js?v=1'
import { createBot, botInput } from '../shared/heistbot.js?v=1'
import { HeistView, GhostView } from './heist3d.js?v=1'
import { drawTicket } from './ticket.js?v=1'
import { makeSky, PALETTE } from './day.js?v=1'
import { facadeTime } from './facade.js?v=1'

const $ = id => document.getElementById(id)
window.__bootSet && window.__bootSet(0.35)
const STEP = GAME.step
const URL_ = 'https://tom3games.com/play/wire-dash/'
const store = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} } }
const pick = a => a[Math.floor(Math.random() * a.length)]
const man = v => Math.round(v).toLocaleString()

// ---------------------------------------------------------------- 文言（日英）
const T = {
  ja: {
    logo: 'ワイヤーダッシュ', logoSub: '障害物をよけて、輪をくぐれ', pick: 'コースを選ぶ', how: '遊び方', lang: 'EN', more: 'ほかのゲーム', muteOn: '音あり', muteOff: '音なし', loading: 'コースを準備中',
    howTitle: '遊び方', ok: 'わかった',
    howItems: [
      '右下の<b>大ボタン</b>で前のビルにワイヤー、もう一度で離す。左のスティックで向き。ビルをタップするとそこに掛かる',
      '金の<b>輪</b>を順にくぐってゴールまでの<b>タイム</b>を競う。輪の中の赤い光はすき間を抜ける',
      '赤く光る物に触れたら<b>ミス</b>（+3秒）。振り子の下を過ぎて<b>振り上がり始め</b>で離すと、遠く速く跳べる',
      '<b>紙一重</b>・離してすぐ次へ<b>急旋回</b>・壁に当たった瞬間に<b>壁蹴り</b>・空中で地面をタップして<b>急降下</b>でスコア。メダルはタイム・ノーミス・紙一重'
    ],
    keysPc: 'PC: WASD・矢印で向き　クリックでワイヤー（空中で地面をクリックで急降下）　E・Space は前へ自動　ドラッグで見回す',
    credit: '音: Kenney, rubberduck, artisticdude, poinl, ezwa, SpliceSound ほか（CC0・Public domain）。詳しくは CREDITS.md',
    courses: [
      { name: '広場から工事現場', sub: '回転レーザーと鉄球' },
      { name: 'ビルの谷と運河', sub: '上下するレーザーと高圧線' },
      { name: '南の空とドローン', sub: '追ってくるドローン' },
      { name: '全部つなぐ', sub: 'スタートから気球まで' }
    ],
    locked: '前のコースをゴールすると開く', best: 'ベスト', noBest: '未走行',
    scoreL: 'スコア', missL: n => `ミス ${n}`, ringL: (n, of) => `輪 ${n}/${of}`, goalL: 'ゴール', chainL: n => `${n}連続`,
    tooFar: '届かない', kickL: '蹴る', pause: '中断', paused: '一時停止', resume: '続ける', quit: 'やめる', retry: 'やり直す',
    coach: 'コーチ',
    tips: {
      start: '金の輪をくぐれ。赤く光る物は触るとミスだ', swing: '振り上がり始めで離せ。遠くへ跳べる', kick: '壁にぶつかった瞬間にボタン。壁を蹴れる',
      drone: 'ドローンはビルの角で振れば、ぶつかる', canal: '高圧線は上を越えて、空中で地面をタップ。急降下だ', ring: '次の輪はあの光の柱だ', ghost: '水色は前のベストの自分だ。抜け'
    },
    pop: { nice: 'ナイスリリース', turn: '急旋回', kick: '壁蹴り', dive: '急降下', crash: 'ドローン激突', shake: '振り切った', near: '紙一重', tight: '極・紙一重', ring: '輪' },
    hitL: n => `ミス +3秒`, finish: 'ゴール', timeout: '時間切れ', newBest: '自己ベスト',
    again: 'もう一回', next: '次のコースへ', save: '画像を保存', post: 'Xでポスト', toTitle: 'コースを選ぶ',
    ticket: {
      head: 'ワイヤーダッシュ 計測記録', course: n => `コース${n}`, time: 'タイム', best: 'ベスト', misses: 'ミス', penalty: n => `（+${n}秒）`, score: 'スコア',
      medals: ['タイム', 'ノーミス', '紙一重'], gold: '金', silver: '銀', bronze: '銅', none: 'なし', timeout: '時間切れ', quit: '途中でやめた',
      st: ['紙一重', 'ナイスリリース', '急旋回', '壁蹴り', '急降下', 'ドローン激突', '最高倍率'], newBest: '自己ベスト更新', footer: 'tom3games.com/play/wire-dash'
    },
    postText: (c, t, m) => `ワイヤーダッシュ コース${c} ${t}${m ? '（' + m + 'メダル）' : ''}`
  },
  en: {
    logo: 'WIRE DASH', logoSub: 'Swing through the rings, dodge the red', pick: 'Choose a course', how: 'How to play', lang: 'JP', more: 'More games', muteOn: 'Sound on', muteOff: 'Muted', loading: 'Setting up the course',
    howTitle: 'HOW TO PLAY', ok: 'Got it',
    howItems: [
      'The <b>big button</b> fires a wire at the building ahead; press again to let go. Left stick steers. Tap a building to hook it',
      'Fly through the gold <b>rings</b> in order and race the <b>clock</b>. Slip through the gaps in the red light inside each ring',
      'Touching anything red is a <b>miss</b> (+3 s). Let go just as the swing <b>starts to rise</b> to fly farther and faster',
      '<b>Close calls</b>, quick <b>re-hook turns</b>, <b>wall kicks</b> and <b>dives</b> (tap the ground mid-air) earn score. Medals: time, no miss, close calls'
    ],
    keysPc: 'PC: WASD / arrows steer · click to wire (click the ground mid-air to dive) · E / Space hooks ahead · drag to look',
    credit: 'Sounds: Kenney, rubberduck, artisticdude, poinl, ezwa, SpliceSound and others (CC0 / public domain). See CREDITS.md',
    courses: [
      { name: 'Plaza to the site', sub: 'Laser fan and wrecking balls' },
      { name: 'Tower gap and canal', sub: 'Laser bars and power lines' },
      { name: 'South sky and drones', sub: 'Drones give chase' },
      { name: 'The whole run', sub: 'Start to the balloon' }
    ],
    locked: 'Finish the previous course to unlock', best: 'Best', noBest: 'Not run yet',
    scoreL: 'SCORE', missL: n => `Miss ${n}`, ringL: (n, of) => `Ring ${n}/${of}`, goalL: 'Goal', chainL: n => `${n} chain`,
    tooFar: 'Too far', kickL: 'KICK', pause: 'Pause', paused: 'Paused', resume: 'Resume', quit: 'Quit', retry: 'Restart',
    coach: 'COACH',
    tips: {
      start: 'Fly through the gold rings. Touching red is a miss', swing: 'Let go as the swing starts to rise. You fly farther', kick: 'Hit the button the moment you hit a wall. Wall kick',
      drone: 'Swing round a corner and the drones crash', canal: 'Clear the power lines from above, then tap the ground to dive', ring: 'The next ring is under that light', ghost: 'The cyan one is your best run. Beat it'
    },
    pop: { nice: 'NICE RELEASE', turn: 'HARD TURN', kick: 'WALL KICK', dive: 'DIVE', crash: 'DRONE CRASH', shake: 'SHOOK IT', near: 'CLOSE CALL', tight: 'RAZOR CLOSE', ring: 'RING' },
    hitL: n => `MISS +3s`, finish: 'FINISH', timeout: 'TIME UP', newBest: 'NEW BEST',
    again: 'Again', next: 'Next course', save: 'Save image', post: 'Post on X', toTitle: 'Courses',
    ticket: {
      head: 'WIRE DASH  TIMING RECORD', course: n => `COURSE ${n}`, time: 'TIME', best: 'BEST', misses: 'MISSES', penalty: n => ` (+${n}s)`, score: 'SCORE',
      medals: ['Time', 'No miss', 'Close calls'], gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE', none: '-', timeout: 'TIME UP', quit: 'QUIT',
      st: ['Close calls', 'Nice releases', 'Hard turns', 'Wall kicks', 'Dives', 'Drone crashes', 'Best mult'], newBest: 'NEW PERSONAL BEST', footer: 'tom3games.com/play/wire-dash'
    },
    postText: (c, t, m) => `WIRE DASH course ${c} ${t}${m ? ' (' + m + ' medal)' : ''}`
  }
}

let lang = store.get('wd.lang') || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en')
const t = k => T[lang][k]
const touchMode = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
document.body.classList.toggle('is-touch', touchMode)
function applyLang() {
  document.documentElement.lang = lang
  for (const el of document.querySelectorAll('[data-t]')) { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v }
  $('howList').innerHTML = t('howItems').map((s, i) => `<li data-n="${i + 1}"><span>${s}</span></li>`).join('')
  $('howKeys').textContent = touchMode ? '' : t('keysPc')
  $('btnMute').textContent = Snd.muted ? t('muteOff') : t('muteOn')
  drawCourses()
}
// コースの札（道路の案内標識のような青い板。番号・名前・ベスト・メダル）
const bestOf = c => { try { return JSON.parse(store.get('wd.best.' + c) || 'null') } catch (e) { return null } }
const unlocked = c => c === 1 || !!bestOf(c - 1)
function medalSvg(kind, on) { const col = { gold: '#f2c230', silver: '#c9d1da', bronze: '#d08a4a' }[kind] || '#f2c230'; return `<svg viewBox="0 0 20 20" class="md${on ? ' on' : ''}"><circle cx="10" cy="10" r="8" fill="${on ? col : 'none'}" stroke="${on ? '#0d2a4a' : 'rgba(255,255,255,.5)'}" stroke-width="1.6"/></svg>` }
function drawCourses() {
  const el = $('courses'); if (!el) return
  el.innerHTML = COURSES.map((c, i) => {
    const C = t('courses')[i], b = bestOf(c.id), ok = unlocked(c.id)
    const m = b ? b.m : null
    return `<button class="plate${ok ? '' : ' locked'}" data-c="${c.id}" ${ok ? '' : 'disabled'}><b class="pn">${c.id}</b><span class="pt"><b>${C.name}</b><small>${ok ? C.sub : t('locked')}</small></span><span class="pb">${b ? `<i>${fmt(b.time)}</i><span class="mds">${medalSvg(m.time, !!m.time)}${medalSvg('gold', m.nomiss)}${medalSvg('gold', m.near)}</span>` : `<i class="nb">${ok ? t('noBest') : ''}</i>`}</span></button>`
  }).join('')
  for (const b of el.querySelectorAll('.plate')) b.onclick = () => startHeist(+b.dataset.c)
}
const fmt = s => { const m = Math.floor(s / 60), r = s - m * 60; return (m ? m + ':' + String(Math.floor(r)).padStart(2, '0') : String(Math.floor(r))) + '.' + String(Math.floor((r % 1) * 100)).padStart(2, '0') }

// ---------------------------------------------------------------- 音（録音素材だけ）
Snd.muted = store.get('wd.mute') === '1'
Snd.def({
  wire: ['snd/swish-1.mp3', 'snd/swish-2.mp3', 'snd/swish-3.mp3'], hook: ['snd/metalClick.mp3', 'snd/metal_02.mp3'], whoosh: 'snd/swish-5.mp3',
  land: ['snd/footstep_01.mp3', 'snd/footstep_02.mp3'], bonk: ['snd/thwack-01.mp3', 'snd/thwack-03.mp3'], clang: ['snd/clang_1.mp3', 'snd/clang_2.mp3'],
  zap: 'snd/zap.mp3', spark: ['snd/spark.mp3', 'snd/spark2.mp3'], siren: 'snd/siren.mp3', whistle: 'snd/whistle.mp3', drone: 'snd/drone_1.mp3', dpop: 'snd/drone_pop.mp3',
  glass: 'snd/glass_breaking_01.mp3', grunt: ['snd/grunt_01.mp3', 'snd/grunt_02.mp3', 'snd/grunt_03.mp3', 'snd/grunt_04.mp3'], ring: 'snd/ring.mp3',
  click: 'snd/click_001.mp3', tick: 'snd/tick_002.mp3', radio: ['snd/radio_1.mp3', 'snd/radio_2.mp3'], jWin: 'snd/jWin.mp3', jMid: 'snd/jMid.mp3', jLose: 'snd/jLose.mp3'
})
const sfx = (n, o) => Snd.play(n, o)
const sfxAt = (n, x, z, o = {}) => { const p = me || (demo && demo.r); const d = p ? Math.hypot(x - p.x, z - p.z) : 0, k = Math.max(0, 1 - d / 120); if (k > 0.05) sfx(n, { ...o, vol: (o.vol || 1) * (0.25 + 0.75 * k) }) }

// ---------------------------------------------------------------- 描画の土台
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance', preserveDrawingBuffer: true })
renderer.setPixelRatio(Q.pixelRatio)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
setAniso(renderer)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
$('view').appendChild(renderer.domElement)
const scene = new THREE.Scene()
const FOG_D = 0.0022
scene.fog = new THREE.FogExp2(PALETTE.fog.getHex(), FOG_D)
// 昼の太陽（少し傾いた午後）と、空の青・地面の照り返し
const sun = new THREE.DirectionalLight(PALETTE.sun.getHex(), 2.8)
sun.userData.dir = new THREE.Vector3(0.4, 0.78, -0.48).normalize()
sun.castShadow = true
sun.shadow.mapSize.set(Q.shadow, Q.shadow)
Object.assign(sun.shadow.camera, { left: -Q.shadowRange, right: Q.shadowRange, top: Q.shadowRange, bottom: -Q.shadowRange, near: 1, far: 400 })
sun.shadow.normalBias = 0.04; sun.shadow.bias = -0.0004
scene.add(sun, sun.target)
const hemi = new THREE.HemisphereLight(PALETTE.hemiSky.getHex(), PALETTE.hemiGround.getHex(), 1.35)
scene.add(hemi)
const sky = makeSky(renderer, scene, sun.userData.dir)
const camera = new THREE.PerspectiveCamera(64, 1, 0.3, 2400)
const world = createWorld('city')
clearShopFront(world, BASE)
const built = buildScene(scene, world)
for (const g of built.gates) g.grp.visible = false
const fx = new FX(scene, world)
const town = addTown(world, BASE)
addHeistMap(world)
const poles3d = buildPoles3d(scene, buildPoles(world, BASE))
const houses3d = buildHouses3d(scene, town)
const carsDraw = trafficPool(scene, LOW)
// 昼: 街灯と家の窓は消えている
poles3d.bulbMat.emissiveIntensity = 0; houses3d.winMat.emissiveIntensity = 0; carLights(0)
let street = createStreet(world, 1)
const view = new HeistView(scene, world, LOW), ghostView = new GhostView(scene)
// ワイヤー: 明るい水色の芯＋外側の淡い光（ufo-demae v4 と同じ。危ない物の赤と別の色）
const ropeMat = new THREE.MeshBasicMaterial({ color: 0xd8fbff, fog: false })
const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), ropeMat)
const ropeGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
ropeMesh.add(ropeGlow); ropeMesh.renderOrder = 4; ropeGlow.renderOrder = 4
ropeMesh.visible = false; scene.add(ropeMesh)
const aimMark = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: 0.9, depthTest: false }))
aimMark.renderOrder = 5; aimMark.visible = false; scene.add(aimMark)

// ---------------------------------------------------------------- 状態
let mode = 'title'
let me = null, H = null, model = null, demo = null
let paused = false, dbgPause = false, endAt = 0, photo = null, photoScore = -1, photoWhy = 'none', photoGap = 0, quitEnd = false
let course = 1, ghost = null, trace = []
let hitStop = 0, fovKick = 0, flashA = 0, redA = 0, goldA = 0, slowT = 0
let tut = false, tutSeen = {}
const cam = { hd: Math.PI / 2, pitch: 0.15, userT: -1e9, pos: new THREE.Vector3(), off: new THREE.Vector3(-6, 3, 0), look: new THREE.Vector3(), lookOff: new THREE.Vector3(), fov: 64 }
const _v = new THREE.Vector3(), _w = new THREE.Vector3()
function spawnRunner(id, H_) { return createRunner({ id, spawn: (H_ || H).start }) }
function newModel() { if (model) { scene.remove(model.group); model.dispose() } model = charAssets.ready ? new CharRunnerModel() : new RunnerModel(); scene.add(model.group); if (model.okamochi) model.okamochi.visible = false; return model }

// ---------------------------------------------------------------- 入力
const keys = new Set()
let pendingWire = null
addEventListener('keydown', e => {
  if (mode !== 'play') return
  if (e.repeat) return
  keys.add(e.code)
  if (e.code === 'KeyE' || e.code === 'Space') { pressButton(); e.preventDefault() }
  if (e.code === 'Escape' || e.code === 'KeyP') setPause(!paused)
})
addEventListener('keyup', e => keys.delete(e.code))
const gest = new Map()
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', e => {
  Snd.init()
  if (mode !== 'play' || paused) return
  gest.set(e.pointerId, { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false })
})
addEventListener('pointermove', e => {
  const g = gest.get(e.pointerId); if (!g) return
  const dx = e.clientX - g.lx, dy = e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY
  if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) g.moved = true
  if (!g.moved) return
  cam.hd -= dx * 0.00792; cam.pitch = Math.max(-0.9, Math.min(1, cam.pitch + dy * 0.00528)); cam.userT = performance.now()
})
addEventListener('pointerup', e => {
  const g = gest.get(e.pointerId); if (!g) return
  gest.delete(e.pointerId)
  if (!g.moved && performance.now() - g.t < 450 && mode === 'play' && !paused) aimAt(e.clientX, e.clientY)
})
addEventListener('pointercancel', e => gest.delete(e.pointerId))
// 大ボタン（E・Space）: 壁に当たった直後か張り付いている時は壁蹴り、ワイヤー中なら離す、それ以外は前の上へ自動で掛ける
function pressButton() { if (!me || mode !== 'play' || paused) return; pendingWire = canKick(me) ? { kick: true } : { at: null, key: true } }
// 画面のタップ: 建物・地面のワイヤー。ワイヤー中なら外す
function aimAt(cx, cy) {
  const rc = renderer.domElement.getBoundingClientRect()
  ndc.set((cx - rc.left) / rc.width * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const o = ray.ray.origin, d = ray.ray.direction
  if (me && me.rope) { pendingWire = { at: null, sx: cx, sy: cy }; return }
  const minT = me ? Math.max(0, (me.x - o.x) * d.x + (me.y + 1 - o.y) * d.y + (me.z - o.z) * d.z - 1) : 0
  const b = rayHit(world, o.x, o.y, o.z, d.x, d.y, d.z, 400, minT)
  const tb = b ? Math.hypot(b.x - o.x, b.y - o.y, b.z - o.z) : Infinity
  let at = b
  if (me && !me.grounded && !me.climbing) {
    const g = groundRay(o, d, RUN.wireRange + 60)
    if (g && !(tb < g.t + 6)) at = { x: g.x, y: g.y, z: g.z, ground: true }
  }
  pendingWire = { at, sx: cx, sy: cy }
}
function groundRay(o, d, maxT) {
  const below = t => { const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; return y <= floorAt(world, x, z, y).h }
  for (let t = 1; t < maxT; t += 1) {
    if (!below(t)) continue
    let a = t - 1, b2 = t
    for (let i = 0; i < 6; i++) { const m = (a + b2) / 2; if (below(m)) b2 = m; else a = m }
    const x = o.x + d.x * b2, z = o.z + d.z * b2
    return { x, y: floorAt(world, x, z, o.y + d.y * b2 + 0.5).h, z, t: b2 }
  }
  return null
}
const stick = { x: 0, y: 0, id: null }
{
  const el = $('stick'), knob = el.querySelector('.knob')
  const ctr = () => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 } }
  const upd = e => {
    const c = ctr()
    let dx = (e.clientX - c.x) / c.R, dy = (e.clientY - c.y) / c.R
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l }
    stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * 36}px,${dy * 36}px)`
  }
  const grab = e => { stick.id = e.pointerId; el.classList.add('held'); upd(e) }
  el.addEventListener('pointerdown', e => { Snd.init(); if (stick.id != null) return; e.preventDefault(); e.stopPropagation(); grab(e) })
  addEventListener('pointermove', e => {
    if (e.pointerId === stick.id) { upd(e); return }
    if (stick.id == null && gest.has(e.pointerId)) { const c = ctr(); if (Math.hypot(e.clientX - c.x, e.clientY - c.y) < c.R) { gest.delete(e.pointerId); grab(e) } }
  }, true)
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; el.classList.remove('held') }
  addEventListener('pointerup', end, true); addEventListener('pointercancel', end, true)
  window.__stickCenter = () => ctr()
  for (const b of document.querySelectorAll('.tbtn')) b.addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); if (b.dataset.k === 'wire') pressButton() })
}
function screenBasis() { const e = camera.matrixWorld.elements; let rx = e[0], rz = e[2], fx = -e[8], fz = -e[10]; const a = Math.hypot(rx, rz) || 1, b = Math.hypot(fx, fz) || 1; return { r: { x: rx / a, z: rz / a }, f: { x: fx / b, z: fz / b } } }
function gather() {
  let thr = 0, brk = 0, steer = 0, wallY = null, wallX = null
  if (keys.has('KeyW') || keys.has('ArrowUp')) thr = 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) brk = 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1
  const B = screenBasis(), SR = B.r, SF = B.f
  let moveDir = null
  if (stick.id != null) {
    const mag = Math.min(1, Math.hypot(stick.x, stick.y))
    if (mag > 0.15) {
      const dx = SR.x * stick.x - SF.x * stick.y, dz = SR.z * stick.x - SF.z * stick.y, l = Math.hypot(dx, dz) || 1
      moveDir = { x: dx / l, z: dz / l }; steer = 0; thr = Math.max(thr, Math.min(1, mag * 1.3))
    }
    if (me.climbing) {
      const cl = me.climbing, sideSign = SR.x * cl.nz - SR.z * cl.nx >= 0 ? 1 : -1
      wallY = Math.abs(stick.y) > 0.25 ? -stick.y : 0; wallX = Math.abs(stick.x) > 0.25 ? stick.x * sideSign : 0
    }
  }
  const inp = { throttle: thr, brake: brk, steer, jump: false, wire: false, wallY, wallX, moveDir }
  inp.wireYaw = moveDir ? Math.atan2(moveDir.x, moveDir.z) : touchMode ? Math.atan2(SF.x, SF.z) : undefined
  if (pendingWire) {
    inp.wire = true
    if (pendingWire.at) inp.wireAt = pendingWire.at
    else if (pendingWire.key && !me.rope) { const a = findAnchor(world, me, Math.atan2(SF.x, SF.z)); if (a) inp.wireAt = { ...a, auto: true } }
    me._tap = pendingWire; pendingWire = null
  }
  return inp
}

// ---------------------------------------------------------------- 画面の切り替え
function show(id) { for (const s of ['title', 'how', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id); $('hud').classList.toggle('hidden', mode !== 'play') }
function newDemo() { const s = Math.floor(Math.random() * 1000); H = createHeist(world, s, { course: 4 }); demo = { r: spawnRunner('demo'), b: createBot('average', s) }; view.build(H) }
function toTitle() {
  mode = 'title'; paused = false; me = null; ghost = null
  newDemo(); newModel(); drawCourses()
  show('title'); $('touch').classList.add('hidden')
  Snd.loop('amb', 'snd/city.wav', 0.26); Snd.loop('wind', null); Snd.loop('heli', null); Snd.loop('buzz', null); Snd.loop('bgm', null)
}
function startHeist(c = course, seed = Math.floor(Math.random() * 1e6)) {
  Snd.init(); sfx('click')
  if (window.TM) TM.start()
  course = c
  tut = store.get('wd.tut') !== '1'; tutSeen = {}
  mode = 'play'; paused = false; demo = null; photo = null; photoScore = -1; photoWhy = 'none'; endAt = 0; quitEnd = false
  H = createHeist(world, seed, { tut, course: c }); me = spawnRunner('me'); street = createStreet(world, seed)
  const b = bestOf(c); ghost = b && b.path ? b.path : null; trace = []
  view.build(H)
  log.length = 0
  newModel()
  cam.hd = H.start.yaw; cam.pitch = 0.12; cam.userT = -1e9
  show(null); $('touch').classList.toggle('hidden', !touchMode)
  Snd.loop('amb', 'snd/city.wav', 0.2); Snd.loop('wind', 'snd/wind_loop.wav', 0.0001); Snd.loop('heli', null); Snd.loop('buzz', 'snd/buzz.mp3', 0.0001); Snd.loop('bgm', 'snd/bgm.mp3', 0.2)
  hint('start', 'coach', 3)
  if (ghost) setTimeout(() => hint('ghost', 'coach', 2.6), 3400)
}
function setPause(p) { if (mode !== 'play') return; paused = p; $('pause').classList.toggle('hidden', !p) }

// ---------------------------------------------------------------- 画面の文字（同時に1つ。話し手は 相棒 か 市長）
let sayT = 0, sayPri = 0
function say(who, text, sec = 2.4, pri = 0) {
  if (sayT > 0.4 && pri < sayPri) return
  const el = $('say'); el.className = 'say ' + who; el.innerHTML = `<small>${t(who)}</small>${text}`; sayT = Math.max(sec, 0.9 + text.length * 0.09); sayPri = pri
}
let bannerT = 0
function banner(b, cls = '') { $('bannerB').textContent = b; const el = $('banner'); el.className = 'banner ' + cls; void el.offsetWidth; el.classList.add('pop'); bannerT = 2.2 }
let nearT = 0
function pop(txt, sub = '', cls = '') { const el = $('near'); $('nearTxt').textContent = txt; $('nearN').textContent = sub; el.className = 'near ' + cls; void el.offsetWidth; el.classList.add('pop'); nearT = 0.9 }
function hint(k, who = 'coach', sec = 3) { if (!tut || tutSeen[k] || mode !== 'play') return; tutSeen[k] = true; say(who, t('tips')[k], sec, 2) }
function updateHud(dt) {
  const S = H.stats
  const sc = S.score; if ($('bVal')._v !== sc) { $('bVal')._v = sc; $('bVal').textContent = man(sc); const b = $('bounty'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump') }
  const ch = $('bChain'), key = H.chain + ':' + H.mult
  if (ch._k !== key) { ch._k = key; $('bMult').textContent = 'x' + H.mult; $('bChainN').textContent = H.chain ? t('chainL')(H.chain) : ''; ch.classList.toggle('hot', H.mult >= 2); ch.classList.toggle('on', H.chain > 0) }
  // 計測板: タイム（ミスの秒を足した値）・ベストとの差・ミス
  const tm = fmt(H.t + H.penalty); if ($('clock')._v !== tm) { $('clock')._v = tm; $('clock').textContent = tm }
  const b = bestOf(course), dl = b && b.split && b.split[H.cp - 1] != null && H.cp > 0 ? H.ringT - b.split[H.cp - 1] : null
  const ds = dl == null ? '' : (dl <= 0 ? '-' : '+') + Math.abs(dl).toFixed(2); if ($('delta')._v !== ds) { $('delta')._v = ds; $('delta').textContent = ds; $('delta').className = 'delta' + (dl == null ? '' : dl <= 0 ? ' ahead' : ' behind') }
  const ms = t('missL')(H.misses); if ($('miss2')._v !== ms) { $('miss2')._v = ms; $('miss2').textContent = ms; $('miss2').classList.toggle('on', H.misses > 0) }
  // 次の目標の方角
  const T0 = target(H), d = Math.hypot(T0.x - me.x, T0.z - me.z)
  const dd = Math.round(d) + 'm'; if ($('arrowD')._v !== dd) { $('arrowD')._v = dd; $('arrowD').textContent = dd }
  $('arrow').querySelector('svg').style.transform = `rotate(${compassAng(T0.x, T0.z).toFixed(3)}rad)`
  const of = H.cps.length + (H.goal ? 1 : 0), rl = H.cp < H.cps.length ? t('ringL')(H.cp + 1, of) : t('goalL'); if ($('arrowN')._v !== rl) { $('arrowN')._v = rl; $('arrowN').textContent = rl }
  if (sayT > 0) { sayT -= dt; $('say').classList.toggle('hidden', sayT <= 0) }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.add('hidden') }
  if (nearT > 0) { nearT -= dt; if (nearT <= 0) $('near').classList.add('hidden') }
}
function compassAng(gx, gz) {
  camera.updateMatrixWorld()
  const e = camera.matrixWorld.elements, fx = -e[8], fz = -e[10], rx = -fz, rz = fx
  const dx = gx - me.x, dz = gz - me.z
  return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz)
}
// 点の数字が当たった所から浮く
const floats = []
function floatPts(x, y, z, txt, cls = '') {
  if (floats.length > 8) { const o = floats.shift(); o.el.remove() }
  const el = document.createElement('div'); el.className = 'fpts ' + cls; el.textContent = txt; $('tags').appendChild(el)
  floats.push({ el, x, y, z, t: 0 })
}
function updateFloats(dt) {
  const W = innerWidth, Hh = innerHeight
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt
    if (f.t > 0.9) { f.el.remove(); floats.splice(i, 1); continue }
    _v.set(f.x, f.y + f.t * 3, f.z).project(camera)
    if (_v.z > 1) { f.el.style.opacity = '0'; continue }
    f.el.style.opacity = String(Math.min(1, (0.9 - f.t) * 3))
    f.el.style.transform = `translate(${((_v.x + 1) / 2 * W).toFixed(0)}px,${((1 - _v.y) / 2 * Hh).toFixed(0)}px) translate(-50%,-50%)`
  }
}

// ---------------------------------------------------------------- 出来事
const log = []
function onRunnerEvent(e) {
  log.push({ src: 'r', ...e, at: H ? +H.t.toFixed(2) : 0 })
  if (e.t === 'wire') { sfx('wire', { vol: 0.7 }); sfx('hook', { vol: 0.5, delay: 0.06 }); if (tut && !tutSeen.swing && H.t > 4) setTimeout(() => hint('swing'), 900) }
  else if (e.t === 'wireMiss') {
    sfx('wire', { vol: 0.4, rate: 1.3 })
    const tp = me._tap
    if (e.far && tp && tp.sx != null) { const el = $('miss'); el.style.left = tp.sx + 'px'; el.style.top = tp.sy + 'px'; el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 800) }
  }
  else if (e.t === 'land') { sfx('land', { vol: Math.min(1, 0.3 + e.impact / 20) }); if (e.impact > 14) { sfx('bonk', { vol: 0.5 }); fx.addShake(Math.min(0.6, e.impact / 40)) } }
  else if (e.t === 'bonk') { sfx('bonk', { vol: 0.8 }); fx.addShake(0.4); if (tut) setTimeout(() => hint('kick'), 200) }
  else if (e.t === 'unwire' && !e.auto) { const v = Math.hypot(me.vx, me.vy, me.vz); if (v > 16 || e.nice != null) { sfx('whoosh', { vol: Math.min(0.9, v / 45), rate: 0.9 + Math.random() * 0.2 }); fovKick = Math.min(7, Math.max(0, (v - 14) * 0.3) + (e.nice != null ? 3 : 0)) } }
  else if (e.t === 'wallkick') { sfx('bonk', { vol: 0.7, rate: 1.3 }); sfx('whoosh', { vol: 0.7 }); fx.addShake(0.3); fovKick = 5; fx.dust(e.x, e.y + 1, e.z, 10) }
  else if (e.t === 'car') { sfx('bonk', { vol: 1, rate: 0.8 }); fx.addShake(0.7) }
}
function onHeistEvent(e) {
  log.push({ src: 'h', ...e, at: +H.t.toFixed(2) })
  if (mode !== 'play') return
  const u = ''
  if (e.t === 'tech') {
    pop(t('pop')[e.kind] || '', '+' + man(e.pts) + u, e.kind)
    floatPts(e.x, e.y + 0.5, e.z, '+' + man(e.pts), H.mult >= 2 ? 'hot' : '')
    if (e.kind === 'nice') { sfx('whoosh', { vol: 0.9, rate: 0.8 }); flashA = Math.max(flashA, 0.35) }
    else if (e.kind === 'turn') { sfx('wire', { vol: 0.8, rate: 0.85 }); flashA = Math.max(flashA, 0.25) }
    else if (e.kind === 'kick') { flashA = Math.max(flashA, 0.3) }
    else if (e.kind === 'dive') { sfx('whoosh', { vol: 0.8, rate: 0.7 }); fovKick = 8 }
    else if (e.kind === 'crash') { sfxAt('clang', e.x, e.z, { vol: 1 }); sfxAt('dpop', e.x, e.z, { vol: 0.9 }); sfxAt('glass', e.x, e.z, { vol: 0.5, delay: 0.1 }); fx.sparks(e.x, e.y, e.z, 26, null, 11); fx.flash(e.x, e.y, e.z); hitStop = 0.05 }
    else if (e.kind === 'shake') { sfx('whoosh', { vol: 0.8 }) }
  }
  else if (e.t === 'near') {
    flashA = Math.max(flashA, e.tight ? 0.7 : 0.45); fovKick = -5; slowT = e.tight ? 0.22 : 0.12
    sfx('whoosh', { vol: 0.9, rate: 0.85 }); sfx('spark', { vol: 0.35, rate: 1.5 })
    pop(t('pop')[e.tight ? 'tight' : 'near'], '+' + man(e.pts) + u, e.tight ? 'tight' : 'near')
    floatPts(e.x, e.y, e.z, '+' + man(e.pts), 'hot')
    const sc = (e.tight ? 300 : 120) + e.v * 2 - e.gap * 40; if (sc > photoScore) { photoScore = sc; photoWhy = 'near'; photoGap = e.gap; snapNext = 2 }
  }
  else if (e.t === 'ring') {
    sfx('ring', { vol: 0.8 }); sfx('jMid', { vol: 0.35, delay: 0.1 }); goldA = 0.8; fovKick = 6
    banner(t('pop').ring + ' ' + e.n + '/' + e.of, 'gold')
    floatPts(e.x, e.y + 2, e.z, '+' + man(e.pts), 'gold')
    H.ringT = H.t + H.penalty; H.splits = H.splits || []; H.splits.push(H.ringT)
    if (e.n === 1 && tut) { store.set('wd.tut', '1'); setTimeout(() => hint('ring'), 1500) }
    if (H.cps[H.cp] && H.cps[H.cp].name === 'canal') setTimeout(() => hint('canal'), 1600)
  }
  else if (e.t === 'hit') {
    redA = 1; hitStop = 0.1; fx.addShake(1.1); sfx('zap', { vol: 0.9 }); sfx('spark', { vol: 0.8 }); sfx('grunt', { vol: 0.9 }); sfx('whistle', { vol: 0.45, delay: 0.15 })
    fx.sparks(e.x, e.y, e.z, 30, null, 12); fx.smoke(e.x, e.y, e.z, { size: 1.6, life: 1, dark: 0.3 })
    pop(t('hitL')(e.n), '', 'hit'); Snd.duck(0.4, 1.4)
    if (photoWhy === 'none' && 200 > photoScore) { photoScore = 200; photoWhy = 'hit'; snapNext = 2 }
  }
  else if (e.t === 'goal') { banner(t('finish'), 'gold'); sfx('jWin', { vol: 0.9 }); goldA = 1; if (photoWhy === 'none') { photoWhy = 'goal'; snapNext = 6 } Snd.loop('bgm', null) }
  else if (e.t === 'timeout') { banner(t('timeout'), 'red'); sfx('jLose', { vol: 0.7 }); Snd.loop('bgm', null) }
  else if (e.t === 'droneSee' && tut) { hint('drone') }
  else if (e.t === 'droneSee') { sfxAt('drone', e.x, e.z, { vol: 0.7 }) }
  else if (e.t === 'droneCrash' && !e.mine) { sfxAt('dpop', e.x, e.z, { vol: 0.6 }); fx.sparks(e.x, e.y, e.z, 12, null, 8) }
  else if (e.t === 'multUp') { sfx('hook', { vol: 0.6, rate: 1.3 }); multPulse = 1 }
  else if (e.t === 'end') { endAt = 2.2 }
}
let snapNext = 0, multPulse = 0

// ---------------------------------------------------------------- 結果
function showResult() {
  if (mode !== 'play') return
  mode = 'result'
  Snd.loop('wind', null); Snd.loop('buzz', null); Snd.loop('bgm', null)
  if (!photo || snapNext > 0) { snapNext = 0; renderer.render(scene, camera); const c2 = document.createElement('canvas'); c2.width = 640; c2.height = Math.round(640 * innerHeight / innerWidth); c2.getContext('2d').drawImage(renderer.domElement, 0, 0, c2.width, c2.height); photo = c2 }
  const s = summary(H), K = t('ticket'), ja = lang === 'ja'
  const end = quitEnd ? 'quit' : H.end || 'quit'
  const m = medalOf(course, { ...s, end })
  // 自己ベスト（タイムが速い時だけ。ゴーストの軌跡と輪ごとの時刻も残す）
  const old = bestOf(course)
  let nb = false
  if (end === 'clear' && (!old || s.time < old.time)) {
    nb = true
    const om = old ? old.m : { time: null, nomiss: false, near: false }
    const keep = { time: m.time === 'gold' || om.time === 'gold' ? 'gold' : m.time === 'silver' || om.time === 'silver' ? 'silver' : 'bronze', nomiss: m.nomiss || om.nomiss, near: m.near || om.near }
    store.set('wd.best.' + course, JSON.stringify({ time: +s.time.toFixed(2), m: keep, split: H.splits || [], path: trace.length < 60000 ? trace : null }))
  } else if (end === 'clear' && old) {
    // タイムは更新しなくても、取ったメダルは残す
    old.m = { time: ['gold', 'silver', 'bronze'].find(k => k === m.time || k === old.m.time) || old.m.time, nomiss: old.m.nomiss || m.nomiss, near: old.m.near || m.near }
    store.set('wd.best.' + course, JSON.stringify(old))
  }
  const best = bestOf(course)
  const d = {
    head: K.head, course: K.course(course), name: t('courses')[course - 1].name, end, endL: end === 'timeout' ? K.timeout : end === 'quit' ? K.quit : '',
    time: end === 'clear' ? fmt(s.time) : '--', penalty: s.penalty ? K.penalty(s.penalty) : '', best: best ? fmt(best.time) : '--', newBest: nb ? K.newBest : '',
    misses: s.misses, missesL: K.misses, timeL: K.time, bestL: K.best, scoreL: K.score, score: man(s.score),
    medals: [[K.medals[0], m.time, m.time ? K[m.time] : K.none], [K.medals[1], m.nomiss ? 'gold' : null, m.nomiss ? 'OK' : '-'], [K.medals[2], m.near ? 'gold' : null, `${s.near}/${MEDAL[course].near}`]],
    stats: [[K.st[0], s.near], [K.st[1], s.nice || 0], [K.st[2], s.turn || 0], [K.st[3], s.kick || 0], [K.st[4], s.dive || 0], [K.st[5], s.crash || 0], [K.st[6], 'x' + s.bestMult]],
    goldT: MEDAL[course].gold, silverT: MEDAL[course].silver, photo, footer: K.footer, ja
  }
  drawTicket($('slip'), d)
  sfx('tick', { vol: 0.5 })
  const ml = m.time ? (ja ? { gold: '金', silver: '銀', bronze: '銅' } : { gold: 'gold', silver: 'silver', bronze: 'bronze' })[m.time] : ''
  $('btnPost').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t('postText')(course, end === 'clear' ? fmt(s.time) : (ja ? '時間切れ' : 'time up'), ml)) + '&url=' + encodeURIComponent(URL_) + '&hashtags=' + encodeURIComponent(ja ? 'ワイヤーダッシュ' : 'WireDash')
  $('btnNext').classList.toggle('hidden', !(course < 4 && unlocked(course + 1)))
  $('touch').classList.add('hidden')
  for (const f of floats) f.el.remove(); floats.length = 0
  show('result')
  window.__lastScore = s.score; window.__lastSummary = { ...s, end, medal: m, newBest: nb }
  if (window.TM) TM.end(s.score, end === 'clear')
}
$('btnPost').addEventListener('click', () => { if (window.TM) TM.share('x') })
$('btnSave').onclick = () => { if (window.TM) TM.share('save'); $('slip').toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'wire-dash-record.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }) }
$('btnAgain').onclick = () => startHeist(course)
$('btnNext').onclick = () => startHeist(course + 1)
$('btnRetry').onclick = () => { setPause(false); startHeist(course) }
$('btnTitle').onclick = () => toTitle()
$('btnHow').onclick = () => { Snd.init(); show('how') }
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => show('title')
$('btnLang').onclick = () => { lang = lang === 'ja' ? 'en' : 'ja'; store.set('wd.lang', lang); applyLang() }
$('btnMute').onclick = () => { Snd.init(); Snd.setMute(!Snd.muted); store.set('wd.mute', Snd.muted ? '1' : '0'); applyLang() }
$('btnPause').onclick = () => setPause(true)
$('btnResume').onclick = () => setPause(false)
$('btnQuit').onclick = () => { setPause(false); toTitle() }

// ---------------------------------------------------------------- カメラ
const lerpAngle = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k }
function updateCamera(dt, c) {
  if (window.__freeze) return
  const pos = model.group.position
  const v = Math.hypot(c.vx, c.vz)
  let hx = Math.sin(c.yaw), hz = Math.cos(c.yaw)
  if (v > 8) { const k = c.grounded ? 0.25 : 0.45; hx = hx * (1 - k) + (c.vx / v) * k; hz = hz * (1 - k) + (c.vz / v) * k; const l = Math.hypot(hx, hz); hx /= l; hz /= l }
  const manual = touchMode || performance.now() - cam.userT < 1800
  const out = H && H.over && mode === 'play'
  if (!manual && !out) { cam.hd = lerpAngle(cam.hd, Math.atan2(hx, hz), 1 - Math.exp(-dt * (touchMode ? 2.2 : 5))); cam.pitch += (0.08 - cam.pitch) * (1 - Math.exp(-dt * 1.5)) }
  if (out) cam.hd += dt * 0.4   // 終わりの場面: ゆっくり回り込む
  hx = Math.sin(cam.hd); hz = Math.cos(cam.hd)
  let back = 6.2 + Math.min(2.4, v * 0.07), up = 2.9   // 少し高く引いて、自分の頭で輪が隠れないように
  if (camera.aspect < 1) { back += 0.8; up += 0.5 }
  if (out) { back += 5 + Math.min(6, H.endT * 2); up += 1 }
  up += cam.pitch * 4.2; back *= 1 - Math.max(0, cam.pitch) * 0.15
  let tx = pos.x - hx * back, tz = pos.z - hz * back, ty = pos.y + up
  for (let i = 1; i <= 6; i++) {
    const f = i / 6, px = pos.x + (tx - pos.x) * f, pz = pos.z + (tz - pos.z) * f, py = pos.y + (ty - pos.y) * f
    let hit = false
    for (const o of world.nearby(px, pz)) {
      if (o.slab || o.kind === 'bound' || o.y0 == null || py < o.y0 || py > o.y1) continue
      const cs = Math.cos(o.yaw || 0), sn = Math.sin(o.yaw || 0), dx = px - o.cx, dz = pz - o.cz
      if (Math.abs(dx * cs - dz * sn) < o.hw + 0.4 && Math.abs(dx * sn + dz * cs) < o.hl + 0.4) { hit = true; break }
    }
    if (hit) { const ff = Math.max(0.25, (i - 1) / 6); tx = pos.x + (tx - pos.x) * ff; tz = pos.z + (tz - pos.z) * ff; ty = pos.y + up * 0.8 + (1 - ff) * 2; break }
  }
  const gy = world.groundAt(tx, tz, ty).h + 0.8
  if (ty < gy) ty = gy
  cam.off.lerp(_v.set(tx - pos.x, ty - pos.y, tz - pos.z), 1 - Math.exp(-dt * (out ? 2 : 10)))
  cam.pos.set(pos.x + cam.off.x, pos.y + cam.off.y, pos.z + cam.off.z)
  cam.lookOff.lerp(_v.set(hx * 10, (camera.aspect < 1 ? 3.4 : 2.6) + 1.3 - cam.pitch * 1.6 + Math.max(0, -cam.pitch) * 12, hz * 10), 1 - Math.exp(-dt * 12))
  if (out) cam.lookOff.set(0, 1.5, 0)
  cam.look.set(pos.x + cam.lookOff.x, pos.y + cam.lookOff.y, pos.z + cam.lookOff.z)
  camera.position.copy(cam.pos)
  const sh_ = fx.shake
  if (sh_ > 0) camera.position.add(_v.set((Math.random() - 0.5) * sh_, (Math.random() - 0.5) * sh_ * 0.7, (Math.random() - 0.5) * sh_))
  camera.lookAt(cam.look)
  const asp = camera.aspect
  const base = asp >= 1 ? 60 : Math.min(84, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37)) / asp) * 180 / Math.PI)
  const fov = base + Math.min(18, Math.max(0, Math.hypot(c.vx, c.vy, c.vz) - 6) * 0.5)
  cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4))
  fovKick *= Math.exp(-dt * 6)
  camera.fov = cam.fov + fovKick; camera.updateProjectionMatrix()
  const me_ = camera.matrixWorld.elements, rl = Math.hypot(me_[0], me_[2]) || 1, lat = (c.vx * me_[0] + c.vz * me_[2]) / rl
  cam.bank = (cam.bank || 0) + (Math.max(-0.1, Math.min(0.1, (c.rope ? lat : 0) * -0.004)) - (cam.bank || 0)) * (1 - Math.exp(-dt * 3))
  camera.rotateZ(cam.bank)
}

// ---------------------------------------------------------------- ループ
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fx.setScale && fx.setScale(h) }
addEventListener('resize', resize); resize()
let last = performance.now(), acc = 0, frameN = 0
function stepOnce() {
  if (mode === 'play' && !paused && me && !H.over) {
    const inp = gather()
    me.events.length = 0
    stepRunner(me, inp, STEP, world)
    street.update(STEP, me); street.collide(me)
    stepHeist(H, me, STEP)
    if (Math.round(H.t * 60) % 3 === 0) trace.push(+me.x.toFixed(1), +me.y.toFixed(1), +me.z.toFixed(1))   // 1/20秒ごとの軌跡（ゴースト用）
    for (const e of me.events) onRunnerEvent(e)
    for (const e of H.events) onHeistEvent(e)
    H.events.length = 0
  } else if (mode === 'title' && demo) {
    const inp = botInput(demo.b, demo.r, H, world, STEP)
    demo.r.events.length = 0
    stepRunner(demo.r, inp, STEP, world); street.update(STEP, demo.r); street.collide(demo.r)
    stepHeist(H, demo.r, STEP)
    H.events.length = 0
    if (H.over || H.t > 80) newDemo()
  } else if (mode === 'play' && H && H.over) {
    stepHeist(H, me, STEP)
    me.vx *= 0.9; me.vz *= 0.9; me.events.length = 0; stepRunner(me, { throttle: 0, steer: 0 }, STEP, world)
  }
}
function frame() {
  requestAnimationFrame(frame)
  const now = performance.now()
  let dt = Math.min(0.1, (now - last) / 1000); last = now
  if (hitStop > 0) { hitStop -= dt; acc = 0 }
  else if (!dbgPause) { if (slowT > 0) slowT -= dt; acc += dt * (slowT > 0 ? 0.35 : 1); let n = 0; while (acc >= STEP && n < 6) { stepOnce(); acc -= STEP; n++ } if (n >= 6) acc = 0 }
  else dt = 0
  render(dt || 0.016)
}
const spd = $('speedfx'), sctx = spd.getContext('2d'), hf = $('hitflash'), rf = $('redflash'), gf = $('goldflash')
const lines = Array.from({ length: 46 }, () => ({ a: Math.random() * Math.PI * 2, p: Math.random(), s: 0.6 + Math.random() * 0.8, w: 1 + Math.random() * 2 }))
let spdOn = false
function drawSpeed(v, dt) {
  if (!window.__holdFx) { flashA = Math.max(0, flashA - dt * 5); redA = Math.max(0, redA - dt * 2.2); goldA = Math.max(0, goldA - dt * 2.5) }
  hf.style.opacity = flashA.toFixed(2); rf.style.opacity = redA.toFixed(2); gf.style.opacity = goldA.toFixed(2)
  const k = Math.max(0, Math.min(1, (v - 20) / 18))
  window.__speedK = k
  if (k <= 0) { if (spdOn) { sctx.clearRect(0, 0, spd.width, spd.height); spdOn = false } return }
  spdOn = true
  const W = innerWidth, Hh = innerHeight, dpr = Math.min(2, devicePixelRatio || 1)
  if (spd.width !== Math.round(W * dpr) || spd.height !== Math.round(Hh * dpr)) { spd.width = Math.round(W * dpr); spd.height = Math.round(Hh * dpr) }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, W, Hh)
  const cx = W / 2, cy = Hh * 0.45, Rr = Math.hypot(W, Hh) * 0.55
  sctx.lineCap = 'round'
  const n = Math.round(lines.length * (0.35 + 0.65 * k))
  for (let i = 0; i < n; i++) {
    const L = lines[i]
    L.p += dt * L.s * (1.6 + k * 2.4); if (L.p > 1) { L.p -= 1; L.a = Math.random() * Math.PI * 2 }
    const r1 = Rr * (1.05 - L.p * 0.45), r0 = r1 - Rr * (0.12 + 0.2 * k) * L.s
    const ca = Math.cos(L.a), sa = Math.sin(L.a)
    sctx.strokeStyle = `rgba(220,236,255,${(0.1 + 0.3 * k) * Math.min(1, L.p * 4)})`; sctx.lineWidth = L.w
    sctx.beginPath(); sctx.moveTo(cx + ca * r0, cy + sa * r0); sctx.lineTo(cx + ca * r1, cy + sa * r1); sctx.stroke()
  }
}
function render(dt) {
  const c = mode === 'title' ? demo && demo.r : me
  const now = performance.now() / 1000
  facadeTime.value = now
  if (c && model) {
    model.update(c, dt)
    if (c.rope) {
      const h = model.handWorld
      ropeMesh.visible = true
      ropeMesh.position.copy(h); ropeMesh.lookAt(c.rope.x, c.rope.y, c.rope.z); ropeMesh.scale.set(1, 1, Math.max(0.1, h.distanceTo(_v.set(c.rope.x, c.rope.y, c.rope.z)))); ropeGlow.material.opacity = 0.28 + 0.1 * Math.sin(now * 14)
    } else ropeMesh.visible = false
    ghostView.update(mode === 'play' && H ? ghost : null, H ? H.t : 0)
    updateCamera(dt, c)
    const d = sun.userData.dir; sun.position.set(c.x + d.x * 150, c.y + d.y * 150, c.z + d.z * 150); sun.target.position.set(c.x, c.y, c.z)
  }
  if (H) view.update(H, dt, now, camera.position)
  // ボタンで掛かる所の印（ワイヤーを持っていない時）・壁蹴りできる時はボタンに「蹴る」
  aimMark.visible = false
  if (mode === 'play' && me && !me.rope && frameN % 4 === 0) { const SF = screenBasis().f; aimMark.userData.p = findAnchor(world, me, Math.atan2(SF.x, SF.z)) }
  if (mode === 'play' && me && !me.rope && aimMark.userData.p) { const p = aimMark.userData.p; aimMark.visible = true; aimMark.position.set(p.x, p.y, p.z); aimMark.lookAt(camera.position); aimMark.scale.setScalar(Math.max(1, camera.position.distanceTo(aimMark.position) * 0.04)) }
  const wb = document.querySelector('.tbtn[data-k=wire]')
  if (wb && mode === 'play' && me) { const k = canKick(me) ? 'k' : me.rope ? 'r' : aimMark.userData.p ? 'b' : ''; if (wb._aim !== k) { wb._aim = k; wb.classList.toggle('aim', k === 'b'); wb.classList.toggle('kick', k === 'k'); wb.querySelector('.kick-l').textContent = k === 'k' ? t('kickL') : '' } }
  // 音: 風（速さ）・ヘリ（近さ）・電気のジジジ（近い仕掛け）
  if (mode === 'play' && me) {
    const v3 = Math.hypot(me.vx, me.vy, me.vz)
    const wl = Snd.loops.wind; if (wl && wl.g) { const gv = me.grounded ? 0 : Math.min(0.35, Math.max(0, (v3 - 16) / 40)); wl.g.gain.value = Number.isFinite(gv) ? gv : 0 }
    const bl = Snd.loops.buzz; if (bl && bl.g && frameN % 6 === 0) { let g = 1e9; for (const h of H.haz) { const q = Math.hypot(h.cx - me.x, h.cz - me.z) - h.rad * 0.5; if (q < g) g = q } const gv = H.over ? 0 : Math.max(0, 1 - g / 25) * 0.35; bl.g.gain.value = Number.isFinite(gv) ? gv : 0 }
  }
  drawSpeed(mode === 'play' && me ? Math.hypot(me.vx, me.vy, me.vz) : 0, dt)
  carsDraw.draw(street.traffic.cars, camera.position, dt)
  sky.update(camera.position, now)
  fx.update(dt)
  fx.shake = Math.max(0, fx.shake - dt * 2.5)
  if (mode === 'play' && H) {
    updateHud(dt); updateFloats(dt)
    multPulse = Math.max(0, multPulse - dt * 3); $('bChain').style.setProperty('--pulse', multPulse.toFixed(2))
    if (endAt > 0) { endAt -= dt; if (endAt <= 0) showResult() }
  }
  renderer.render(scene, camera)
  if (snapNext > 0 && --snapNext === 0) { const c2 = document.createElement('canvas'); c2.width = 640; c2.height = Math.round(640 * innerHeight / innerWidth); c2.getContext('2d').drawImage(renderer.domElement, 0, 0, c2.width, c2.height); photo = c2 }
  frameN++
}

// ---------------------------------------------------------------- 検証用の窓口
window.heist = {
  get mode() { return mode }, log, get hitStop() { return hitStop }, get flashA() { return flashA }, get fovKick() { return fovKick }, get me() { return me }, get H() { return H }, RUN, HZ, PTS, MEDAL, COURSES, world, camera, touchMode, cam, renderer, fx, scene, view,
  start: (c = 1, seed) => startHeist(c, seed), get course() { return course }, get ghost() { return ghost }, bestOf, toTitle, showResult, setLang: l => { lang = l; applyLang() }, get lang() { return lang },
  pointXY: (x, y, z) => { camera.updateMatrixWorld(); _v.set(x, y, z).project(camera); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, z: _v.z } },
  dbg: {
    pause: on => { dbgPause = on }, step: n => { for (let i = 0; i < n; i++) stepOnce(); render(STEP) },
    teleport: (x, y, z, yaw) => { Object.assign(me, { x, y, z, vx: 0, vy: 0, vz: 0, rope: null, climbing: null, grounded: y < 0.1 }); H.lastX = x; H.lastY = y; H.lastZ = z; if (yaw != null) me.yaw = yaw },
    pressWire: (sx, sy) => aimAt(sx, sy), wireAuto: () => pressButton(),
    keys, stick, say, get model() { return model },
    render: n => { for (let i = 0; i < n; i++) render(1 / 30) },
    lookAt: (x, z) => { cam.hd = Math.atan2(x - me.x, z - me.z); cam.userT = performance.now() },
    anchor: () => findAnchor(world, me, cam.hd),
    safe: () => { H.inv = 1e9; H.drones.length = 0 },
    wireAt: (x, y, z, ground = false) => { pendingWire = { at: { x, y, z, ground } } },
    // 画面のどこを押せばビル／地面に掛かるか（本物の指で押すテスト用）
    screenAnchor: () => {
      camera.updateMatrixWorld()
      for (let sy = 0.18; sy < 0.6; sy += 0.04) for (let sx = 0.15; sx < 0.86; sx += 0.05) {
        ndc.set(sx * 2 - 1, -(sy * 2 - 1)); ray.setFromCamera(ndc, camera)
        const o = ray.ray.origin, d = ray.ray.direction, h = rayHit(world, o.x, o.y, o.z, d.x, d.y, d.z, 400, Math.max(0, (me.x - o.x) * d.x + (me.y + 1 - o.y) * d.y + (me.z - o.z) * d.z - 1))
        if (h && !h.pole && h.y > me.y + 4 && Math.hypot(h.x - me.x, h.y - me.y - 1.5, h.z - me.z) < RUN.wireRange - 5) return { x: sx * innerWidth, y: sy * innerHeight, hit: h }
      }
      return null
    },
    screenGround: () => {
      camera.updateMatrixWorld()
      for (let sy = 0.72; sy > 0.42; sy -= 0.03) for (let sx = 0.36; sx < 0.65; sx += 0.04) {   // 左下のスティックと右下のボタンを避ける
        ndc.set(sx * 2 - 1, -(sy * 2 - 1)); ray.setFromCamera(ndc, camera)
        const o = ray.ray.origin, d = ray.ray.direction, g = groundRay(o, d, RUN.wireRange + 60)
        const b = rayHit(world, o.x, o.y, o.z, d.x, d.y, d.z, 400, 0), tb = b ? Math.hypot(b.x - o.x, b.y - o.y, b.z - o.z) : Infinity
        if (g && !(tb < g.t + 6) && Math.hypot(g.x - me.x, g.y - me.y, g.z - me.z) < RUN.wireRange - 5) return { x: sx * innerWidth, y: sy * innerHeight, g }
      }
      return null
    },
    stepUntil: (fn, max = 3000) => { const f = new Function('heist', 'return ' + fn); for (let i = 0; i < max; i++) { stepOnce(); if (f(window.heist)) { render(STEP); return i + 1 } } render(STEP); return -1 }
  }
}
applyLang()
toTitle()
// 準備完了: 最初の画面を2回描いたら（画像・人物・音は裏で読む。届くまでは仮の色と手続きの人形）
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__bootDone = true; window.__bootSet && window.__bootSet(1)
  const b = $('boot'); b.classList.add('out'); setTimeout(() => b.classList.add('hidden'), 380)
  window.__wdReady = true
  lazyStart()
  loadCharAssets().then(() => { if (charAssets.ready && model && !(model instanceof CharRunnerModel)) newModel() })
}))
requestAnimationFrame(frame)
