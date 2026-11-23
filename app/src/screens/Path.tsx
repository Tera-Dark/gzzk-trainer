import { useEffect, useMemo, useState } from 'react'
import type { Subject } from '../lib/types'
import { loadIndex, loadQuestions, loadQuestionsByIds, loadTags, SUBJECTS, subjectColor, subjectName, type LoadedQ } from '../lib/data'
import * as db from '../lib/db'
import { go, useDB, useRoute } from '../ui'
import { QuizScreen } from './Quiz'

/** 手写/默写最该练的考点 */
export const WRITE_TAGS: { s: Subject; tag: string; hint: string }[] = [
  { s: 'chinese', tag: '古诗文默写', hint: '默写不能提笔忘字' },
  { s: 'chinese', tag: '字形', hint: '错别字最吃亏' },
  { s: 'english', tag: '单词拼写', hint: '拼写要落到纸上' },
  { s: 'chemistry', tag: '化学方程式', hint: '方程式要会手写配平' },
  { s: 'chemistry', tag: '化学式与化合价', hint: '元素符号别写错' },
  { s: 'math', tag: '分式与根式', hint: '公式与步骤手写' },
]

function pickForTag(tag: string, n = 8, nonChoice = false): Promise<LoadedQ[]> {
  return loadQuestions().then((all) => {
    // 手写专项只挑能写出来的题；选择题进去也只能点 ABCD
    const pool = all.filter((q) => q.g?.includes(tag) && q.a !== 0 && (!nonChoice || q.t !== 'choice'))
    const fresh = pool.filter((q) => !db.srsCard(q.id))
    const seen = pool.filter((q) => db.srsCard(q.id))
    // 未做过的优先；做过的按错误次数排序
    seen.sort((a, b) => (db.srsCard(b.id)?.lapses ?? 0) - (db.srsCard(a.id)?.lapses ?? 0))
    const ids = [...fresh, ...seen].slice(0, n).map((q) => q.id)
    return loadQuestionsByIds(ids)
  })
}

function Crowns({ n }: { n: number }) {
  return (
    <span className="crowns" title={`掌握度 ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''} />
      ))}
    </span>
  )
}

/* ---------------- 学习路径：首页 ---------------- */

export function PathHome() {
  useDB()
  const tags = useAsync(loadTags, [])
  // 题数按 index 口径统计（与首页/题库一致），不为计数去拉整份 questions.json
  const index = useAsync(loadIndex, [])
  return (
    <div className="app">
      <div className="pageHead">
        <div>
          <h1>学习路径</h1>
          <div className="sub">按考点一关一关打，每题都能打字或手写对照</div>
        </div>
      </div>

      <div className="card tight">
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>怎么用</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.85 }}>
          选一个考点 → 8 道题一关 → 做错和半对的题本轮末尾再来一次 → 正确率 80% 以上算过关，掌握度加一星。
          五个星全亮就是这一块真的拿住了。
        </div>
      </div>

      {SUBJECTS.map((sub) => {
        const list = tags?.[sub.key] ?? []
        if (!list.length) return null
        const total = index?.filter((p) => p.subject === sub.key).reduce((n, p) => n + p.count, 0) ?? 0
        const done = db.subjectStats(sub.key).covered
        return (
          <button key={sub.key} className="card pathCard" onClick={() => go(`/path/${sub.key}`)}>
            <div className="name">
              <span className="dot" style={{ background: sub.color }} />
              {sub.name}
              <span className="grow" />
              <span className="tiny muted" style={{ fontWeight: 400, whiteSpace: 'nowrap' }}>
                {done}/{total} 题
              </span>
              <span className="chev">›</span>
            </div>
            <div className="bar">
              <i style={{ width: `${total ? Math.min(100, (done / total) * 100) : 0}%`, background: sub.color }} />
            </div>
          </button>
        )
      })}

      <div className="card" onClick={() => go('/write')} style={{ cursor: 'pointer' }}>
        <div className="cardTitle">✍️ 手写专项</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          默写、拼写、化学式这些必须写出来的东西，单独练一轮。可以在屏幕上写，也可以拿纸笔写后对答案。
        </div>
      </div>

      <div className="card" onClick={() => go('/writing')} style={{ cursor: 'pointer' }}>
        <div className="cardTitle">📝 写作素材</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          语文、英语作文的结构与素材，道法、历史小论文的论点论据与范文，考前翻两遍就够用。
        </div>
      </div>
    </div>
  )
}

/* ---------------- 学习路径：单科考点列表 ---------------- */

function TagRow({
  subject,
  name,
  count,
  done,
  wrong,
  mastery,
  color,
  muted,
}: {
  subject: Subject
  name: string
  count: number
  done: number
  wrong: number
  mastery: number
  color: string
  muted?: boolean
}) {
  const open = () => go(`/lesson/${subject}/${encodeURIComponent(name)}`)
  return (
    <div
      className="row"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      style={{ cursor: 'pointer', opacity: muted ? 0.78 : 1 }}
    >
      <div className="grow">
        <div className="t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {name}
          <Crowns n={mastery} />
        </div>
        <div className="d">
          {count} 题 · 已做 {done}
          {wrong > 0 ? ` · 其中 ${wrong} 题还没拿下` : ''}
        </div>
      </div>
      <span className="startBtn" style={{ background: color }}>
        开始
      </span>
    </div>
  )
}

export function SubjectPath({ subject }: { subject: Subject }) {
  useDB()
  const tags = useAsync(loadTags, [])
  const flat = useAsync(loadQuestions, [])
  const color = subjectColor(subject)
  const list = tags?.[subject] ?? []
  // 题量不足 4 题的考点凑不成一关（涨星要 4 题以上），单独折起来
  const main = list.filter((t) => t.count >= 4)
  const rest = list.filter((t) => t.count < 4)
  const [showRest, setShowRest] = useState(false)
  const byTag = useMemo(() => {
    const m = new Map<string, { total: number; done: number; wrong: number }>()
    for (const q of flat ?? []) {
      if (q.s !== subject) continue
      for (const t of q.g ?? []) {
        const e = m.get(t) ?? { total: 0, done: 0, wrong: 0 }
        e.total += 1
        const c = db.srsCard(q.id)
        if (c?.seen) {
          e.done += 1
          if (c.last === 'wrong' || c.last === 'half') e.wrong += 1
        }
        m.set(t, e)
      }
    }
    return m
  }, [flat, subject])

  return (
    <div className="app">
      <div className="pageHead">
        <button className="iconBtn" onClick={() => go('/path')}>
          ‹
        </button>
        <div>
          <h1>{subjectName(subject)}</h1>
          <div className="sub">
            {main.length} 个考点 · 点一个开始 8 题一关{rest.length ? `（另有 ${rest.length} 个零散考点）` : ''}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '4px 14px' }}>
        {main.map((t) => {
          const st = byTag.get(t.name) ?? { total: t.count, done: 0, wrong: 0 }
          return (
            <TagRow
              key={t.name}
              subject={subject}
              name={t.name}
              count={t.count}
              done={st.done}
              wrong={st.wrong}
              mastery={db.masteryOf(subject + '|' + t.name)}
              color={color}
            />
          )
        })}
      </div>

      {rest.length > 0 && (
        <>
          <button className="btn wide" style={{ marginTop: 10 }} onClick={() => setShowRest((v) => !v)}>
            {showRest ? '收起零散考点' : `零散考点 ${rest.length} 个（题量不足一关，可单题练）`}
          </button>
          {showRest && (
            <div className="card" style={{ padding: '4px 14px', marginTop: 10 }}>
              {rest.map((t) => {
                const st = byTag.get(t.name) ?? { total: t.count, done: 0, wrong: 0 }
                return (
                  <TagRow
                    key={t.name}
                    subject={subject}
                    name={t.name}
                    count={t.count}
                    done={st.done}
                    wrong={st.wrong}
                    mastery={db.masteryOf(subject + '|' + t.name)}
                    color={color}
                    muted
                  />
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- 关卡 ---------------- */

export function LessonScreen({ subject, tag, write }: { subject: Subject; tag: string; write?: boolean }) {
  const [, nav] = useRoute()
  const [items, setItems] = useState<LoadedQ[] | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let alive = true
    setItems(null)
    pickForTag(tag, 8, !!write).then((r) => alive && setItems(r))
    return () => {
      alive = false
    }
  }, [tag, write, round])

  if (!items) return <div className="empty">正在准备这一关…</div>
  if (!items.length) {
    return (
      <div className="app noNav">
        <div className="empty">这个考点暂时没有题目。</div>
        <button className="btn wide" onClick={() => nav(`/path/${subject}`)}>
          返回
        </button>
      </div>
    )
  }
  return (
    <QuizScreen
      title={tag}
      subtitle={`${subjectName(subject)} · 关卡`}
      items={items}
      mode="practice"
      tag={subject + '|' + tag}
      inputMode={write ? 'write' : undefined}
      onExit={() => nav(`/path/${subject}`)}
      onRestart={() => setRound((r) => r + 1)}
    />
  )
}

/* ---------------- 手写专项 ---------------- */

export function WriteHome() {
  useDB()
  const tags = useAsync(loadTags, [])
  return (
    <div className="app">
      <div className="pageHead">
        <button className="iconBtn" onClick={() => go('/path')}>
          ‹
        </button>
        <div>
          <h1>手写专项</h1>
          <div className="sub">防止「会做但写不出来」</div>
        </div>
      </div>

      <div className="card tight">
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.85 }}>
          每道题有三个模式：<b>打字作答</b>（自动对照，最快）、<b>手写</b>（在屏幕上写）、<b>纸笔</b>（拿笔在本子上写，计时）。
          默写和拼写建议至少隔天用纸笔过一遍。
        </div>
      </div>

      <div className="card" style={{ padding: '4px 14px' }}>
        {WRITE_TAGS.map((w) => {
          const n = tags?.[w.s]?.find((t) => t.name === w.tag)?.count ?? 0
          if (!n) return null
          const m = db.masteryOf(w.s + '|' + w.tag)
          return (
            <div
              className="row"
              key={w.s + w.tag}
              onClick={() => go(`/write/${w.s}/${encodeURIComponent(w.tag)}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="grow">
                <div className="t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {w.tag}
                  <span className="pill">{subjectName(w.s)}</span>
                  <Crowns n={m} />
                </div>
                <div className="d">
                  {n} 题 · {w.hint}
                </div>
              </div>
              <span className="startBtn">写</span>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="cardTitle">混合一轮</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
          从上面这些考点里各抽几道，拼成 10 道手写题。
        </div>
        <button className="btn primary wide" onClick={() => go('/write/mixed')}>
          开始手写 10 题
        </button>
      </div>
    </div>
  )
}

export function WriteMixedScreen() {
  const [, nav] = useRoute()
  const [items, setItems] = useState<LoadedQ[] | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const all = await loadQuestions()
      const ids: string[] = []
      for (const w of WRITE_TAGS) {
        const pool = all.filter((q) => q.g?.includes(w.tag) && q.a !== 0 && q.t !== 'choice' && !ids.includes(q.id))
        pool.sort(() => Math.random() - 0.5)
        ids.push(...pool.slice(0, 2).map((q) => q.id))
      }
      const loaded = await loadQuestionsByIds(ids.slice(0, 10))
      if (alive) setItems(loaded)
    })()
    return () => {
      alive = false
    }
  }, [])
  if (!items) return <div className="empty">正在抽题…</div>
  if (!items.length) return null
  return (
    <QuizScreen
      title="手写 10 题"
      subtitle="默写 · 拼写 · 化学用语"
      items={items}
      mode="practice"
      inputMode="write"
      onExit={() => nav('/write')}
    />
  )
}

/* ---------------- 小工具 ---------------- */

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    fn()
      .then((r) => alive && setV(r))
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

export { Crowns, useAsync }
