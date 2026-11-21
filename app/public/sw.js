/* 离线缓存 + 内容更新：让「安装到桌面」后断网也能做题，联网时自动换新内容 */
const CACHE = 'gzzk-v2'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting()
  if (e.data === 'clear-data-cache') {
    e.waitUntil(
      caches.open(CACHE).then(async (c) => {
        const keys = await c.keys()
        await Promise.all(keys.filter((r) => /\/data\/|version\.json/.test(r.url)).map((r) => c.delete(r)))
      })
    )
  }
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return

  // 页面导航：先联网拿最新页面，断网时回退到缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || fetch(req)))
    )
    return
  }

  // 内容版本号永远先问服务器，避免显示过期的「有新内容」
  if (/\/data\/version\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req).catch(() => caches.match(req)))
    return
  }

  // 题库 JSON 与图片：先给缓存，同时后台更新（离线也能用，联网自动换新）
  if (/\/data\/|\/assets\//.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) c.put(req, res.clone()).catch(() => {})
            return res
          })
          .catch(() => null)
        return cached || network || new Response('', { status: 504 })
      })
    )
    return
  }

  // 其他同源静态资源：缓存优先，后台刷新
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) c.put(req, res.clone()).catch(() => {})
          return res
        })
        .catch(() => null)
      return cached || network || new Response('', { status: 504 })
    })
  )
})
