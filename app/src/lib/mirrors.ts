/**
 * 国内网络取 GitHub 文件的兜底线路。
 *
 * 直连 github.com / raw.githubusercontent.com / objects.githubusercontent.com
 * 在大陆经常 DNS 被污染或直接超时，GitHub Pages 的域名也时常连不上。
 * 所以清单和安装包分开走：
 * - 清单（bundle.json / app-update.json）：多个静态地址并发读，谁先回算谁；
 * - 安装包（release 里的 zip）：前面拼 GitHub 加速前缀，实测能拿到重定向后的真身。
 *
 * 这些是公共加速站，可用性会变。真正的解法是往国内对象存储（腾讯云 COS /
 * 阿里云 OSS 等）放一份，然后在「我的 → 更新源地址」里填上那个地址，就不再依赖它们。
 */

/** GitHub 加速前缀，按实测可用性排序 */
export const GITHUB_PROXIES = ['https://ghfast.top/', 'https://gh-proxy.com/']

const GITHUB_URL = /^https:\/\/(?:github\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com)\//

/** 把 GitHub 直链换成几条加速线路；不是 GitHub 地址就返回空 */
export function proxied(url: string): string[] {
  if (!url || !GITHUB_URL.test(url)) return []
  return GITHUB_PROXIES.map((p) => p + url)
}

export function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))]
}

export function withCacheBust(url: string, ts = Date.now()): string {
  return url + (url.includes('?') ? '&' : '?') + 't=' + ts
}

/**
 * 带超时的 fetch。国内网络常见的情况是「TCP 连上了但一直不回包」，
 * 不加超时会把启动时的更新检查拖到浏览器自己放弃（可能几十秒）。
 */
export async function fetchWithTimeout(url: string, ms = 6000, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 并发读多份同名 JSON，返回所有解析成功的结果（不关心来源顺序） */
export async function fetchJsonAll<T>(urls: string[], ms = 6000): Promise<T[]> {
  const ts = Date.now()
  const list = await Promise.all(
    urls.map(async (url): Promise<unknown> => {
      try {
        const res = await fetchWithTimeout(withCacheBust(url, ts), ms, { cache: 'no-store' })
        if (!res.ok) return null
        return (await res.json()) as unknown
      } catch {
        return null
      }
    })
  )
  return list.filter((x) => x !== null) as T[]
}
