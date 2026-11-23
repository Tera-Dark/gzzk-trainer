import { useEffect, useMemo, useState } from 'react'
import type { Subject } from './lib/types'
import { loadQuestions, loadQuestionsByIds } from './lib/data'
import { useRoute, Nav } from './ui'
import { Home, Papers, PaperScreen, PracticeScreen, SubjectScreen, ExamRoute } from './screens/Browse'
import { MistakesScreen, ReviewScreen, StatsScreen, TagScreen, DrillScreen } from './screens/Drills'
import { SettingsScreen } from './screens/Settings'
import { PathHome, SubjectPath, LessonScreen, WriteHome, WriteMixedScreen } from './screens/Path'
import { WritingHome, WritingDocScreen } from './screens/Writing'
import { QuizScreen } from './screens/Quiz'
import * as db from './lib/db'
import {
  applyUpdate,
  fetchVersion,
  fetchAppUpdate,
  isNewerVersion,
  APP_VERSION,
  type AppUpdateInfo,
  type UpdateState,
} from './lib/content'
import { checkNativeUpdate, isNative, reloadNative } from './lib/liveUpdate'

function UpdateBanner() {
  const [st, setSt] = useState<UpdateState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!db.settings().autoUpdate) return
    let alive = true
    const check = async () => {
      const r = await fetchVersion()
      if (!alive || !r?.version) return
      const cur = db.contentVersion()
      if (!cur) {
        db.setContentVersion(r.version)
        return
      }
      if (r.version !== cur) setSt({ kind: 'available', remote: r, current: cur })
      else setSt(null)
    }
    void check()
    // 回到前台时再看一眼，长期挂着也能及时发现新卷子
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!st || st.kind !== 'available') return null
  return (
    <div className="updBanner">
      <div className="txt">
        <b>有新内容</b>
        <span>
          {st.remote.version}
          {st.remote.papers ? ` · ${st.remote.papers} 套卷` : ''}
        </span>
      </div>
      <button className="btn sm" onClick={() => setSt(null)} disabled={busy}>
        以后
      </button>
      <button
        className="btn sm primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await applyUpdate(st.remote)
          } catch {
            setBusy(false)
            setSt(null)
          }
        }}
      >
        {busy ? '更新中…' : '立即更新'}
      </button>
    </div>
  )
}

function NativeUpdateBanner() {
  const [ready, setReady] = useState<{ version: string; notes?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isNative()) return
    let alive = true
    void (async () => {
      const r = await checkNativeUpdate()
      if (alive && r.kind === 'ready') setReady({ version: r.version, notes: r.notes })
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!ready) return null
  return (
    <div className="updBanner">
      <div className="txt">
        <b>新版本已准备好</b>
        <span>
          v{ready.version}
          {ready.notes ? ` · ${ready.notes}` : ''} · 重启后生效
        </span>
      </div>
      <button className="btn sm" onClick={() => setReady(null)} disabled={busy}>
        稍后
      </button>
      <button
        className="btn sm primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await reloadNative()
        }}
      >
        {busy ? '重启中…' : '立即重启'}
      </button>
    </div>
  )
}

function AppUpdateBanner() {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null)
  const [closed, setClosed] = useState(() => {
    const ts = Number(localStorage.getItem('gzzk.appUpdate.skip') || 0)
    return ts > Date.now() - 24 * 3600 * 1000
  })

  useEffect(() => {
    if (closed) return
    let alive = true
    const CACHED = 'gzzk.appUpdate.cached'
    const AT = 'gzzk.appUpdate.at'
    // 六小时内先看本机缓存，避免每次打开都并发请求多条外网线路
    try {
      const cached = localStorage.getItem(CACHED)
      const at = Number(localStorage.getItem(AT) || 0)
      if (cached && Date.now() - at < 6 * 3600 * 1000) {
        const c = JSON.parse(cached) as AppUpdateInfo
        if (c?.version && isNewerVersion(c.version, APP_VERSION)) setInfo(c)
        return
      }
    } catch {
      /* ignore */
    }
    void (async () => {
      const r = await fetchAppUpdate()
      if (!alive || !r?.version) return
      try {
        localStorage.setItem(CACHED, JSON.stringify(r))
        localStorage.setItem(AT, String(Date.now()))
      } catch {
        /* ignore */
      }
      if (isNewerVersion(r.version, APP_VERSION)) setInfo(r)
    })()
    return () => {
      alive = false
    }
  }, [closed])

  if (!info || closed) return null
  return (
    <div className="updBanner">
      <div className="txt">
        <b>App 有新版本</b>
        <span>
          v{info.version}
          {info.notes ? ` · ${info.notes}` : ''}
        </span>
      </div>
      <button
        className="btn sm"
        onClick={() => {
          localStorage.setItem('gzzk.appUpdate.skip', String(Date.now()))
          setClosed(true)
        }}
      >
        以后
      </button>
      <button
        className="btn sm primary"
        onClick={() => {
          const url = info.urls?.[0] ?? info.url
          if (url) window.open(url, '_blank', 'noopener')
        }}
      >
        去更新
      </button>
    </div>
  )
}

function randomSeedKey() {
  return 'gzzk.random.seed.' + new Date().toDateString()
}

function RandomScreen() {
  const [, nav] = useRoute()
  const [round, setRound] = useState(0)
  const [items, setItems] = useState<Awaited<ReturnType<typeof loadQuestionsByIds>> | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const key = randomSeedKey()
      let list: string[] = []
      try {
        list = JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]
      } catch {
        list = []
      }
      if (!list.length) {
        const all = await loadQuestions()
        const pool = [...all]
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        list = pool.slice(0, 10).map((q) => q.id)
        sessionStorage.setItem(key, JSON.stringify(list))
      }
      const loaded = await loadQuestionsByIds(list)
      if (alive) setItems(loaded)
    })()
    return () => {
      alive = false
    }
  }, [round])

  if (!items) return <div className="empty">正在抽题…</div>
  return (
    <QuizScreen
      key={round}
      title="随机练 10 道"
      subtitle="各科混合"
      items={items}
      mode="practice"
      onExit={() => nav('/')}
      onRestart={() => {
        sessionStorage.removeItem(randomSeedKey())
        setItems(null)
        setRound((r) => r + 1)
      }}
    />
  )
}

export function App() {
  const [route] = useRoute()
  const [path, query] = route.split('?')
  const params = useMemo(() => new URLSearchParams(query ?? ''), [query])
  const parts = path.split('/').filter(Boolean)

  const isQuiz =
    parts[0] === 'paper' ||
    parts[0] === 'practice' ||
    parts[0] === 'exam' ||
    parts[0] === 'drill' ||
    parts[0] === 'review' ||
    parts[0] === 'lesson' ||
    parts[0] === 'write' ||
    path === '/practice-random'

  let page: React.ReactNode
  switch (parts[0]) {
    case undefined:
      page = <Home />
      break
    case 'papers':
      page = <Papers />
      break
    case 'subject':
      page = <SubjectScreen subject={parts[1] as Subject} />
      break
    case 'paper':
      page = <PaperScreen pid={parts[1]} />
      break
    case 'practice':
      page = (
        <PracticeScreen
          pid={parts[1]}
          start={Number(params.get('start') ?? 0)}
          qid={params.get('qid') ?? undefined}
          mode="practice"
        />
      )
      break
    case 'practice-random':
      page = <RandomScreen />
      break
    case 'exam':
      page = <ExamRoute pid={parts[1]} />
      break
    case 'drill':
      page = <DrillScreen pid={parts[1]} nos={params.get('no') ?? undefined} qids={params.get('qids') ?? undefined} />
      break
    case 'tag':
      page = <TagScreen subject={parts[1] as Subject} tag={decodeURIComponent(parts[2] ?? '')} />
      break
    case 'review':
      page = <ReviewScreen />
      break
    case 'mistakes':
      page = <MistakesScreen />
      break
    case 'stats':
      page = <StatsScreen />
      break
    case 'settings':
      page = <SettingsScreen />
      break
    case 'path':
      page = parts[1] ? <SubjectPath subject={parts[1] as Subject} /> : <PathHome />
      break
    case 'lesson':
      page = <LessonScreen subject={parts[1] as Subject} tag={decodeURIComponent(parts[2] ?? '')} />
      break
    case 'writing':
      page = parts[1] ? <WritingDocScreen id={parts[1]} /> : <WritingHome />
      break
    case 'write':
      if (!parts[1]) page = <WriteHome />
      else if (parts[1] === 'mixed') page = <WriteMixedScreen />
      else page = <LessonScreen subject={parts[1] as Subject} tag={decodeURIComponent(parts[2] ?? '')} write />
      break
    default:
      page = <Home />
  }

  return (
    <>
      <div className="updStack">
        <NativeUpdateBanner />
        <AppUpdateBanner />
        <UpdateBanner />
      </div>
      {page}
      {!isQuiz && <Nav route={path} />}
    </>
  )
}
