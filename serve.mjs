// 极简静态服务器：把 app/dist 目录发给浏览器（手机同 WiFi 也能打开）
// 用法：node serve.mjs [端口]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, 'app', 'dist')
const CONTENT = path.join(__dirname, 'content')
const PORT = Number(process.argv[2] || process.env.PORT || 8080)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
}

if (!fs.existsSync(ROOT)) {
  console.error('找不到 app/dist，请先在 app 目录执行：npm install && npm run build')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0])
  // 内容更新通道：/content/... 直接映射到项目根的 content 目录，并允许跨域
  if (rel.startsWith('/content/')) {
    const f = path.join(CONTENT, rel.slice('/content/'.length))
    if (!f.startsWith(CONTENT)) return void res.writeHead(403).end('forbidden')
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) return void res.writeHead(404).end('not found')
      const ext = path.extname(f).toLowerCase()
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      })
      fs.createReadStream(f).pipe(res)
    })
    return
  }
  if (rel === '/') rel = '/index.html'
  const file = path.join(ROOT, rel)
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // 单页应用：未知路径回退到 index.html
      const index = path.join(ROOT, 'index.html')
      fs.readFile(index, (e, buf) => {
        if (e) {
          res.writeHead(404).end('not found')
          return
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' })
        res.end(buf)
      })
      return
    }
    const ext = path.extname(file).toLowerCase()
    // index.html 与 sw.js 必须每次校验，否则用户端拿不到新版本
    const noCache = ext === '.html' || ext === '.webmanifest' || rel === '/sw.js'
    const cache = noCache ? 'no-cache' : 'public, max-age=86400'
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache })
    fs.createReadStream(file).pipe(res)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces()
  const lan = []
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) lan.push(n.address)
    }
  }
  console.log('\n  真题训练台已启动\n')
  console.log(`  本机打开:   http://localhost:${PORT}`)
  for (const ip of lan) console.log(`  手机打开:   http://${ip}:${PORT}   （需连同一个 WiFi）`)
  console.log('\n  关闭窗口或按 Ctrl+C 结束\n')
})
