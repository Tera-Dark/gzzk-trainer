import { useEffect, useRef, useState } from 'react'
import type { Question } from '../lib/types'
import { judge, cleanRef, type JudgeResult } from '../lib/judge'
import { HandwritingPad } from './HandwritingPad'
import { render } from '../lib/md'
import { fixHtml } from '../lib/data'
import { ensureVisible } from '../lib/viewport'

type Mode = 'type' | 'write' | 'pen'

/** 非选择题的作答区：打字自动对照 / 屏幕手写 / 纸笔计时 */
export function AnswerInput({
  q,
  onGrade,
  defaultMode = 'type',
}: {
  q: Question
  onGrade: (kind: 'right' | 'half' | 'wrong', userText?: string, mode?: Mode) => void
  defaultMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [text, setText] = useState('')
  const [res, setRes] = useState<JudgeResult | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const [showRef, setShowRef] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(true)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [offScreen, setOffScreen] = useState(false)
  const ref = cleanRef(q.answer || '')

  useEffect(() => {
    setText('')
    setRes(null)
    setHasInk(false)
    setShowRef(false)
    setSeconds(0)
    setRunning(true)
    setMode(defaultMode)
    document.body.classList.remove('typing', 'stemDock', 'stemClip')
  }, [q.id])

  useEffect(() => {
    if (mode !== 'pen' || !running) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [mode, running])

  // 打字时给 body 挂标记：题干吸顶、底栏让位（见 styles.css）
  useEffect(() => {
    return () => {
      document.body.classList.remove('typing', 'stemDock', 'stemClip')
    }
  }, [])

  // 作答区在屏幕外时给一个一键跳转，长题干不用一路往下找
  useEffect(() => {
    if (res) {
      setOffScreen(false)
      return
    }
    const check = () => {
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.visualViewport?.height ?? window.innerHeight
      setOffScreen(r.top > vh - 64 || r.bottom < 0)
    }
    check()
    const t = window.setTimeout(check, 320)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    window.visualViewport?.addEventListener('resize', check)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      window.visualViewport?.removeEventListener('resize', check)
    }
  }, [res, mode, q.id])

  // 输入框随内容长高，不用在小框里滚动
  useEffect(() => {
    const ta = taRef.current
    if (!ta || mode !== 'type') return
    ta.style.height = 'auto'
    const max = Math.round((window.visualViewport?.height ?? window.innerHeight) * 0.42)
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px'
  }, [text, mode])

  function compare() {
    setRunning(false)
    setRes(judge(text, ref))
    taRef.current?.blur()
    setTimeout(() => ensureVisible(resultRef.current, { top: 96, bottom: 24 }), 80)
  }

  function pad(n: number) {
    const m = Math.floor(n / 60)
    const s = n % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const tabs: [Mode, string][] = [
    ['type', '打字作答'],
    ['write', '手写'],
    ['pen', '纸笔'],
  ]

  return (
    <div className="ansInput" ref={rootRef}>
      {offScreen && !res && (
        <button
          className="jumpAns"
          onClick={() => {
            rootRef.current?.scrollIntoView({ block: 'center' })
            if (mode === 'type') window.setTimeout(() => taRef.current?.focus(), 160)
          }}
        >
          ↓ 去作答
        </button>
      )}
      <div className="segRow">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            className={'seg' + (mode === k ? ' on' : '')}
            onClick={() => {
              // 切换方式时把键盘状态收干净，否则底栏会一直藏着
              document.body.classList.remove('typing')
              setMode(k)
            }}
          >
            {label}
          </button>
        ))}
        <span className="grow" />
        {mode !== 'type' && <span className="timer tiny">{mode === 'pen' ? '纸笔计时 ' + pad(seconds) : '手写板上作答'}</span>}

      </div>

      {mode === 'type' && (
        <>
          <textarea
            ref={taRef}
            className="ta"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="打字写出你的答案：能写多少写多少，不用长篇大论"
            rows={3}
            disabled={!!res}
            enterKeyHint="done"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onFocus={() => {
              document.body.classList.add('typing', 'stemDock')
              // 题干收成上方一块可滚动的面板：先停在原来正看着的那一段（尾部），
              // 不要让视线跳走
              window.setTimeout(() => {
                const pane = document.querySelector('.qStemBody') as HTMLElement | null
                if (!pane) return
                const clipped = pane.scrollHeight > pane.clientHeight + 4
                // 装不下时才提示能滑动，短题干不打扰
                document.body.classList.toggle('stemClip', clipped)
                if (clipped) pane.scrollTop = pane.scrollHeight
              }, 0)
              // 键盘弹出是分阶段完成的（iOS 不缩小 innerHeight），多校几次位置，
              // 保证输入框和「对照答案」都在键盘上方
              for (const t of [0, 120, 320, 650]) {
                window.setTimeout(() => ensureVisible(taRef.current, { top: 96, bottom: 92 }), t)
              }
            }}
            onBlur={() => {
              // 键盘收起，但题干面板留着：对完答案时结果就在眼前，不会把页面抻开
              document.body.classList.remove('typing')
            }}
          />
          {!res ? (
            <button className="btn primary block" onClick={compare} disabled={!text.trim()}>
              对照答案
            </button>
          ) : (
            <div className="judgeBox" ref={resultRef}>
              <div className={'verdict ' + res.verdict}>
                {res.blanks ? (
                  <>
                    {res.verdict === 'right' ? '✓ 全部写对了' : res.verdict === 'half' ? '△ 有的空写错了' : '✗ 大部分没写对'}
                    <span className="tiny sim">
                      {' '}
                      {res.blanks.filter((b) => b.verdict === 'right').length}/{res.blanks.length} 空正确
                    </span>
                  </>
                ) : (
                  <>
                    {res.verdict === 'right' && '✓ 基本写对了'}
                    {res.verdict === 'half' && '△ 写对了一部分'}
                    {res.verdict === 'wrong' && '✗ 和答案差得比较多'}
                    {res.verdict === 'manual' && '这道题要自己对照（答案较长或含公式图）'}
                    {res.verdict !== 'manual' && (
                      <span className="tiny sim"> 吻合度 {Math.round(res.sim * 100)}%</span>
                    )}
                  </>
                )}
              </div>
              {res.blanks && (
                <div className="blankList">
                  {res.blanks.map((b) => (
                    <div className={'blankRow ' + b.verdict} key={b.i}>
                      <span className="bk">{['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][b.i] ?? b.i + 1}</span>
                      <span className="bu">{b.user || '（空）'}</span>
                      <span className="ba">{b.ref}</span>
                      <span className="bv">{b.verdict === 'right' ? '✓' : b.verdict === 'half' ? '△' : '✗'}</span>
                    </div>
                  ))}
                </div>
              )}
              {!res.blanks && res.verdict !== 'manual' && (
                <>
                  <div className="cmpLine">
                    <span className="cmpTag me">你写的</span>
                    <span className="cmpText" dangerouslySetInnerHTML={{ __html: res.userHtml }} />
                  </div>
                  <div className="cmpLine">
                    <span className="cmpTag ref">答案</span>
                    <span className="cmpText" dangerouslySetInnerHTML={{ __html: res.refHtml }} />
                  </div>
                  <div className="tiny muted">
                    <mark className="miss">黄底</mark> = 多写/写错的字，
                    <ins className="lack">下划线</ins> = 漏掉的字
                  </div>
                </>
              )}
              {res.verdict === 'manual' && (
                <div className="md" dangerouslySetInnerHTML={{ __html: render(fixHtml(q.answerHtml || q.answer || '')) }} />
              )}
              <div className="selfRow">
                <span className="tiny muted">自己判：</span>
                <button
                  className={'chip' + (res.verdict === 'right' ? ' on' : '')}
                  onClick={() => onGrade('right', text, mode)}
                >
                  对了
                </button>
                <button
                  className={'chip' + (res.verdict === 'half' ? ' on' : '')}
                  onClick={() => onGrade('half', text, mode)}
                >
                  半对
                </button>
                <button
                  className={'chip' + (res.verdict === 'wrong' ? ' on' : '')}
                  onClick={() => onGrade('wrong', text, mode)}
                >
                  错了
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'write' && (
        <>
          <HandwritingPad resetKey={q.id} rows={q.answer && cleanRef(q.answer).length > 60 ? 6 : 4} onChange={setHasInk} />
          {!showRef ? (
            <>
              <button className="btn primary block" onClick={() => setShowRef(true)} disabled={!hasInk}>
                写完了，对答案
              </button>
              <p className="tiny muted center">在格子里写清楚，写完再对答案；可以和答案并排比一比</p>
            </>
          ) : (
            <div className="judgeBox">
              <div className="cmpLine">
                <span className="cmpTag ref">答案</span>
                <span className="cmpText">
                  {q.answerHtml || q.answer ? (
                    <span dangerouslySetInnerHTML={{ __html: render(fixHtml(q.answerHtml || q.answer || '')) }} />
                  ) : (
                    '（本题解析卷没有给答案，可以看下面的解析自己对照）'
                  )}
                </span>
              </div>
              <SelfJudge onGrade={onGrade} mode="write" />
            </div>
          )}
        </>
      )}

      {mode === 'pen' && (
        <>
          {!showRef ? (
            <>
              <div className="penBox">
                <div className="penTimer">{pad(seconds)}</div>
                <p className="tiny muted">
                  拿笔在作业本上写，写完再对答案。中考是纸笔考试，手不能生。
                  {ref.length > 0 && <span> 参考答案约 {Math.max(1, Math.round(ref.length / 22))} 行。</span>}
                </p>
              </div>
              <button className="btn primary block" onClick={() => setShowRef(true)}>
                我写完了，对答案
              </button>
            </>
          ) : (
            <div className="judgeBox">
              <div className="tiny muted" style={{ marginBottom: 6 }}>
                纸笔作答用时 {pad(seconds)} · 对照答案自己判
              </div>
              <div className="md" dangerouslySetInnerHTML={{ __html: render(fixHtml(q.answerHtml || q.answer || '')) }} />
              <SelfJudge onGrade={onGrade} mode="pen" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SelfJudge({
  onGrade,
  mode,
}: {
  onGrade: (kind: 'right' | 'half' | 'wrong', userText?: string, mode?: Mode) => void
  mode: Mode
}) {
  return (
    <div className="selfRow">
      <span className="tiny muted">自己判：</span>
      <button className="chip" onClick={() => onGrade('right', undefined, mode)}>
        写对了
      </button>
      <button className="chip" onClick={() => onGrade('half', undefined, mode)}>
        半对
      </button>
      <button className="chip" onClick={() => onGrade('wrong', undefined, mode)}>
        写错了
      </button>
    </div>
  )
}
