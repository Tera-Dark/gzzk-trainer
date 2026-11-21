import katex from 'katex'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

function protectMath(src: string): { text: string; items: string[] } {
  const items: string[] = []
  const text = src.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_m, display, inline) => {
    const tex = (display ?? inline ?? '').trim()
    let html: string
    try {
      html = katex.renderToString(fixTex(tex), {
        displayMode: display != null,
        throwOnError: false,
        strict: false,
        output: 'html',
      })
    } catch {
      html = `<code>${escapeHtml(tex)}</code>`
    }
    items.push(html)
    return `\u0000${items.length - 1}\u0000`
  })
  return { text, items }
}

/** 修掉 pandoc 产出里 KaTeX 不认识的写法 */
function fixTex(tex: string): string {
  return tex
    .replace(/\\sqrt\[\\?\]\s*\{/g, '\\sqrt{')
    .replace(/\\lbrack/g, '[')
    .replace(/\\rbrack/g, ']')
    .replace(/\\bigtriangleup/g, '\\triangle')
    .replace(/\\mathbf\{\\cdot\}/g, '\\cdot')
    .replace(/\\mathrm\{([^}]*)\}/g, '\\text{$1}')
    .replace(/\\text\{([^}]*)\}/g, (_m, g) => `\\text{${g}}`)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}

const cache = new Map<string, string>()

export function render(md: string): string {
  if (!md) return ''
  const hit = cache.get(md)
  if (hit !== undefined) return hit
  const { text, items } = protectMath(md)
  let html = marked.parse(text) as string
  html = html.replace(/\u0000(\d+)\u0000/g, (_m, i) => items[Number(i)] ?? '')
  // 下划线填空行内显示
  html = html.replace(/<u>\s*<\/u>/g, '<span class="blank-box"></span>')
  // 宽表格允许横向滚动，避免手机上挤成竖排
  html = html.replace(/<table/gi, '<div class="tableWrap"><table').replace(/<\/table>/gi, '</table></div>')
  if (cache.size > 600) cache.clear()
  cache.set(md, html)
  return html
}

/** 列表页用的短预览：去掉公式、图片、标签 */
export function previewText(md: string, n = 42): string {
  const t = (md || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '〔图〕')
    .replace(/<img[^>]*>/gi, '〔图〕')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (t || '〔图形题〕').slice(0, n)
}

export function plain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#$*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
