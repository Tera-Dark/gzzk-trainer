/**
 * 竖屏手机的视口工具。
 *
 * 手机上弹出键盘后，window.innerHeight 在安卓上会缩、在 iOS 上不会，
 * 所以统一用 visualViewport 算「被键盘挡住的高度」，写进 --kb-inset，
 * 供固定底栏等元素避让。
 */

export function installViewportVars() {
  const root = document.documentElement
  const apply = () => {
    const vv = window.visualViewport
    const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
    root.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
  }
  apply()
  window.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('scroll', apply)
}

/**
 * 只在需要时才滚动：把元素挪进可视区，上下各留一点余量。
 * 元素已经在视野里就一动不动，避免打断阅读位置。
 */
export function ensureVisible(el: HTMLElement | null, opts: { top?: number; bottom?: number } = {}) {
  if (!el) return
  const vv = window.visualViewport
  const viewH = vv?.height ?? window.innerHeight
  const viewTop = vv?.offsetTop ?? 0
  const padTop = opts.top ?? 72
  const padBottom = opts.bottom ?? 16
  const r = el.getBoundingClientRect()
  const limitBottom = viewTop + viewH - padBottom
  if (r.bottom > limitBottom) {
    window.scrollBy({ top: Math.ceil(r.bottom - limitBottom + 6) })
  } else if (r.top < viewTop + padTop) {
    window.scrollBy({ top: -Math.ceil(viewTop + padTop - r.top) })
  }
}
