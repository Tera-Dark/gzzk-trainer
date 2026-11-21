import { useEffect, useRef, useState } from 'react'

type Pt = { x: number; y: number }
type Stroke = Pt[]

/** 手指/触控笔手写板：横线纸背景，支持笔粗细、撤销、清空 */
export function HandwritingPad({
  resetKey,
  rows = 4,
  onChange,
}: {
  resetKey?: string
  rows?: number
  onChange?: (hasInk: boolean) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const cvsRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const cur = useRef<Stroke | null>(null)
  const [size, setSize] = useState(3)
  const [empty, setEmpty] = useState(true)

  const ROW = 34

  function paint() {
    const cvs = cvsRef.current
    const wrap = wrapRef.current
    if (!cvs || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = ROW * rows
    if (cvs.width !== Math.round(w * dpr) || cvs.height !== Math.round(h * dpr)) {
      cvs.width = Math.round(w * dpr)
      cvs.height = Math.round(h * dpr)
      cvs.style.width = w + 'px'
      cvs.style.height = h + 'px'
    }
    const ctx = cvs.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // 纸张
    ctx.fillStyle = '#fffdf8'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#e6e1d6'
    ctx.lineWidth = 1
    for (let y = ROW; y < h; y += ROW) {
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(w, y + 0.5)
      ctx.stroke()
    }
    ctx.strokeStyle = '#f0c9c0'
    ctx.beginPath()
    ctx.moveTo(26.5, 0)
    ctx.lineTo(26.5, h)
    ctx.stroke()
    // 笔画
    ctx.strokeStyle = '#1b1f2a'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokes.current) {
      if (s.length === 0) continue
      ctx.lineWidth = (s as any).w || 3
      ctx.beginPath()
      ctx.moveTo(s[0].x, s[0].y)
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y)
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y)
      ctx.stroke()
    }
  }

  useEffect(() => {
    strokes.current = []
    setEmpty(true)
    onChange?.(false)
    paint()
    const ro = new ResizeObserver(() => paint())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, rows])

  useEffect(() => {
    paint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  function pos(e: React.PointerEvent): Pt {
    const r = cvsRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function down(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    cur.current = [pos(e)]
    ;(cur.current as any).w = size
    strokes.current.push(cur.current)
    if (empty) {
      setEmpty(false)
      onChange?.(true)
    }
    paint()
  }

  function move(e: React.PointerEvent) {
    if (!cur.current) return
    cur.current.push(pos(e))
    paint()
  }

  function up() {
    cur.current = null
    paint()
  }

  function undo() {
    strokes.current.pop()
    const nowEmpty = strokes.current.length === 0
    setEmpty(nowEmpty)
    onChange?.(!nowEmpty)
    paint()
  }

  function clear() {
    strokes.current = []
    setEmpty(true)
    onChange?.(false)
    paint()
  }

  return (
    <div className="padWrap">
      <div className="padBar">
        <button className={'chip' + (size === 2 ? ' on' : '')} onClick={() => setSize(2)}>
          细
        </button>
        <button className={'chip' + (size === 3 ? ' on' : '')} onClick={() => setSize(3)}>
          中
        </button>
        <button className={'chip' + (size === 5 ? ' on' : '')} onClick={() => setSize(5)}>
          粗
        </button>
        <span className="grow" />
        <button className="chip" onClick={undo} disabled={empty}>
          撤销
        </button>
        <button className="chip" onClick={clear} disabled={empty}>
          清空
        </button>
      </div>
      <div ref={wrapRef} className="padBox">
        <canvas
          ref={cvsRef}
          className="padCanvas"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
      </div>
    </div>
  )
}
