import { BASE } from './data'
import * as db from './db'

/** 内容来源：默认跟 App 同源；也可指向远程静态目录（末尾自动补 /） */
export function activeBase(): string {
  const custom = (db.settings().contentBase || '').trim()
  if (!custom) return BASE
  return custom.endsWith('/') ? custom : custom + '/'
}

export function contentBase(): string {
  return activeBase()
}

export function isRemote(): boolean {
  return activeBase() !== BASE
}

/* ---------- IndexedDB：远程内容离线缓存 ---------- */

const DB_NAME = 'gzzk-content'
const STORE = 'files'

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet(key: string): Promise<string | null> {
  try {
    const d = await openIDB()
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(key)
      r.onsuccess = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => reject(r.error)
    })
  } catch {
    return null
  }
}

async function idbPut(key: string, val: string): Promise<void> {
  const d = await openIDB()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(val, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbClear(): Promise<void> {
  try {
    const d = await openIDB()
    await new Promise<void>((resolve) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

/* ---------- 版本检查 ---------- */

export interface VersionInfo {
  version: string
  builtAt?: string
  notes?: string
  papers?: number
  questions?: number
}

export async function fetchVersion(base = activeBase()): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`${base}data/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as VersionInfo
  } catch {
    return null
  }
}

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest'; v: string }
  | { kind: 'available'; remote: VersionInfo; current?: string }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'done'; v: string }
  | { kind: 'error'; msg: string }

export async function checkForUpdate(): Promise<UpdateState> {
  const remote = await fetchVersion()
  if (!remote) return { kind: 'error', msg: '连不上内容服务器' }
  const current = db.contentVersion()
  if (!current) return { kind: 'available', remote, current }
  if (remote.version === current) return { kind: 'latest', v: remote.version }
  return { kind: 'available', remote, current }
}

/** 下载远程内容到本地缓存；同源时直接重载页面即可 */
export async function applyUpdate(remote: VersionInfo, onProgress?: (done: number, total: number) => void): Promise<void> {
  const base = activeBase()
  if (!isRemote()) {
    db.setContentVersion(remote.version)
    // 同源内容：先清掉 Service Worker 里的题库缓存，再刷新，避免读到旧 JSON
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      reg?.active?.postMessage('clear-data-cache')
    } catch {
      /* ignore */
    }
    location.reload()
    return
  }
  const index = await (await fetch(`${base}data/index.json?t=${Date.now()}`, { cache: 'no-store' })).json()
  const ids: string[] = (index.papers || []).map((p: { id: string }) => p.id)
  const files = ['index.json', 'questions.json', 'tags.json', 'version.json', ...ids.map((id) => `${id}.json`)]
  let done = 0
  await idbClear()
  for (const f of files) {
    const res = await fetch(`${base}data/${f}?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) await idbPut('data/' + f, await res.text())
    done += 1
    onProgress?.(done, files.length)
  }
  db.setContentVersion(remote.version)
  location.reload()
}

/** 读取 JSON：远程内容优先用本地缓存，避免每次进页面都吃流量 */
export async function jsonFromCacheOrNet<T>(path: string): Promise<T | null> {
  const base = activeBase()
  if (isRemote()) {
    const cached = await idbGet('data/' + path)
    if (cached) return JSON.parse(cached) as T
  }
  const res = await fetch(`${base}data/${path}${isRemote() ? '?t=' + Date.now() : ''}`, { cache: isRemote() ? 'no-store' : 'default' })
  if (!res.ok) throw new Error(`加载失败：${path}`)
  const text = await res.text()
  if (isRemote()) await idbPut('data/' + path, text)
  return JSON.parse(text) as T
}
