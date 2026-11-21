import { useMemo, useState } from 'react'
import { fixHtml } from '../lib/data'
import { render } from '../lib/md'
import type { Grade } from '../lib/types'
import type { LoadedQ } from '../lib/data'
import { AnswerInput } from './AnswerInput'

function stripLen(s: string): number {
  return (s || '').replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '图').replace(/[\s$]/g, '').length
}

export function Md({ src, className }: { src: string; className?: string }) {
  const html = useMemo(() => render(fixHtml(src)), [src])
  return <div className={className ?? 'md'} dangerouslySetInnerHTML={{ __html: html }} />
}

export function ContextBox({ ctx, defaultOpen = false }: { ctx: LoadedQ['context']; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!ctx) return null
  return (
    <div>
      <button className="ctxToggle" onClick={() => setOpen(!open)}>
        {open ? '收起材料 ▴' : '展开阅读材料 ▾'}
      </button>
      {open && (
        <div className="context open">
          <Md src={ctx.html} />
        </div>
      )}
    </div>
  )
}

interface Props {
  item: LoadedQ
  index: number
  total: number
  selected: string | null
  graded: Grade | null
  onSelect: (k: string) => void
  onReveal: () => void
  onGrade: (g: Grade, userText?: string, mode?: string) => void
  onBookmark: () => void
  bookmarked: boolean
  revealed: boolean
  inputMode?: 'type' | 'write' | 'pen'
}

export function QuestionView({
  item,
  index,
  total,
  selected,
  graded,
  onSelect,
  onReveal,
  onGrade,
  onBookmark,
  bookmarked,
  revealed,
  inputMode,
}: Props) {
  const { q, context, paper } = item
  const answered = graded !== null
  const isChoice = q.type === 'choice' && q.options.length >= 2
  const showAnswer = revealed || answered

  return (
    <div className="qCard">
      <div className="qMeta">
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
          第 {index + 1}/{total} 题
        </span>
        {q.score ? <span className="pill">{q.score} 分</span> : null}
        <span className="pill">{q.type === 'choice' ? '选择题' : q.type === 'blank' ? '填空题' : '解答题'}</span>
        {q.tags?.slice(0, 2).map((t) => (
          <span className="pill" key={t}>
            {t}
          </span>
        ))}
        <div className="spacer" />
        <button className="iconBtn" onClick={onBookmark} aria-label="收藏">
          <svg width="15" height="15" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
            <path d="M6 3h12v18l-6-4.5L6 21V3z" />
          </svg>
        </button>
      </div>

      {context && <ContextBox ctx={context} defaultOpen={stripLen(q.stemHtml || q.stem) < 12} />}

      <Md src={q.stemHtml || q.stem} />

      {isChoice ? (
        <div className="opts">
          {q.options.map((o) => {
            const cls = ['opt']
            const isSel = selected === o.k
            if (answered || revealed) {
              if (o.k === q.answerKey) cls.push('right')
              else if (isSel) cls.push('wrong')
            } else if (isSel) cls.push('sel')
            return (
              <button key={o.k} className={cls.join(' ')} onClick={() => !answered && onSelect(o.k)}>
                <span className="k">{o.k}</span>
                <span className="body">
                  <Md src={o.html || o.md} />
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {!isChoice && !showAnswer && (
        <div style={{ marginTop: 14 }}>
          <AnswerInput q={q} onGrade={onGrade} defaultMode={inputMode} />
          <button className="linkBtn" onClick={onReveal}>
            不会写，直接看答案与解析
          </button>
        </div>
      )}

      {showAnswer && (
        <>
          <div
            className={`answerBox ${graded === 'right' ? 'good' : graded === 'wrong' ? 'bad' : ''}`}
            style={isChoice && !q.answer ? { display: 'none' } : undefined}
          >
            <div className="lbl">{isChoice ? (selected === q.answerKey ? '答对了' : '正确答案') : '参考答案'}</div>
            <Md
              src={
                q.answerHtml ||
                q.answer ||
                (paper.answerPages?.length
                  ? '（这道题的答案是扫描图片，请到本卷「答案解析图」里查看）'
                  : '（本题解析卷未提供答案）')
              }
            />
          </div>
          {q.analysis ? (
            <div style={{ marginTop: 12 }}>
              <div className="cardTitle" style={{ marginBottom: 6 }}>
                解析
              </div>
              <div className="analysis">
                <Md src={q.analysisHtml || q.analysis} className="md analysis" />
              </div>
            </div>
          ) : null}
          {!isChoice && !answered && (
            <div className="gradeRow">
              <button className="btn" onClick={() => onGrade('right')}>
                <span style={{ color: 'var(--ok)', fontWeight: 700 }}>我做对了</span>
                <small>算会</small>
              </button>
              <button className="btn" onClick={() => onGrade('half')}>
                <span style={{ color: 'var(--warn)', fontWeight: 700 }}>半对</span>
                <small>需再看</small>
              </button>
              <button className="btn" onClick={() => onGrade('wrong')}>
                <span style={{ color: 'var(--bad)', fontWeight: 700 }}>做错了</span>
                <small>进错题本</small>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
