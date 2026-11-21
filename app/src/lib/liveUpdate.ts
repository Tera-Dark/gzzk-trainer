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

/** 发版清单（jsDelivr 有 CORS，浏览器和原生 WebView 都读得到） */
export const BUNDLE_FEED = 'https://cdn.jsdelivr.net/gh/Tera-Dark/gzzk-trainer@main/bundle.json'

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

export async function fetchBundleInfo(): Promise<BundleInfo | null> {
  try {
    const res = await fetch(`${BUNDLE_FEED}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as BundleInfo
  } catch {
    return null
  }
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
