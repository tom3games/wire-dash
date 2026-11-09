// 街の ASCII 地図（10m マス、建物の高さ。. = 地面、~ = 運河）。node tools/map.mjs [x0 x1 z0 z1]
import { createWorld } from '../shared/track.js?v=1'
import { floorAt } from '../shared/runner.js?v=1'
import { addTown, clearShopFront } from '../shared/town.js?v=1'
import { buildPoles } from '../shared/street.js?v=1'
import { BASE } from '../shared/heist.js?v=1'
const [x0, x1, z0, z1] = (process.argv.slice(2).length ? process.argv.slice(2) : [-300, 460, 150, 1000]).map(Number)
const w = createWorld('city'); clearShopFront(w, BASE); addTown(w, BASE); buildPoles(w, BASE)
const ch = h => h < 0 ? '~' : h < 1 ? '.' : h < 10 ? 'a' : h < 20 ? 'b' : h < 30 ? 'c' : h < 45 ? 'd' : h < 70 ? 'e' : h < 100 ? 'f' : 'g'
let out = ''
for (let z = z1; z >= z0; z -= 10) { let s = String(z).padStart(5) + ' '; for (let x = x0; x <= x1; x += 10) s += ch(floorAt(w, x, z, 400).h); out += s + '\n' }
let hdr = '      '; for (let x = x0; x <= x1; x += 10) hdr += (x % 100 === 0 ? '|' : ' '); console.log(hdr + '\n' + out + hdr + '   x from ' + x0)
