import { useEffect, useMemo, useRef, useState } from 'react'
import type { Grade } from '../lib/types'
import type { LoadedQ } from '../lib/data'
import { QuestionView } from '../components/QuestionView'
import * as db from '../lib/db'
import { go } from '../ui'

interface Props {
  title: string
  subtitle?: string
  items: LoadedQ[]
  mode: db.Mode
  startIndex?: number
  onExit: () => void
  onRestart?: () => void
  /** 关卡：完成时回传结果，用于掌握度升级 */
  tag?: string
  inputMode?: 'type' | 'write' | 'pen'
  onFinish?: (res: { xp: number; right: number; total: number; acc: number }) => void
}

const XP_RIGHT = 10
const XP_HALF = 4
const XP_WRONG = 1
const XP_RETRY = 2

export function QuizScreen({ title, subtitle, items, mode, startIndex = 0, onExit, onRestart, tag, inputMode, onFinish }: Props) {
  const [queue, setQueue] = useState<LoadedQ[]>(() => items.slice(Math.min(startIndex, Math.max(0, items.length - 1))))
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [graded, setGraded] = useState<Grade | null>(null)
  const [done, setDone] = useState(false)
  const [marks, setMarks] = useState<Record<string, boolean>>({})
  const [tally, setTally] = useState({ right: 0, half: 0, wrong: 0, skip: 0 })
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [xp, setXp] = useState(0)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const t0 = useRef(Date.now())
  const retried = useRef<Set<string>>(new Set())

  const item = queue[idx]
  const total = queue.length

  useEffect(() => {
    setSelected(null)
    setRevealed(false)
    setGraded(null)
    t0.current = Date.now()
    window.scrollTo(0, 0)
  }, [idx])

  useEffect(() => {
    if (item) {
      setMarks((m) => (m[item.q.id] !== undefined ? m : { ...m, [item.q.id]: db.isBookmarked(item.q.id) }))
      if (mode === 'practice' && item.paper.id) db.setLast(item.paper.id, item.q.no)
    }
  }, [item, mode])

  const submit = (grade: Grade) => {
    if (!item || graded) return
    const first = !retried.current.has(item.q.id + ':done')
    // 跳过≠做错：不写记录，否则“错题重排后跳过”会把刚错的题从错题本里抹掉
    if (grade !== 'skip') {
      db.record(item.q.id, item.paper.subject, item.paper.id, grade, mode, Date.now() - t0.current, tag ?? item.q.tags?.[0])
    }
    retried.current.add(item.q.id + ':done')
    setGraded(grade)
    setTally((t) => ({ ...t, [grade]: t[grade] + 1 }))

    let gain = 0
    if (grade === 'right') {
      gain = first ? XP_RIGHT + Math.min(5, combo) : XP_RETRY
      setCombo((c) => {
        const n = c + 1
        setMaxCombo((m) => Math.max(m, n))
        return n
      })
    } else if (grade === 'half') {
      gain = first ? XP_HALF : XP_RETRY
      setCombo(0)
    } else if (grade === 'wrong') {
      gain = first ? XP_WRONG : 0
      setCombo(0)
    }
    if (gain > 0) {
      setXp((x) => x + gain)
      db.addXp(gain)
    }

    if (grade === 'right') {
      setFlash({ kind: 'ok', text: combo >= 2 ? `连对 ${combo + 1} 题！+${gain} XP` : `答对了 +${gain} XP` })
    } else if (grade === 'wrong') {
      setFlash({ kind: 'bad', text: '没关系，这题会再出现一次' })
    } else if (grade === 'half') {
      setFlash({ kind: 'bad', text: '半对，待会再过一遍' })
    } else {
      setFlash(null)
    }

    // 错了/半对 → 本轮末尾再来一次（每题最多一次）
    if ((grade === 'wrong' || grade === 'half') && !retried.current.has(item.q.id + ':requeue')) {
      retried.current.add(item.q.id + ':requeue')
      setQueue((qs) => [...qs, item])
    }
  }

  const onSelect = (k: string) => {
    if (graded || !item) return
    setSelected(k)
    if (!item.q.answerKey) {
      setRevealed(true)
      return
    }
    submit(k === item.q.answerKey ? 'right' : 'wrong')
  }

  const next = () => {
    setFlash(null)
    if (idx + 1 >= queue.length) {
      setDone(true)
      const answered = tally.right + tally.half + tally.wrong
      onFinish?.({ xp, right: tally.right, total: answered, acc: answered ? tally.right / answered : 0 })
      if (tag && answered >= 4 && tally.right / answered >= 0.8) db.bumpMastery(tag)
    } else setIdx(idx + 1)
  }

  const summary = useMemo(() => {
    const n = tally.right + tally.half + tally.wrong + tally.skip
    return { n, acc: n ? tally.right / n : 0 }
  }, [tally])

  if (!item) {
    return (
      <div className="app noNav">
        <div className="pageHead">
          <h1>{title}</h1>
        </div>
        <div className="empty">这里还没有题目。</div>
        <button className="btn wide" onClick={onExit}>
          返回
        </button>
      </div>
    )
  }

  if (done) {
    const acc = summary.n ? Math.round(summary.acc * 100) : 0
    return (
      <div className="app noNav">
        <div className="pageHead">
          <h1>{acc >= 80 ? '做得漂亮' : acc >= 50 ? '还行，再巩固一轮' : '这轮有点难'}</h1>
          <p>{mode === 'review' ? '复习完成' : mode === 'mistakes' ? '错题重做完成' : '本轮完成'}</p>
        </div>
        <div className="card xpCard">
          <div className="xpBig">+{xp} XP</div>
          <div className="statRow">
            <div>
              <div className="v" style={{ color: 'var(--ok)' }}>
                {tally.right}
              </div>
              <div className="k">做对</div>
            </div>
            <div>
              <div className="v" style={{ color: 'var(--warn)' }}>
                {tally.half}
              </div>
              <div className="k">半对</div>
            </div>
            <div>
              <div className="v" style={{ color: 'var(--bad)' }}>
                {tally.wrong}
              </div>
              <div className="k">做错</div>
            </div>
          </div>
          <div className="summaryLine">
            正确率 {acc}% · 最长连对 {maxCombo} 题 · 共 {summary.n} 题
            {tag && acc >= 80 && summary.n >= 4 ? ' · 该考点掌握度 +1' : ''}
          </div>
        </div>
        <div className="card">
          <div className="cardTitle">接着做什么</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {onRestart && (
              <button className="btn wide" onClick={onRestart}>
                再来一轮
              </button>
            )}
            <button className="btn wide" onClick={() => go('/mistakes')}>
              去错题本看看
            </button>
            <button className="btn wide primary" onClick={onExit}>
              返回
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app noNav">
      <div className="quizTop">
        <div className="line1">
          <button className="iconBtn" onClick={onExit} aria-label="退出">
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
            <div style={{ fontSize: 11.5 }}>
              {subtitle ? `${subtitle} · ` : ''}
              {idx + 1} / {total}
            </div>
          </div>
          {combo >= 2 && <span className="combo">🔥 {combo}</span>}
          <span className="pill">+{xp} XP</span>
        </div>
        <div className="progressLine">
          <i style={{ width: `${((idx + (graded ? 1 : 0)) / total) * 100}%` }} />
        </div>
      </div>

      <QuestionView
        item={item}
        index={idx}
        total={total}
        selected={selected}
        graded={graded}
        revealed={revealed}
        onSelect={onSelect}
        onReveal={() => setRevealed(true)}
        onGrade={(g) => submit(g)}
        onBookmark={() => {
          const on = db.toggleBookmark(item.q.id)
          setMarks((m) => ({ ...m, [item.q.id]: on }))
        }}
        bookmarked={!!marks[item.q.id]}
        inputMode={inputMode}
      />

      <div style={{ height: 96 }} />
      <div className="bottomBar">
        {graded === null ? (
          <>
            <button
              className="btn"
              onClick={() => {
                submit('skip')
                next()
              }}
            >
              跳过
            </button>
            {item.q.type === 'choice' && item.q.answerKey ? (
              <button
                className="btn primary"
                style={{ flex: 1 }}
                onClick={() => {
                  setRevealed(true)
                  submit('wrong')
                }}
              >
                不会，看解析
              </button>
            ) : revealed ? null : (
              <button className="btn primary" style={{ flex: 1 }} onClick={() => setRevealed(true)}>
                不会，直接看答案
              </button>
            )}
          </>
        ) : (
          <>
            {flash && <span className={'flash ' + flash.kind}>{flash.text}</span>}
            <button className="btn primary" style={{ flex: 1 }} onClick={next}>
              {idx + 1 >= total ? '完成本轮' : '继续'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
