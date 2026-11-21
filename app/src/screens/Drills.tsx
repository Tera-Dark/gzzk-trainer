import { useMemo, useState } from 'react'
import type { Subject } from '../lib/types'
import { previewText } from '../lib/md'
import { loadIndex, loadPaper, loadQuestions, loadQuestionsByIds, SUBJECTS, subjectName } from '../lib/data'
import * as db from '../lib/db'
import { go, pct, useDB, useRoute } from '../ui'
import { QuizScreen } from './Quiz'
import { useEffect } from 'react'

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    setV(null)
    fn().then((r) => alive && setV(r)).catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

export function ReviewScreen() {
  const [, nav] = useRoute()
  const ids = useMemo(() => db.dueIds(), [])
  const items = useAsync(() => loadQuestionsByIds(ids), [])
  if (!items) return <div className="empty">加载复习卡片…</div>
  if (items.length === 0) {
    return (
      <div className="app noNav">
        <div className="pageHead">
          <button className="iconBtn" onClick={() => nav('/')}>
            ‹
          </button>
          <h1>今日复习</h1>
        </div>
        <div className="empty">
          今天没有到期的复习卡片。
          <br />
          做错的题会在 1 / 2 / 4 / 7 / 15 天后自动回到这里。
        </div>
        <button className="btn wide primary" onClick={() => nav('/practice-random')}>
          随机练 10 道
        </button>
      </div>
    )
  }
  return (
    <QuizScreen
      title="今日复习"
      subtitle={`${items.length} 张到期卡片`}
      items={items}
      mode="review"
      onExit={() => nav('/')}
      onRestart={() => nav('/review')}
    />
  )
}

export function DrillScreen({ pid, nos, qids }: { pid?: string; nos?: string; qids?: string }) {
  const [, nav] = useRoute()
  const paper = useAsync(() => (pid ? loadPaper(pid) : Promise.resolve(null)), [pid])
  const byIds = useAsync(() => (qids ? loadQuestionsByIds(qids.split(',').filter(Boolean)) : Promise.resolve(null)), [qids])

  if (qids) {
    if (!byIds) return <div className="empty">加载中…</div>
    return (
      <QuizScreen
        title="错题重做"
        subtitle={`${byIds.length} 道`}
        items={byIds}
        mode="mistakes"
        onExit={() => nav('/mistakes')}
      />
    )
  }
  if (!paper) return <div className="empty">加载中…</div>
  const want = (nos ?? '').split(',').filter(Boolean).map(Number)
  const items = paper.questions
    .filter((q) => (want.length ? want.includes(q.no) : true))
    .map((q) => ({ q, paper, context: q.contextId ? paper.contexts.find((c) => c.id === q.contextId) : undefined }))
  return (
    <QuizScreen
      title={`${paper.title} · 错题`}
      subtitle={`${items.length} 道`}
      items={items}
      mode="mistakes"
      onExit={() => nav('/mistakes')}
    />
  )
}

export function TagScreen({ subject, tag }: { subject: Subject; tag: string }) {
  const [, nav] = useRoute()
  const flat = useAsync(loadQuestions, [])
  const index = useAsync(loadIndex, [])
  const papers = useAsync(async () => {
    const idx = await loadIndex()
    const list = idx.filter((p) => p.subject === subject)
    const loaded = await Promise.all(list.map((p) => loadPaper(p.id)))
    return loaded
  }, [subject])

  const items = useMemo(() => {
    if (!papers) return []
    const out: { q: (typeof papers)[number]['questions'][number]; paper: (typeof papers)[number] }[] = []
    for (const p of papers) {
      for (const q of p.questions) {
        if ((q.tags ?? []).includes(tag)) out.push({ q, paper: p })
      }
    }
    return out.sort((a, b) => b.paper.year - a.paper.year)
  }, [papers])

  if (!papers || !flat || !index) return <div className="empty">加载专项题目…</div>
  if (items.length === 0) {
    return (
      <div className="app noNav">
        <div className="empty">这个考点下暂时没有题目。</div>
        <button className="btn wide" onClick={() => nav(`/subject/${subject}`)}>
          返回
        </button>
      </div>
    )
  }
  return (
    <QuizScreen
      title={`${subjectName(subject)} · ${tag}`}
      subtitle={`近 10 年 ${items.length} 道`}
      items={items.map((x) => ({ q: x.q, paper: x.paper, context: x.q.contextId ? x.paper.contexts.find((c) => c.id === x.q.contextId) : undefined }))}
      mode="practice"
      onExit={() => nav(`/subject/${subject}`)}
      onRestart={() => nav(`/tag/${subject}/${encodeURIComponent(tag)}`)}
    />
  )
}

export function MistakesScreen() {
  const state = useDB()
  const [sub, setSub] = useState<Subject | 'all'>('all')
  const [mode, setMode] = useState<'wrong' | 'star'>('wrong')
  const ids = useMemo(() => {
    if (mode === 'star') {
      const marks = db.bookmarks()
      return sub === 'all' ? marks : marks.filter((id) => id.startsWith(sub === 'politics' ? 'politics' : sub))
    }
    const all: string[] = []
    if (sub === 'all') {
      for (const s of SUBJECTS) all.push(...db.wrongIds(s.key))
    } else all.push(...db.wrongIds(sub))
    return all
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, mode, state.attempts.length, state.bookmarks.length])
  const items = useAsync(() => loadQuestionsByIds(ids), [ids.join(',')])
  const [, nav] = useRoute()

  const grouped = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items ?? []) m.set(it.paper.subject, (m.get(it.paper.subject) ?? 0) + 1)
    return m
  }, [items])

  return (
    <div className="app">
      <div className="pageHead">
        <div>
          <h1>{mode === 'wrong' ? '错题本' : '收藏夹'}</h1>
          <div className="sub">{mode === 'wrong' ? '做错和半对的题自动收进来，重做对才移出' : '做题时点右上角书签收藏的题'}</div>
        </div>
      </div>

      <div className="seg">
        <button className={mode === 'wrong' ? 'on' : ''} onClick={() => setMode('wrong')}>
          错题本
        </button>
        <button className={mode === 'star' ? 'on' : ''} onClick={() => setMode('star')}>
          收藏（{db.bookmarks().length}）
        </button>
      </div>

      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${sub === 'all' ? 'on' : ''}`} onClick={() => setSub('all')}>
          全部 <span className="n">{items?.length ?? 0}</span>
        </button>
        {SUBJECTS.map((s) => (
          <button key={s.key} className={`chip ${sub === s.key ? 'on' : ''}`} onClick={() => setSub(s.key)}>
            {s.name}
            <span className="n">{db.wrongIds(s.key).length}</span>
          </button>
        ))}
      </div>

      {!items ? (
        <div className="empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          {mode === 'wrong' ? (
            <>
              这一栏还没有错题。
              <br />
              做完卷子会自动收集到这里。
            </>
          ) : (
            <>
              还没有收藏的题。
              <br />
              做题时点右上角的书签就会出现在这里。
            </>
          )}
        </div>
      ) : (
        <>
          <button className="btn wide primary" onClick={() => nav(`/drill?qids=${items.map((i) => i.q.id).join(',')}`)}>
            {mode === 'wrong' ? `重做这 ${items.length} 道错题` : `刷这 ${items.length} 道收藏题`}
          </button>
          <div className="card" style={{ marginTop: 12, padding: '4px 16px' }}>
            {items.map((it) => {
              const card = db.srsCard(it.q.id)
              return (
                <div className="row" key={it.q.id}>
                  <span className="dot" style={{ background: it.paper.color }} />
                  <div
                    className="grow"
                    onClick={() =>
                      nav(`/practice/${it.paper.id}?start=${Math.max(0, it.paper.questions.findIndex((x) => x.id === it.q.id))}`)
                    }
                  >
                    <div className="t" style={{ fontSize: 14 }}>
                      {it.paper.year} {it.paper.subjectName} · 第 {it.q.no} 题
                    </div>
                    <div className="d">
                      {previewText(it.q.stem, 40)}
                    </div>
                  </div>
                  {card && <span className={`pill ${card.last === 'right' ? 'ok' : card.last === 'half' ? 'warn' : 'bad'}`}>{card.lapses} 次</span>}
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      db.record(it.q.id, it.paper.subject, it.paper.id, 'right', 'review', undefined, it.q.tags?.[0])
                      nav('/mistakes')
                    }}
                  >
                    已掌握
                  </button>
                </div>
              )
            })}
          </div>
          {grouped.size > 0 && (
            <div className="card">
              <div className="cardTitle">分布</div>
              {[...grouped.entries()].map(([s, n]) => (
                <div className="tagRow" key={s}>
                  <span className="name">{subjectName(s)}</span>
                  <div className="bar">
                    <i style={{ width: `${(n / items.length) * 100}%` }} />
                  </div>
                  <span className="num">{n}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function StatsScreen() {
  const state = useDB()
  const flat = useAsync(loadQuestions, [])
  const [range, setRange] = useState<'all' | '30' | '7'>('all')

  const since = range === 'all' ? 0 : Date.now() - Number(range) * 86400000
  const attempts = state.attempts.filter((a) => a.ts >= since)

  const overall = useMemo(() => {
    let r = 0
    let h = 0
    let w = 0
    for (const a of attempts) {
      if (a.grade === 'right') r += 1
      else if (a.grade === 'half') h += 1
      else if (a.grade === 'wrong') w += 1
    }
    const n = r + h + w
    return { r, h, w, n, acc: n ? (r + h * 0.5) / n : 0 }
  }, [attempts])

  const tags = useMemo(() => {
    const m = new Map<string, { r: number; w: number; s: Subject }>()
    for (const a of attempts) {
      if (!a.tag) continue
      const cur = m.get(`${a.s}|${a.tag}`) ?? { r: 0, w: 0, s: a.s }
      if (a.grade === 'right') cur.r += 1
      else if (a.grade === 'wrong' || a.grade === 'half') cur.w += 1
      m.set(`${a.s}|${a.tag}`, cur)
    }
    return [...m.entries()]
      .map(([k, v]) => ({ tag: k.split('|')[1], ...v, n: v.r + v.w, rate: v.w / Math.max(1, v.r + v.w) }))
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.rate * Math.log(1 + b.n) - a.rate * Math.log(1 + a.n))
      .slice(0, 12)
  }, [attempts])

  const exams = state.exams.slice(-12)
  const maxScore = Math.max(1, ...exams.map((e) => e.total))

  const streak = useMemo(() => {
    const days = new Set(state.attempts.map((a) => db.dayStart(a.ts)))
    let n = 0
    let d = db.dayStart()
    while (days.has(d)) {
      n += 1
      d -= 86400000
    }
    return n
  }, [state.attempts])

  return (
    <div className="app">
      <div className="pageHead">
        <div>
          <h1>数据</h1>
          <div className="sub">只看做题过程，不猜测</div>
        </div>
      </div>

      <div className="seg">
        <button className={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>
          全部
        </button>
        <button className={range === '30' ? 'on' : ''} onClick={() => setRange('30')}>
          近 30 天
        </button>
        <button className={range === '7' ? 'on' : ''} onClick={() => setRange('7')}>
          近 7 天
        </button>
      </div>

      <div className="card">
        <div className="statRow">
          <div>
            <div className="v">{overall.n}</div>
            <div className="k">作答次数</div>
          </div>
          <div>
            <div className="v" style={{ color: 'var(--ok)' }}>
              {pct(overall.acc)}
            </div>
            <div className="k">正确率</div>
          </div>
          <div>
            <div className="v">{streak}</div>
            <div className="k">连续天数</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="statRow">
          <div>
            <div className="v">{(() => {
              const ms = state.attempts.reduce((n, a) => n + (a.ms ?? 0), 0)
              return ms > 3600000 ? `${(ms / 3600000).toFixed(1)}` : `${Math.round(ms / 60000)}`
            })()}</div>
            <div className="k">{state.attempts.reduce((n, a) => n + (a.ms ?? 0), 0) > 3600000 ? '累计投入（小时）' : '累计投入（分钟）'}</div>
          </div>
          <div>
            <div className="v">{state.exams.length}</div>
            <div className="k">模考次数</div>
          </div>
          <div>
            <div className="v">{(() => {
              const withTime = state.attempts.filter((a) => a.ms && a.ms > 3000)
              if (!withTime.length) return '—'
              return `${Math.round(withTime.reduce((n, a) => n + (a.ms ?? 0), 0) / withTime.length / 1000)}s`
            })()}</div>
            <div className="k">平均每题</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">分科掌握</div>
        {SUBJECTS.map((s) => {
          const st = db.subjectStats(s.key)
          const count = (flat ?? []).filter((q) => q.s === s.key).length
          return (
            <div className="tagRow" key={s.key}>
              <span className="dot" style={{ background: s.color }} />
              <span className="name">{s.name}</span>
              <div className="bar">
                <i style={{ width: `${Math.min(100, st.accuracy * 100)}%`, background: s.color }} />
              </div>
              <span className="num">
                {st.total ? pct(st.accuracy) : '—'}
                <span style={{ display: 'block', fontSize: 10 }}>{count ? `${st.covered}/${count}` : ''}</span>
              </span>
            </div>
          )
        })}
      </div>

      {exams.length > 1 && (
        <div className="card">
          <div className="cardTitle">模考走势（最近 {exams.length} 次）</div>
          <svg viewBox={`0 0 ${exams.length * 26} 70`} style={{ width: '100%', height: 90 }}>
            {exams.map((e, i) => {
              const h = (e.score / maxScore) * 62
              return (
                <g key={i}>
                  <rect x={i * 26 + 5} y={66 - h} width={14} height={h} rx={4} fill={e.score / e.total >= 0.8 ? '#10b981' : '#93c5fd'} />
                  <text x={i * 26 + 12} y={64} fontSize={7} textAnchor="middle" fill="#98a2b3">
                    {String(e.pid).slice(-2)}
                  </text>
                </g>
              )
            })}
          </svg>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            最高 {Math.max(...exams.map((e) => Math.round((e.score / e.total) * 100)))}% · 最近{' '}
            {Math.round((exams[exams.length - 1].score / exams[exams.length - 1].total) * 100)}%
          </div>
        </div>
      )}

      <div className="card">
        <div className="cardTitle">最该补的考点</div>
        {tags.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
            做题超过 2 道后，这里会按考点列出错误率最高的地方，点进去就能专项练。
          </div>
        ) : (
          tags.map((t) => (
            <div className="tagRow" key={t.s + t.tag} onClick={() => go(`/tag/${t.s}/${encodeURIComponent(t.tag)}`)} style={{ cursor: 'pointer' }}>
              <span className="dot" style={{ background: SUBJECTS.find((x) => x.key === t.s)?.color }} />
              <span className="name">{t.tag}</span>
              <div className="bar">
                <i style={{ width: `${Math.min(100, t.rate * 100)}%`, background: 'var(--bad)' }} />
              </div>
              <span className="num">{t.n} 题</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="cardTitle">模考记录</div>
        {state.exams.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
            还没有模考。整卷模考会按真实时长计时，交卷后给出估分——用来观察趋势，不等于真实考试分数。
          </div>
        ) : (
          [...state.exams]
            .reverse()
            .slice(0, 8)
            .map((e, i) => (
              <div className="row" key={i}>
                <div className="grow">
                  <div className="t" style={{ fontSize: 14 }}>
                    {e.pid.split('-')[1]} 年 {subjectName(e.s)}
                  </div>
                  <div className="d">
                    {new Date(e.ts).toLocaleDateString('zh-CN')} · 对 {e.rightCount} · 半 {e.halfCount} · 错 {e.wrongCount}
                  </div>
                </div>
                <span className="pill">{e.score} / {e.total}</span>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
