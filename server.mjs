// 依存ゼロの静的サーバ。node server.mjs で http://localhost:5310

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = import.meta.dirname
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
}

// URL パスを実ファイルへ解決する
function resolve(urlPath) {
  const p = normalize(decodeURIComponent(urlPath.split('?')[0]))
  if (p.includes('..')) return null
  return join(ROOT, p === '/' ? '/index.html' : p)
}

const PORT = Number(process.env.PORT ?? 6451)

createServer(async (req, res) => {
  const file = resolve(req.url)
  if (!file) { res.writeHead(400).end('bad path'); return }
  try {
    let body = await readFile(file)
    const head = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }
    // GZ=1: GitHub Pages と同じく文字のファイルを gzip で返す（読み込みの計測用）
    if (process.env.GZ && /\.(js|html|css|json|svg)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = gzipSync(body); head['content-encoding'] = 'gzip' }
    res.writeHead(200, head)
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`))
