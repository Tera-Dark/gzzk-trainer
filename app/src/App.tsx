import { useEffect, useMemo, useState } from 'react'
import type { Subject } from './lib/types'
import { loadQuestions, loadQuestionsByIds } from './lib/data'
import { useRoute, Nav } from './ui'
import { Home, Papers, PaperScreen, PracticeScreen, SubjectScreen, ExamRoute } from './screens/Browse'
import { MistakesScreen, ReviewScreen, StatsScreen, TagScreen, DrillScreen } from './screens/Drills'
import { SettingsScreen } from './screens/Settings'
import { PathHome, SubjectPath, LessonScreen, WriteHome, WriteMixedScreen } from './screens/Path'
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

function AppUpdateBanner() {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null)
  const [closed, setClosed] = useState(() => sessionStorage.getItem('gzzk.appUpdate.skip') !== null)

  useEffect(() => {
    if (closed) return
    let alive = true
    void (async () => {
      const r = await fetchAppUpdate()
      if (!alive || !r?.version) return
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
          sessionStorage.setItem('gzzk.appUpdate.skip', '1')
          setClosed(true)
        }}
      >
        以后
      </button>
      <button
        className="btn sm primary"
        onClick={() => {
          if (info.url) window.open(info.url, '_blank', 'noopener')
        }}
      >
        去更新
      </button>
    </div>
  )
}

function RandomScreen() {
  const [, nav] = useRoute()
  const ids = useMemo(() => {
    const key = 'gzzk.random.seed.' + new Date().toDateString()
    const saved = sessionStorage.getItem(key)
    if (saved) return JSON.parse(saved) as string[]
    return []
  }, [])
  const [qids, setQids] = useState<string[]>(ids)
  const [items, setItems] = useState<Awaited<ReturnType<typeof loadQuestionsByIds>> | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      let list = qids
      if (!list.length) {
        const all = await loadQuestions()
        const pool = [...all]
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        list = pool.slice(0, 10).map((q) => q.id)
        sessionStorage.setItem('gzzk.random.seed.' + new Date().toDateString(), JSON.stringify(list))
        if (alive) setQids(list)
      }
      const loaded = await loadQuestionsByIds(list)
      if (alive) setItems(loaded)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!items) return <div className="empty">正在抽题…</div>
  return (
    <QuizScreen
      title="随机练 10 道"
      subtitle="各科混合"
      items={items}
      mode="practice"
      onExit={() => nav('/')}
      onRestart={() => {
        sessionStorage.removeItem('gzzk.random.seed.' + new Date().toDateString())
        nav('/review')
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
      page = <PracticeScreen pid={parts[1]} start={Number(params.get('start') ?? 0)} mode="practice" />
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
      <AppUpdateBanner />
      <UpdateBanner />
      {page}
      {!isQuiz && <Nav route={path} />}
    </>
  )
}
