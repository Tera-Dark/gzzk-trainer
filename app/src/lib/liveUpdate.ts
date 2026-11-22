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
import * as db from './db'
import { dedupe, fetchJsonAll, proxied } from './mirrors'

/**
 * 发版清单的几条直连线路，都能带 CORS 读。
 *
 * 1. GitHub Pages：随站点部署，600 秒缓存，最可靠——但国内时通时不通。
 * 2. jsDelivr（两个节点）：国内多数能连，但 `@main` 解析出的 commit 会缓存十几小时，
 *    发完版常读到旧清单，只当兜底。
 * 3. raw.githubusercontent：更新最快，国内基本连不上，靠加速前缀捞一把。
 */
const STATIC_FEEDS = [
  'https://tera-dark.github.io/gzzk-trainer/bundle.json',
  'https://cdn.jsdelivr.net/gh/Tera-Dark/gzzk-trainer@main/bundle.json',
  'https://fastly.jsdelivr.net/gh/Tera-Dark/gzzk-trainer@main/bundle.json',
  'https://raw.githubusercontent.com/Tera-Dark/gzzk-trainer/main/bundle.json',
]

/** 用户在「我的 → 更新源地址」里填的国内地址优先，其余照旧并发试 */
export function bundleFeeds(): string[] {
  const custom = (db.settings().updateBase || '').trim()
  const base = custom ? (custom.endsWith('/') ? custom : custom + '/') : ''
  return dedupe([
    ...(base ? [base + 'bundle.json'] : []),
    ...STATIC_FEEDS,
    ...proxied(STATIC_FEEDS[STATIC_FEEDS.length - 1]),
  ])
}

/** 兼容旧引用，指向首选源 */
export const BUNDLE_FEED = STATIC_FEEDS[0]

export interface BundleInfo {
  version: string
  url?: string
  /** 多个下载地址，按顺序尝试；老清单只有 url 一个字段 */
  urls?: string[]
  notes?: string
}

/** 所有可尝试的下载地址：清单里写明的 + GitHub 加速线路，上次成功的排最前 */
export function downloadCandidates(info: BundleInfo): string[] {
  const pool = dedupe([...(info.urls ?? []), info.url ?? ''])
  const all = dedupe(pool.flatMap((u) => [u, ...proxied(u)]))
  let remember = ''
  try {
    remember = localStorage.getItem('gzzk.bundle.mirror') ?? ''
  } catch {
    remember = ''
  }
  if (remember && all.includes(remember)) return [remember, ...all.filter((u) => u !== remember)]
  return all
}

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 并发读所有线路，取版本号最新的那份（各线路缓存不同步时不会误判「已是最新」） */
export async function fetchBundleInfo(): Promise<BundleInfo | null> {
  const list = await fetchJsonAll<BundleInfo>(bundleFeeds(), 6000)
  let best: BundleInfo | null = null
  for (const info of list) {
    if (!info?.version) continue
    if (!info.url && !info.urls?.length) continue
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

/** 等一个 Promise，超时就放弃这条线路（插件自己的请求可能还在后台跑，不影响下一次尝试） */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

/** 检查 + 下载（不立即重启），成功后调用 reloadNative() 生效 */
export async function checkNativeUpdate(onProgress?: (pct: number) => void): Promise<NativeCheckResult> {
  if (!isNative()) return { kind: 'unsupported' }
  const info = await fetchBundleInfo()
  if (!info) return { kind: 'error' }

  const cur = await currentBundleId()
  const already = await downloadedBundleIds()
  const isNewer = isNewerVersion(info.version, APP_VERSION)
  if (!isNewer && cur !== info.version) return { kind: 'latest', version: APP_VERSION }
  if (info.version === cur) return { kind: 'latest', version: info.version }

  if (!already.includes(info.version)) {
    let handle: { remove: () => Promise<void> } | undefined
    try {
      handle = await LiveUpdate.addListener('downloadBundleProgress', (e: { progress: number }) => {
        onProgress?.(Math.round((e.progress ?? 0) * 100))
      })
    } catch {
      /* 老版本没有进度事件，忽略 */
    }

    let ok = false
    for (const url of downloadCandidates(info)) {
      try {
        await withTimeout(LiveUpdate.downloadBundle({ bundleId: info.version, url }), 90000)
        ok = true
        try {
          localStorage.setItem('gzzk.bundle.mirror', url)
        } catch {
          /* ignore */
        }
        break
      } catch {
        /* 这条线路不通，换下一条 */
      }
    }
    await handle?.remove()
    if (!ok) return { kind: 'error' }
  }

  try {
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
