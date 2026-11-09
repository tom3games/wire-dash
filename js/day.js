// 昼の街の見た目（ワイヤーダッシュ）。空は画像を読まず shader（晴れた青空・太陽・薄い雲）。2026-11-09 本人「ステージが暗い」で夜をやめた
import * as THREE from 'three'

export const PALETTE = {
  zenith: new THREE.Color(0x3f7fd6), mid: new THREE.Color(0x86b6ee), horizon: new THREE.Color(0xe4eef8), glow: new THREE.Color(0xfff2d0),
  fog: new THREE.Color(0xcfdced), sun: new THREE.Color(0xfff0d8), hemiSky: new THREE.Color(0xd2e4ff), hemiGround: new THREE.Color(0x9a8a74)
}
const SKY_V = 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }'
const SKY_F = `
uniform vec3 cZ, cM, cH, cG; uniform vec3 sunD; uniform float uT;
varying vec3 vD;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vD); float y = d.y;
  vec3 c = mix(cH, cM, smoothstep(0.0, 0.18, y)); c = mix(c, cZ, smoothstep(0.15, 0.7, y));
  float s = max(0.0, dot(d, sunD));
  c += cG * (pow(s, 8.0) * 0.35 + pow(s, 200.0) * 2.0);
  // 白い雲（ゆっくり流れる）
  vec2 q = d.xz / max(0.08, y) * 0.35 + vec2(uT * 0.004, 0.0);
  float cl = smoothstep(0.52, 0.78, fbm(q * 1.6));
  c = mix(c, vec3(1.0), cl * smoothstep(0.03, 0.25, y) * 0.85);
  if (y < 0.0) c = cH;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`
export function makeSky(renderer, scene, sunDir) {
  const u = { cZ: { value: PALETTE.zenith }, cM: { value: PALETTE.mid }, cH: { value: PALETTE.horizon }, cG: { value: PALETTE.glow }, sunD: { value: sunDir.clone() }, uT: { value: 0 } }
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat)
  mesh.renderOrder = -10; mesh.frustumCulled = false
  scene.add(mesh)
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64
  const x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, '#4a86d8'); g.addColorStop(0.45, '#bcd6f2'); g.addColorStop(0.5, '#e8eef4'); g.addColorStop(0.56, '#8a8a84'); g.addColorStop(1, '#5a564e')
  x.fillStyle = g; x.fillRect(0, 0, 128, 64)
  const et = new THREE.CanvasTexture(cv); et.mapping = THREE.EquirectangularReflectionMapping; et.colorSpace = THREE.SRGBColorSpace
  const pm = new THREE.PMREMGenerator(renderer)
  scene.environment = pm.fromEquirectangular(et).texture
  scene.environmentIntensity = 0.9
  pm.dispose(); et.dispose()
  scene.background = PALETTE.fog.clone()
  return { mesh, u, update(cam, t) { mesh.position.copy(cam); u.uT.value = t } }
}
