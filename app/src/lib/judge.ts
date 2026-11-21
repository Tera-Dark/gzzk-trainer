/** 打字作答的自动对照判分：归一化 + LCS 差异 + 判定 */

const PUNCT = /[，。；：、！？（）“”‘’《》【】…—·,.;:!?()[\]{}<>"'`~\-—_]/g
const MARKERS = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫❶❷❸❹❺]/g

export function normalize(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\$/g, '')
    .replace(MARKERS, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .replace(PUNCT, '')
    .toLowerCase()
}

/** 参考答案是图片 / 公式 / 长篇论述时不做自动判分，改为对照后自评 */
export function needsManual(ref: string): boolean {
  const text = (ref || '').replace(/<[^>]+>/g, '').trim()
  if (/<img/i.test(ref)) return true
  if ((ref || '').includes('$')) return true
  const n = normalize(text).length
  if (n > 160) return true
  if (n > 70 && !/[①②③④⑤⑥⑦⑧⑨⑩]/.test(text)) return true
  return false
}

/** 去掉「示例一：」「答案：」这类前缀 */
export function cleanRef(ref: string): string {
  const t = (ref || '').trim()
  return t.replace(/^(示例|例|参考答案|答案|答|【答案】)[一二三四1-4]?\s*[:：]\s*/, '').trim()
}

/** 拆多空答案：①…②…③… */
export function splitBlanks(text: string): string[] {
  return (text || '')
    .split(/[①②③④⑤⑥⑦⑧⑨⑩]/)
    .map((x) => x.replace(/^[.．、:：\s]+/, '').replace(/\s+$/, ''))
    .filter((x) => normalize(x).length > 0)
}

/** 把作答按空拆开：带序号按序号，否则按空格 / 换行 */
export function splitAnswer(user: string): string[] {
  if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(user)) return splitBlanks(user)
  return user
    .split(/[,，;；、|\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export type Verdict = 'right' | 'half' | 'wrong' | 'manual'

export interface BlankRow {
  i: number
  user: string
  ref: string
  sim: number
  verdict: 'right' | 'half' | 'wrong'
}

export interface JudgeResult {
  verdict: Verdict
  sim: number
  userHtml: string
  refHtml: string
  missing: number
  extra: number
  blanks?: BlankRow[]
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}

/** 字符级 LCS，标出「多写的字」和「漏掉的字」 */
export function diffMark(user: string, ref: string): { userHtml: string; refHtml: string; matched: number } {
  const a = [...user]
  const b = [...ref]
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return { userHtml: escapeHtml(user), refHtml: escapeHtml(ref), matched: 0 }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  let uHtml = ''
  let rHtml = ''
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      uHtml += escapeHtml(a[i])
      rHtml += escapeHtml(b[j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      uHtml += `<mark class="miss">${escapeHtml(a[i])}</mark>`
      i++
    } else {
      rHtml += `<ins class="lack">${escapeHtml(b[j])}</ins>`
      j++
    }
  }
  while (i < n) uHtml += `<mark class="miss">${escapeHtml(a[i++])}</mark>`
  while (j < m) rHtml += `<ins class="lack">${escapeHtml(b[j++])}</ins>`
  return { userHtml: uHtml, refHtml: rHtml, matched: dp[0][0] }
}

function simOf(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!nb.length) return 0
  return diffMark(na, nb).matched / nb.length
}

function verdictOf(sim: number): 'right' | 'half' | 'wrong' {
  return sim >= 0.92 ? 'right' : sim >= 0.55 ? 'half' : 'wrong'
}

export function judge(user: string, refRaw: string): JudgeResult {
  const ref = cleanRef(refRaw)
  if (needsManual(ref)) {
    return { verdict: 'manual', sim: 0, userHtml: escapeHtml(user), refHtml: escapeHtml(ref), missing: 0, extra: 0 }
  }

  const refBlanks = splitBlanks(ref)
  const mine = splitAnswer(user)

  // 多空默写：每空去参考答案里找最接近的一条（选做题也适用）
  if (refBlanks.length >= 2 && mine.length >= 2) {
    const used = new Set<number>()
    const rows: BlankRow[] = mine.map((u, i) => {
      let best = -1
      let bestSim = -1
      refBlanks.forEach((r, ri) => {
        if (used.has(ri)) return
        const s = simOf(u, r)
        if (s > bestSim) {
          bestSim = s
          best = ri
        }
      })
      if (best >= 0) used.add(best)
      const target = best >= 0 ? refBlanks[best] : ''
      return { i, user: u, ref: target, sim: Math.max(0, bestSim), verdict: verdictOf(Math.max(0, bestSim)) }
    })
    const avg = rows.reduce((x, r) => x + r.sim, 0) / rows.length
    const allRight = rows.every((r) => r.verdict === 'right')
    const verdict: Verdict = allRight ? 'right' : avg >= 0.6 ? 'half' : 'wrong'
    return { verdict, sim: avg, userHtml: escapeHtml(user), refHtml: escapeHtml(ref), missing: 0, extra: 0, blanks: rows }
  }

  const nu = normalize(user)
  const nr = normalize(ref)
  if (!nu) {
    return { verdict: 'wrong', sim: 0, userHtml: '', refHtml: escapeHtml(ref), missing: nr.length, extra: 0 }
  }
  const { userHtml, refHtml, matched } = diffMark(nu, nr)
  const sim = nr.length ? matched / nr.length : 0
  return {
    verdict: verdictOf(sim),
    sim,
    userHtml,
    refHtml,
    missing: Math.max(0, nr.length - matched),
    extra: Math.max(0, nu.length - matched),
  }
}
