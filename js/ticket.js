// 結果の紙: 計測器から出てくる記録紙（感熱紙のレシート）。上にゴールの写真、大きいタイム、メダル3つ、技の数。1枚の画像にして保存・SNS に貼れる
const W = 1080, H = 1350
const NUM = '"Chakra Petch", "SF Mono", ui-monospace, monospace', JP = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif'
const MC = { gold: ['#f2c230', '#a8780a'], silver: ['#d6dde6', '#7c8794'], bronze: ['#e09a5a', '#8a4e1e'] }

export function drawTicket(cv, d) {
  cv.width = W; cv.height = H
  const x = cv.getContext('2d')
  // 背景: 晴れた空の色の机
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#8ec0ee'); bg.addColorStop(1, '#4a86d0')
  x.fillStyle = bg; x.fillRect(0, 0, W, H)
  // 紙（少し傾け、下はちぎった形）
  x.save(); x.translate(W / 2, H / 2); x.rotate(-0.018); x.translate(-W / 2, -H / 2)
  const L = 120, T = 36, PW = W - 240, PH = H - 72
  x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(L + 10, T + 12, PW, PH)
  x.beginPath(); x.moveTo(L, T); x.lineTo(L + PW, T); x.lineTo(L + PW, T + PH)
  for (let i = 0; i <= 24; i++) x.lineTo(L + PW - i * PW / 24, T + PH - (i % 2 ? 14 : 0))
  x.closePath(); x.fillStyle = '#fbfaf6'; x.fill()
  const ink = '#1c2230', mute = '#6a7280'
  x.textBaseline = 'alphabetic'
  // 見出し
  x.fillStyle = ink; x.textAlign = 'center'; x.font = `700 30px ${JP}`; x.fillText(d.head, W / 2, T + 62)
  dots(x, L + 40, T + 88, PW - 80)
  x.fillStyle = ink; x.textAlign = 'left'; x.font = `700 40px ${JP}`; x.fillText(`${d.course}  ${d.name}`, L + 40, T + 142)
  // 写真（ゴールの瞬間・色のまま）
  const py = T + 168, ph = 300
  if (d.photo) {
    x.save(); x.beginPath(); x.rect(L + 40, py, PW - 80, ph); x.clip()
    const iw = d.photo.width, ih = d.photo.height, s = Math.max((PW - 80) / iw, ph / ih)
    x.drawImage(d.photo, L + 40 + (PW - 80 - iw * s) / 2, py + (ph - ih * s) / 2, iw * s, ih * s); x.restore()
  } else { x.fillStyle = '#d8dde4'; x.fillRect(L + 40, py, PW - 80, ph) }
  // タイム（大きく）
  let y = py + ph + 64
  x.fillStyle = mute; x.font = `700 28px ${JP}`; x.fillText(d.timeL, L + 40, y)
  if (d.newBest) { x.fillStyle = '#d23a2a'; x.textAlign = 'right'; x.fillText(d.newBest, L + PW - 40, y); x.textAlign = 'left' }
  y += 112
  x.fillStyle = ink; x.font = `700 ${d.time.length > 6 ? 118 : 136}px ${NUM}`; x.fillText(d.endL || d.time, L + 36, y)
  if (d.penalty && !d.endL) { x.fillStyle = '#d23a2a'; x.font = `700 30px ${JP}`; x.fillText(`${d.missesL} ${d.misses}${d.penalty}`, L + 40, y + 44) }
  x.fillStyle = mute; x.font = `700 28px ${JP}`; x.textAlign = 'right'; x.fillText(`${d.bestL}  `, L + PW - 200, y - 6)
  x.fillStyle = ink; x.font = `700 40px ${NUM}`; x.fillText(d.best, L + PW - 40, y - 6); x.textAlign = 'left'
  y += 76; dots(x, L + 40, y, PW - 80); y += 20
  // メダル3つ（タイム・ノーミス・紙一重）
  const mw = (PW - 80) / 3
  d.medals.forEach(([label, kind, val], i) => {
    const cx = L + 40 + mw * i + mw / 2, cy = y + 62
    const c = kind ? MC[kind] : null
    x.beginPath(); x.arc(cx, cy, 44, 0, Math.PI * 2)
    if (c) { const g = x.createRadialGradient(cx - 12, cy - 14, 6, cx, cy, 46); g.addColorStop(0, '#fff'); g.addColorStop(0.35, c[0]); g.addColorStop(1, c[1]); x.fillStyle = g; x.fill(); x.lineWidth = 4; x.strokeStyle = c[1]; x.stroke() }
    else { x.setLineDash([6, 6]); x.lineWidth = 3; x.strokeStyle = '#b6bcc6'; x.stroke(); x.setLineDash([]) }
    x.fillStyle = c ? '#1c2230' : '#9aa2ae'; x.textAlign = 'center'; x.font = `700 26px ${JP}`; x.fillText(val, cx, cy + 9)
    x.fillStyle = mute; x.font = `700 24px ${JP}`; x.fillText(label, cx, cy + 82)
  })
  x.textAlign = 'left'
  y += 188
  x.fillStyle = mute; x.font = `700 26px ${JP}`; x.fillText(d.ja ? `金 ${d.goldT}秒以内・銀 ${d.silverT}秒以内・ゴールで銅` : `Gold under ${d.goldT}s · Silver under ${d.silverT}s · Bronze for finishing`, L + 40, y)
  y += 20; dots(x, L + 40, y, PW - 80); y += 44
  // 技の数（2列）とスコア
  const half = (PW - 80 - 30) / 2
  d.stats.forEach(([k, v], i) => {
    const cx = L + 40 + (i % 2) * (half + 30), cy = y + Math.floor(i / 2) * 42
    x.fillStyle = mute; x.font = `700 28px ${JP}`; x.textAlign = 'left'; x.fillText(k, cx, cy)
    x.fillStyle = ink; x.font = `700 32px ${NUM}`; x.textAlign = 'right'; x.fillText(String(v), cx + half, cy)
  })
  x.textAlign = 'left'
  y += Math.ceil(d.stats.length / 2) * 42 + 4
  x.fillStyle = mute; x.font = `700 26px ${JP}`; x.fillText(d.scoreL, L + 40, y + 30)
  x.fillStyle = ink; x.font = `700 52px ${NUM}`; x.textAlign = 'right'; x.fillText(d.score, L + PW - 40, y + 38)
  x.fillStyle = mute; x.font = `400 20px ${NUM}`; x.fillText(d.footer, L + PW - 40, T + PH - 30)
  x.restore()
}
function dots(x, X, Y, w) { x.fillStyle = '#aeb5c0'; for (let i = 0; i < w; i += 12) x.fillRect(X + i, Y, 6, 2) }
