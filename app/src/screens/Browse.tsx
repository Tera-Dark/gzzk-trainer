import { useEffect, useMemo, useState } from 'react'
import type { Paper, Subject } from '../lib/types'
import { loadIndex, loadPaper, loadQuestions, SUBJECTS, subjectColor, subjectName } from '../lib/data'
import { previewText } from '../lib/md'
import * as db from '../lib/db'
import { daysBetween, go, pct, Stat, useDB, useRoute } from '../ui'
import { QuizScreen } from './Quiz'
import { ExamScreen } from './Exam'

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    fn().then((r) => alive && setV(r)).catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

export function Home() {
  useDB()
  const index = useAsync(loadIndex, [])
  const flat = useAsync(loadQuestions, [])
  const s = db.settings()
  const today = db.todayStats()
  const due = db.dueCount()
  const last = db.lastQuestion()
  const target = new Date(s.examDate + 'T00:00:00').getTime()
  const days = daysBetween(Date.now(), target)
  const lv = db.levelInfo()
  const xpDay = db.xpToday()
  const goalPct = Math.min(100, Math.round((xpDay / Math.max(20, s.dailyGoal * 5)) * 100))
  const streak = db.streakDays()

  const bySubject = useMemo(() => {
    if (!flat) return []
    return SUBJECTS.map((sub) => {
      const qs = flat.filter((q) => q.s === sub.key)
      const st = db.subjectStats(sub.key)
      return { ...sub, count: qs.length, covered: st.covered, accuracy: st.accuracy, total: st.total }
    })
  }, [flat, today.count])

  return (
    <div className="app">
      <div className="pageHead">
        <div>
          <h1>真题训练台</h1>
          <div className="sub">广州中考 · 2017–2026 全科真题</div>
        </div>
        <div className="lvlChip" onClick={() => go('/stats')}>
          <b>Lv.{lv.level}</b>
          <span>{db.xpTotal()} XP</span>
        </div>
      </div>

      <div className="hero">
        <div className="day">距 {new Date(s.examDate).getFullYear()} 年广州中考</div>
        <div className="big">
          {days > 0 ? days : 0}
          <small>天</small>
        </div>
        <div className="row">
          <div>
            <b>
              {today.count}
              <span style={{ fontSize: 12, fontWeight: 500 }}> / {s.dailyGoal}</span>
            </b>
            今日已练
          </div>
          <div>
            <b>{due}</b>
            待复习
          </div>
          <div>
            <b>{Math.round((today.count ? today.right / today.count : 0) * 100)}%</b>
            今日正确率
          </div>
        </div>
      </div>

      <div className="card tight dailyCard">
        <div className="dailyTop">
          <span>
            今日 {xpDay} XP
            <span className="tiny muted"> / 目标 {Math.max(20, s.dailyGoal * 5)}</span>
          </span>
          <span className="tiny muted">连续 {streak} 天</span>
        </div>
        <div className="dailyBar">
          <i style={{ width: `${goalPct}%` }} />
        </div>
      </div>

      <div className="grid c2" style={{ marginTop: 10 }}>
        <button className="entryCard" onClick={() => go('/path')}>
          <div className="ico">🧭</div>
          <div className="t">学习路径</div>
          <div className="d">按考点一关 8 题</div>
        </button>
        <button className="entryCard" onClick={() => go('/write')}>
          <div className="ico">✍️</div>
          <div className="t">手写专项</div>
          <div className="d">默写 · 拼写 · 化学式</div>
        </button>
      </div>

      {(due > 0 || last) && (
        <div className="card tight" style={{ display: 'flex', gap: 10 }}>
          {due > 0 && (
            <button className="btn primary" style={{ flex: 1 }} onClick={() => go('/review')}>
              复习 {due} 张到期卡片
            </button>
          )}
          {last && (
            <button className="btn" style={{ flex: 1 }} onClick={() => go(`/practice/${last.pid}?start=${last.no}`)}>
              继续上次
            </button>
          )}
        </div>
      )}

      {today.count === 0 && due === 0 && (
        <div className="card tight" style={{ borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>第一次用？这样开始</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9 }}>
            ① 选一科，点「练习」从最近一年的卷子开始逐题做；
            <br />
            ② 做错的题会自动进「错题本」，第二天再来重做；
            <br />
            ③ 周末用「模考」限时做一整套，看看能拿多少分。
          </div>
        </div>
      )}

      <div className="cardTitle" style={{ marginTop: 16 }}>
        按科目练
      </div>
      <div className="grid c2">
        {bySubject.map((sub) => {
          const papers = index?.filter((p) => p.subject === sub.key) ?? []
          const totalQ = sub.count
          return (
            <div key={sub.key} className="subCard" onClick={() => go(`/subject/${sub.key}`)} style={{ cursor: 'pointer' }}>
              <div className="name">
                <span className="dot" style={{ background: sub.color }} />
                {sub.name}
              </div>
              <div className="bar">
                <i style={{ width: `${totalQ ? Math.min(100, (sub.covered / totalQ) * 100) : 0}%`, background: sub.color }} />
              </div>
              <div className="meta">
                <span>
                  已做 {sub.covered}/{totalQ}
                </span>
                <span>{papers.length} 套卷</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="cardTitle">整卷模考</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SUBJECTS.map((sub) => {
            const papers = (index ?? []).filter((p) => p.subject === sub.key).sort((a, b) => b.year - a.year)
            const latest = papers[0]
            if (!latest) return null
            return (
              <button key={sub.key} className="chip" onClick={() => go(`/exam/${latest.id}`)}>
                {sub.name} {latest.year}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          点一下就开始计时，交卷自动判选择题并估算总分
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">数据一览</div>
        <div className="statRow">
          <Stat v={flat?.length ?? '—'} k="真题总题数" />
          <Stat v={index?.length ?? '—'} k="试卷套数" />
          <Stat v={db.exams().length} k="模考次数" />
        </div>
      </div>
    </div>
  )
}

export function Papers() {
  useDB()
  const index = useAsync(loadIndex, [])
  const flat = useAsync(loadQuestions, [])
  return (
    <div className="app">
      <div className="pageHead">
        <h1>题库</h1>
      </div>
      <div className="grid c2">
        {SUBJECTS.map((sub) => {
          const papers = (index ?? []).filter((p) => p.subject === sub.key)
          const count = (flat ?? []).filter((q) => q.s === sub.key).length
          const st = db.subjectStats(sub.key)
          return (
            <div key={sub.key} className="subCard" onClick={() => go(`/subject/${sub.key}`)} style={{ cursor: 'pointer' }}>
              <div className="name">
                <span className="dot" style={{ background: sub.color }} />
                {sub.name}
              </div>
              <div className="meta">
                <span>{count} 道题</span>
                <span>{papers.length} 套</span>
              </div>
              <div className="bar">
                <i style={{ width: `${count ? Math.min(100, (st.covered / count) * 100) : 0}%`, background: sub.color }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="cardTitle">说明</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          收录 2017–2026 年广州中考七科真题（含答案与解析）。整套卷可按「练习」逐题做、按「模考」计时做，也可以按考点专项练。
        </div>
      </div>
    </div>
  )
}

export function SubjectScreen({ subject }: { subject: Subject }) {
  useDB()
  const index = useAsync(loadIndex, [])
  const papers = useMemo(() => (index ?? []).filter((p) => p.subject === subject).sort((a, b) => b.year - a.year), [index, subject])
  const st = db.subjectStats(subject)
  const color = subjectColor(subject)
  return (
    <div className="app">
      <div className="pageHead">
        <button className="iconBtn" onClick={() => go('/papers')}>
          ‹
        </button>
        <div>
          <h1>{subjectName(subject)}</h1>
          <div className="sub">
            {papers.length} 套卷 · 已做 {st.covered} 题 · 正确率 {pct(st.accuracy)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="statRow">
          <Stat v={st.total} k="累计作答" />
          <Stat v={st.right} k="做对" />
          <Stat v={st.wrong} k="做错" />
        </div>
      </div>

      <div className="cardTitle">真题套卷</div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {papers.map((p) => (
          <div className="row" key={p.id}>
            <div style={{ flex: 1, minWidth: 0 }} onClick={() => go(`/paper/${p.id}`)}>
              <div className="t">
                {p.year} 年 <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· {p.count} 题 · {p.fullScore} 分</span>
              </div>
              <div className="d">{p.pages ? '扫描版 · 可看原卷' : p.withAnswer < p.count ? `有 ${p.count - p.withAnswer} 题缺解析` : '题目 + 解析齐全'}</div>
            </div>
            <button className="btn sm" onClick={() => go(`/practice/${p.id}`)}>
              练习
            </button>
            <button className="btn sm" style={{ color, borderColor: color }} onClick={() => go(`/exam/${p.id}`)}>
              模考
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PaperScreen({ pid }: { pid: string }) {
  useDB()
  const paper = useAsync<Paper>(() => loadPaper(pid), [pid])
  const [tab, setTab] = useState<'list' | 'pages' | 'ans'>('list')
  if (!paper) return <div className="empty">加载中…</div>
  const color = subjectColor(paper.subject)
  const doneCount = paper.questions.filter((q) => db.srsCard(q.id)?.seen).length
  const pages = paper.pages ?? []
  const ansPages = paper.answerPages ?? []
  return (
    <div className="app noNav">
      <div className="pageHead">
        <button className="iconBtn" onClick={() => go(`/subject/${paper.subject}`)}>
          ‹
        </button>
        <div>
          <h1 style={{ fontSize: 19 }}>{paper.title}</h1>
          <div className="sub">
            {paper.questions.length} 题 · 满分 {paper.fullScore} · {paper.durationMin} 分钟 · 已做 {doneCount}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={() => go(`/practice/${paper.id}`)}>
          逐题练习
        </button>
        <button className="btn" style={{ flex: 1, color, borderColor: color }} onClick={() => go(`/exam/${paper.id}`)}>
          整卷模考
        </button>
      </div>

      {(pages.length > 0 || ansPages.length > 0) && (
        <div className="seg" style={{ marginTop: 14 }}>
          <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
            题目列表
          </button>
          {pages.length > 0 && (
            <button className={tab === 'pages' ? 'on' : ''} onClick={() => setTab('pages')}>
              原卷（{pages.length}）
            </button>
          )}
          {ansPages.length > 0 && (
            <button className={tab === 'ans' ? 'on' : ''} onClick={() => setTab('ans')}>
              答案解析图（{ansPages.length}）
            </button>
          )}
        </div>
      )}

      {tab === 'pages' || tab === 'ans' ? (
        <div className="card">
          {(tab === 'pages' ? pages : ansPages).map((p, i) => (
            <img key={i} className="scanPage" src={`${import.meta.env.BASE_URL}assets/${p.url}`} alt={`第${i + 1}页`} style={{ marginBottom: 10 }} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 12, padding: '4px 16px' }}>
          {paper.questions.map((q, i) => {
            const card = db.srsCard(q.id)
            const g = card?.last
            return (
              <div className="row" key={q.id} onClick={() => go(`/practice/${paper.id}?start=${i}`)} style={{ cursor: 'pointer' }}>
                <span className="pill">{q.no}</span>
                <div className="grow">
                  <div className="d" style={{ marginTop: 0, color: 'var(--text)' }}>
                    {previewText(q.stem, 34)}
                  </div>
                  <div className="d">{q.tags?.join(' · ') || (q.type === 'choice' ? '选择题' : '主观题')}</div>
                </div>
                {g && <span className={`pill ${g === 'right' ? 'ok' : g === 'wrong' ? 'bad' : 'warn'}`}>{g === 'right' ? '对' : g === 'wrong' ? '错' : g === 'half' ? '半' : '过'}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PracticeScreen({ pid, start, mode }: { pid: string; start: number; mode: db.Mode }) {
  const paper = useAsync<Paper>(() => loadPaper(pid), [pid])
  const [, nav] = useRoute()
  if (!paper) return <div className="empty">加载中…</div>
  const items = paper.questions.map((q) => ({
    q,
    paper,
    context: q.contextId ? paper.contexts.find((c) => c.id === q.contextId) : undefined,
  }))
  return (
    <QuizScreen
      title={paper.title}
      subtitle={`${paper.year} 真题`}
      items={items}
      mode={mode}
      startIndex={Math.max(0, start)}
      onExit={() => nav(`/paper/${paper.id}`)}
    />
  )
}

export function ExamRoute({ pid }: { pid: string }) {
  const paper = useAsync<Paper>(() => loadPaper(pid), [pid])
  const [, nav] = useRoute()
  if (!paper) return <div className="empty">加载中…</div>
  if (paper.questions.length === 0) {
    return (
      <div className="app noNav">
        <div className="empty">这套卷子是扫描件，暂时只能看原卷图片。</div>
        <button className="btn wide" onClick={() => nav(`/paper/${paper.id}`)}>
          去看看
        </button>
      </div>
    )
  }
  return <ExamScreen paper={paper} onExit={() => nav(`/paper/${paper.id}`)} />
}
