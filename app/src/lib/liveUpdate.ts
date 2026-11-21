/**
 * 原生包热更新（Capacitor Live Update）
 *
 * 原理：把 app/dist 打成 zip 传到 GitHub Release，App 启动时读 bundle.json，
 * 发现 bundle 版本比当前新就下载并在下次启动（或点「立即重启」）生效。
 * 这样改界面/加功能不用让用户重新装 APK，题库更新也跟着这份包一起走。
 *
 * 没有安装插件或运行在浏览器里时，所有方法都安全地返回空结果。
 */
import { Capacitor } from '@capacitor/core'
import { LiveUpdate } from '@capawesome/capacitor-live-update'
import { APP_VERSION, isNewerVersion } from './content'

/**
 * 发版清单，按可信度排序。几个源都带 CORS，浏览器和原生 WebView 都读得到。
 *
 * 1. GitHub Pages：发版后随站点部署，Cache-Control 只有 600 秒，最可靠。
 * 2. jsDelivr：国内大多能连，但 `@main` 会把「分支 → commit」的解析结果缓存十几个
 *    小时，发完版常常还读到旧内容（2026-11-21 就踩到过），所以只当兜底。
 * 3. raw.githubusercontent：更新快，但国内经常连不上，放最后。
 */
export const BUNDLE_FEEDS = [
  'https://tera-dark.github.io/gzzk-trainer/bundle.json',
  'https://cdn.jsdelivr.net/gh/Tera-Dark/gzzk-trainer@main/bundle.json',
  'https://raw.githubusercontent.com/Tera-Dark/gzzk-trainer/main/bundle.json',
]

/** 兼容旧引用，指向首选源 */
export const BUNDLE_FEED = BUNDLE_FEEDS[0]

export interface BundleInfo {
  version: string
  url: string
  notes?: string
}

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 并发读所有源，取版本号最新的那份（各源缓存不同步时不会误判「已是最新」） */
export async function fetchBundleInfo(): Promise<BundleInfo | null> {
  const ts = Date.now()
  const list = await Promise.all(
    BUNDLE_FEEDS.map(async (feed) => {
      try {
        const sep = feed.includes('?') ? '&' : '?'
        const res = await fetch(`${feed}${sep}t=${ts}`, { cache: 'no-store' })
        if (!res.ok) return null
        const info = (await res.json()) as BundleInfo
        return info?.version ? info : null
      } catch {
        return null
      }
    })
  )
  let best: BundleInfo | null = null
  for (const info of list) {
    if (!info) continue
    if (!best || isNewerVersion(info.version, best.version)) best = info
  }
  return best
}

export async function currentBundleId(): Promise<string | null> {
  if (!isNative()) return null
  try {
    const r = await LiveUpdate.getCurrentBundle()
    return r.bundleId ?? null
  } catch {
    return null
  }
}

export async function downloadedBundleIds(): Promise<string[]> {
  if (!isNative()) return []
  try {
    const r = await LiveUpdate.getDownloadedBundles()
    return r.bundleIds ?? []
  } catch {
    return []
  }
}

export type NativeCheckResult =
  | { kind: 'unsupported' }
  | { kind: 'latest'; version: string }
  | { kind: 'error' }
  | { kind: 'ready'; version: string; notes?: string }

/** 检查 + 下载（不立即重启），成功后调用 reloadNative() 生效 */
export async function checkNativeUpdate(onProgress?: (pct: number) => void): Promise<NativeCheckResult> {
  if (!isNative()) return { kind: 'unsupported' }
  const info = await fetchBundleInfo()
  if (!info?.url || !info.version) return { kind: 'error' }

  const cur = await currentBundleId()
  const already = await downloadedBundleIds()
  const isNewer = isNewerVersion(info.version, APP_VERSION)
  if (!isNewer && cur !== info.version) return { kind: 'latest', version: APP_VERSION }
  if (info.version === cur) return { kind: 'latest', version: info.version }

  try {
    if (!already.includes(info.version)) {
      let handle: { remove: () => Promise<void> } | undefined
      try {
        handle = await LiveUpdate.addListener('downloadBundleProgress', (e: { progress: number }) => {
          onProgress?.(Math.round((e.progress ?? 0) * 100))
        })
      } catch {
        /* 老版本没有进度事件，忽略 */
      }
      await LiveUpdate.downloadBundle({ bundleId: info.version, url: info.url })
      await handle?.remove()
    }
    await LiveUpdate.setNextBundle({ bundleId: info.version })
    return { kind: 'ready', version: info.version, notes: info.notes }
  } catch {
    return { kind: 'error' }
  }
}

/** 应用已下载的包（会重启 WebView） */
export async function reloadNative(): Promise<void> {
  if (!isNative()) return
  try {
    await LiveUpdate.reload()
  } catch {
    /* ignore */
  }
}
