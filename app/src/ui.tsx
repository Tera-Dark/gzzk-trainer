import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import * as db from './lib/db'

export function useRoute(): [string, (p: string) => void] {
  const get = () => location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(get)
  useEffect(() => {
    const on = () => setRoute(get())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [route, (p: string) => (location.hash = p)]
}

export function useDB() {
  return useSyncExternalStore(db.subscribe, db.snapshot, db.snapshot)
}

export function go(path: string) {
  location.hash = path
  window.scrollTo(0, 0)
}

export function Nav({ route }: { route: string }) {
  const items = [
    { p: '/', label: '首页', icon: 'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5' },
    { p: '/papers', label: '题库', icon: 'M4 5h7v14H4zM13 5h7v14h-7z' },
    { p: '/mistakes', label: '错题本', icon: 'M5 5h14v14H5zM9 9l6 6M15 9l-6 6' },
    { p: '/stats', label: '数据', icon: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
    { p: '/settings', label: '我的', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h5l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.06-.33.1-.66.1-1z' },
  ]
  return (
    <nav className="nav">
      {items.map((it) => {
        const on =
          it.p === '/'
            ? route === '/'
            : it.p === '/papers'
              ? /^\/(papers|subject|paper|tag)/.test(route)
              : route.startsWith(it.p)
        return (
          <a key={it.p} href={`#${it.p}`} className={on ? 'on' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={it.icon} />
            </svg>
            {it.label}
          </a>
        )
      })}
    </nav>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheetMask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <div className="spacer" />
          <button className="iconBtn" onClick={onClose} aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stat({ v, k }: { v: ReactNode; k: string }) {
  return (
    <div>
      <div className="v">{v}</div>
      <div className="k">{k}</div>
    </div>
  )
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function daysBetween(a: number, b: number): number {
  return Math.ceil((b - a) / 86400000)
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null
  return <div className="toast">{text}</div>
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 1600)
    return () => clearTimeout(t)
  }, [msg])
  return [msg, setMsg] as const
}
