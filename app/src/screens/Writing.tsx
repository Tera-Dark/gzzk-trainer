import { go } from '../ui'
import { render } from '../lib/md'
import { WRITING_DOCS } from '../lib/writing'

/* ---------------- 写作素材：总览 ---------------- */

export function WritingHome() {
  return (
    <div className="app">
      <div className="pageHead">
        <div>
          <h1>写作素材</h1>
          <div className="sub">语文 · 英语作文，道法 · 历史小论文</div>
        </div>
      </div>

      <div className="card tight">
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>怎么用</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.85 }}>
          先看结构和评分点，再挑两三个素材记熟。考场上只用自己的话把素材讲清楚，别整篇背。
        </div>
      </div>

      {WRITING_DOCS.map((d) => (
        <div key={d.id} className="card wCard" onClick={() => go(`/writing/${d.id}`)}>
          <div className="wCardTop">
            <span className="dot" style={{ background: d.color }} />
            <b>{d.title}</b>
            <span className="grow" />
            <span className="chev">›</span>
          </div>
          <div className="wCardSub">{d.tagline}</div>
          <div className="wCardTags">
            {d.sections.map((s) => (
              <span key={s.id} className="pill">
                {s.title}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------------- 写作素材：单份材料 ---------------- */

export function WritingDocScreen({ id }: { id: string }) {
  const doc = WRITING_DOCS.find((d) => d.id === id)
  if (!doc) {
    return (
      <div className="app">
        <div className="empty">没有这份材料。</div>
        <button className="btn wide" onClick={() => go('/writing')}>
          返回写作素材
        </button>
      </div>
    )
  }

  // 自己算位置：粘顶栏高度因机型而异，scrollIntoView 会被 scroll-padding 和动画带偏
  const jump = (sid: string) => {
    const el = document.getElementById('w-' + sid)
    if (!el) return
    const bar = document.querySelector<HTMLElement>('.wChips')
    const offset = (bar ? bar.getBoundingClientRect().bottom : 0) + 12
    window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - offset) })
  }

  return (
    <div className="app">
      <div className="pageHead">
        <button className="iconBtn" onClick={() => go('/writing')}>
          ‹
        </button>
        <div>
          <h1>{doc.title}</h1>
          <div className="sub">{doc.tagline}</div>
        </div>
      </div>

      <div className="wChips">
        {doc.sections.map((s, i) => (
          <button key={s.id} className="chip" onClick={() => jump(s.id)}>
            {i + 1}. {s.title}
          </button>
        ))}
      </div>

      {doc.sections.map((s) => (
        <section key={s.id} id={'w-' + s.id} className="card wSec">
          <h2 className="wSecTitle">{s.title}</h2>
          <div className="md" dangerouslySetInnerHTML={{ __html: render(s.md) }} />
        </section>
      ))}
    </div>
  )
}
