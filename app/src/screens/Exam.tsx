import { useCallback, useEffect, useRef, useState } from 'react'
import type { Grade, Paper } from '../lib/types'
import { Md } from '../components/QuestionView'
import { previewText } from '../lib/md'
import { QuestionView } from '../components/QuestionView'
import * as db from '../lib/db'
import { fmtDur, go, Sheet, Stat } from '../ui'

type Phase = 'running' | 'grade' | 'result' | 'review'

export function ExamScreen({ paper, onExit }: { paper: Paper; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('running')
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [selfEval, setSelfEval] = useState<Record<string, Grade>>({})
  const [showPalette, setShowPalette] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{ score: number; total: number; right: number; half: number; wrong: number; skip: number } | null>(null)
  const endAt = useRef(Date.now() + paper.durationMin * 60000)
  const startedAt = useRef(Date.now())
  const submitted = useRef(false)

  const qs = paper.questions
  const q = qs[idx]
  const totalScore = paper.fullScore || qs.reduce((s, x) => s + (x.score ?? 0), 0) || 100

  const submit = useCallback(
    (auto = false) => {
      if (submitted.current) return
      submitted.current = true
      const ms = Date.now() - startedAt.current
      let score = 0
      let right = 0
      let half = 0
      let wrong = 0
      let skip = 0
      const per = totalScore / Math.max(1, qs.length)
      for (const item of qs) {
        const picked = answers[item.id]
        const isChoice = item.type === 'choice' && item.options.length >= 2 && item.answerKey
        let grade: Grade
        if (isChoice) grade = picked === item.answerKey ? 'right' : picked ? 'wrong' : 'skip'
        else if (selfEval[item.id]) grade = selfEval[item.id]
        else grade = picked || revealedIds.current.has(item.id) ? 'half' : 'skip'
        const w = item.score ?? per
        if (grade === 'right') {
          score += w
          right += 1
        } else if (grade === 'half') {
          score += w * 0.5
          half += 1
        } else if (grade === 'wrong') wrong += 1
        else skip += 1
        db.record(item.id, paper.subject, paper.id, grade, 'exam', undefined, item.tags?.[0])
      }
      const final = Math.round(score * 10) / 10
      setResult({ score: final, total: totalScore, right, half, wrong, skip })
      db.recordExam({
        pid: paper.id,
        s: paper.subject,
        ts: Date.now(),
        score: final,
        total: totalScore,
        autoScore: 0,
        rightCount: right,
        wrongCount: wrong,
        halfCount: half,
        ms,
      })
      setPhase('result')
      if (auto) setShowConfirm(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answers, selfEval, qs, totalScore, paper.id, paper.subject]
  )

  const revealedIds = useRef(new Set<string>())

  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => {
      const left = endAt.current - Date.now()
      setElapsed(Date.now() - startedAt.current)
      if (left <= 0) submit(true)
    }, 500)
    return () => clearInterval(t)
  }, [phase, submit])

  const nonChoice = qs.filter((x) => !(x.type === 'choice' && x.answerKey))
  const goGrade = () => {
    setShowConfirm(false)
    if (nonChoice.length > 0) setPhase('grade')
    else submit()
  }

  const left = Math.max(0, endAt.current - Date.now())
  const answeredCount = qs.filter((x) => (x.type === 'choice' ? answers[x.id] : revealedIds.current.has(x.id))).length

  if (phase === 'result' && result) {
    const wrongQs = qs.filter((x) => {
      const picked = answers[x.id]
      if (x.type === 'choice' && x.answerKey) return picked !== x.answerKey
      return (selfEval[x.id] ?? 'half') !== 'right'
    })
    return (
      <div className="app noNav">
        <div className="pageHead">
          <h1>交卷结果</h1>
          <div className="spacer" />
          <button className="btn sm" onClick={onExit}>
            完成
          </button>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>预估得分</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5, color: 'var(--accent)' }}>
            {result.score}
            <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 600 }}> / {result.total}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
            用时 {fmtDur(elapsed)} · 满分 {paper.fullScore} 分 · {paper.year} 年真题
          </div>
          <div className="statRow" style={{ marginTop: 16 }}>
            <Stat v={result.right} k="做对" />
            <Stat v={result.half} k="半对" />
            <Stat v={result.wrong + result.skip} k="做错/跳过" />
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">答题卡</div>
          <div className="palette">
            {qs.map((x) => {
              const picked = answers[x.id]
              const isChoice = x.type === 'choice' && x.answerKey
              const ok = isChoice ? picked === x.answerKey : (selfEval[x.id] ?? 'half') === 'right'
              return (
                <div key={x.id} className={`pCell ${ok ? 'right' : 'wrong'}`}>
                  {x.no}
                </div>
              )
            })}
          </div>
        </div>

        {wrongQs.length > 0 && (
          <div className="card">
            <div className="cardTitle">错题（{wrongQs.length}）</div>
            {wrongQs.slice(0, 12).map((x) => (
              <div className="row" key={x.id}>
                <span className="pill bad">第 {x.no} 题</span>
                <div className="grow">
                  <div className="d" style={{ marginTop: 0 }}>
                    {previewText(x.stem, 40)}
                  </div>
                </div>
              </div>
            ))}
            <button
              className="btn wide primary"
              style={{ marginTop: 10 }}
              onClick={() => go(`/drill/${paper.id}?ids=${wrongQs.map((x) => x.no).join(',')}`)}
            >
              重做这些错题
            </button>
          </div>
        )}

        <div className="card">
          <div className="cardTitle">逐题看解析</div>
          {qs.map((x, i) => (
            <div key={x.id} className="row" onClick={() => { setIdx(i); setPhase('review') }} style={{ cursor: 'pointer' }}>
              <span className="pill">第 {x.no} 题</span>
              <div className="grow">
                <div className="d" style={{ marginTop: 0 }}>
                  查看答案解析 ›
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (phase === 'review' && q) {
    const picked = answers[q.id]
    const isChoice = q.type === 'choice' && q.answerKey
    const g: Grade = isChoice
      ? picked === q.answerKey
        ? 'right'
        : picked
          ? 'wrong'
          : 'skip'
      : selfEval[q.id] ?? 'half'
    return (
      <div className="app noNav">
        <div className="pageHead">
          <button className="btn sm" onClick={() => setPhase('result')}>
            ‹ 返回
          </button>
          <div className="spacer" />
        </div>
        <QuestionView
          item={{ q, paper, context: q.contextId ? paper.contexts.find((c) => c.id === q.contextId) : undefined }}
          index={idx}
          total={qs.length}
          selected={picked ?? null}
          graded={g}
          revealed
          onSelect={() => {}}
          onReveal={() => {}}
          onGrade={() => {}}
          onBookmark={() => {}}
          bookmarked={false}
        />
        <div style={{ height: 20 }} />
      </div>
    )
  }

  if (phase === 'grade') {
    return (
      <div className="app noNav">
        <div className="pageHead">
          <h1>主观题自评</h1>
          <div className="spacer" />
          <button className="btn sm primary" onClick={() => submit()}>
            出分
          </button>
        </div>
        <div className="card tight">
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
            选择题已自动判分。下面 {nonChoice.length} 道非选择题，对照解析给自己打分（半对按 50% 计分）。
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="btn sm"
              onClick={() => setSelfEval(Object.fromEntries(nonChoice.map((x) => [x.id, 'right' as Grade])))}
            >
              全部算对
            </button>
            <button
              className="btn sm"
              onClick={() => setSelfEval(Object.fromEntries(nonChoice.map((x) => [x.id, 'wrong' as Grade])))}
            >
              全部算错
            </button>
          </div>
        </div>
        {nonChoice.map((x) => {
          const cur = selfEval[x.id] ?? 'half'
          return (
            <div className="card" key={x.id}>
              <div className="qMeta" style={{ marginBottom: 8 }}>
                <span className="pill">第 {x.no} 题</span>
                {x.score ? <span className="pill">{x.score} 分</span> : null}
                {x.tags?.slice(0, 2).map((t) => (
                  <span className="pill" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="md" style={{ fontSize: 15, maxHeight: 120, overflow: 'hidden' }}>
                <Md src={x.stemHtml || x.stem} />
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>看参考答案</summary>
                <div className="answerBox">
                  <Md src={x.answerHtml || x.answer || '（无答案）'} />
                  {x.analysis ? (
                    <div className="analysis" style={{ marginTop: 8 }}>
                      <Md src={x.analysisHtml || x.analysis} className="md analysis" />
                    </div>
                  ) : null}
                </div>
              </details>
              <div className="seg" style={{ marginTop: 12, marginBottom: 0 }}>
                {(['right', 'half', 'wrong'] as Grade[]).map((g) => (
                  <button
                    key={g}
                    className={cur === g ? 'on' : ''}
                    onClick={() => setSelfEval((s) => ({ ...s, [x.id]: g }))}
                  >
                    {g === 'right' ? '做对了' : g === 'half' ? '半对' : '做错了'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        <div style={{ height: 80 }} />
        <div className="bottomBar">
          <button className="btn primary wide" onClick={() => submit()}>
            出分
          </button>
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
            <div style={{ fontWeight: 700, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {paper.year} {paper.subjectName} · 模考
            </div>
            <div style={{ fontSize: 11.5 }}>
              已答 {answeredCount}/{qs.length} · 剩 {fmtDur(left)}
            </div>
          </div>
          <button className="btn sm" onClick={() => setShowPalette(true)}>
            答题卡
          </button>
        </div>
        <div className="progressLine">
          <i style={{ width: `${(answeredCount / Math.max(1, qs.length)) * 100}%` }} />
        </div>
      </div>

      <QuestionView
        item={{ q: q, paper, context: q.contextId ? paper.contexts.find((c) => c.id === q.contextId) : undefined }}
        index={idx}
        total={qs.length}
        selected={answers[q.id] ?? null}
        graded={null}
        revealed={false}
        onSelect={(k) => setAnswers((a) => ({ ...a, [q.id]: k }))}
        onReveal={() => {
          revealedIds.current.add(q.id)
          setAnswers((a) => ({ ...a, [q.id]: a[q.id] ?? '' }))
          setIdx(idx)
        }}
        onGrade={() => {}}
        onBookmark={() => {}}
        bookmarked={false}
      />
      <div style={{ height: 96 }} />
      <div className="bottomBar">
        <button className="btn" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>
          上一题
        </button>
        {idx + 1 >= qs.length ? (
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setShowConfirm(true)}>
            交卷
          </button>
        ) : (
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setIdx(idx + 1)}>
            下一题
          </button>
        )}
      </div>

      {showPalette && (
        <Sheet title="答题卡" onClose={() => setShowPalette(false)}>
          <div className="palette">
            {qs.map((x, i) => (
              <div
                key={x.id}
                className={`pCell ${answers[x.id] ? 'done' : ''} ${i === idx ? 'cur' : ''}`}
                onClick={() => {
                  setIdx(i)
                  setShowPalette(false)
                }}
              >
                {x.no}
              </div>
            ))}
          </div>
          <button className="btn wide primary" style={{ marginTop: 16 }} onClick={() => { setShowPalette(false); setShowConfirm(true) }}>
            交卷
          </button>
        </Sheet>
      )}

      {showConfirm && (
        <Sheet title="确认交卷？" onClose={() => setShowConfirm(false)}>
          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8 }}>
            还有 <b>{qs.length - answeredCount}</b> 题没答。
            <br />
            交卷后选择题会自动判分，非选择题需要你对照解析自评。
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>
              继续答题
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={goGrade}>
              交卷
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
