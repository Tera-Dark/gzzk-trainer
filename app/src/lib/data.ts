import type { Paper, PaperMeta, Question, QuestionMeta, Context, Subject } from './types'

export { BASE } from './env'
import { jsonFromCacheOrNet, contentBase } from './content'

export const SUBJECTS: { key: Subject; name: string; short: string; color: string }[] = [
  { key: 'chinese', name: '语文', short: '语', color: '#ef4444' },
  { key: 'math', name: '数学', short: '数', color: '#3b82f6' },
  { key: 'english', name: '英语', short: '英', color: '#f59e0b' },
  { key: 'physics', name: '物理', short: '物', color: '#8b5cf6' },
  { key: 'chemistry', name: '化学', short: '化', color: '#10b981' },
  { key: 'history', name: '历史', short: '史', color: '#a16207' },
  { key: 'politics', name: '道德与法治', short: '道', color: '#ec4899' },
]

export function subjectName(s: string): string {
  return SUBJECTS.find((x) => x.key === s)?.name ?? s
}

export function subjectColor(s: string): string {
  return SUBJECTS.find((x) => x.key === s)?.color ?? '#2563eb'
}

let indexPromise: Promise<PaperMeta[]> | null = null
const paperCache = new Map<string, Promise<Paper>>()
let flatPromise: Promise<QuestionMeta[]> | null = null
let tagPromise: Promise<Record<string, { name: string; count: number }[]>> | null = null

async function getJSON<T>(path: string): Promise<T> {
  const data = await jsonFromCacheOrNet<T>(path)
  return data as T
}

export function loadIndex(): Promise<PaperMeta[]> {
  if (!indexPromise) {
    indexPromise = getJSON<{ papers: PaperMeta[] }>('index.json').then((d) => d.papers)
  }
  return indexPromise
}

export function loadPaper(id: string): Promise<Paper> {
  let p = paperCache.get(id)
  if (!p) {
    p = getJSON<Paper>(`${id}.json`)
    paperCache.set(id, p)
  }
  return p
}

export function loadQuestions(): Promise<QuestionMeta[]> {
  if (!flatPromise) flatPromise = getJSON<{ questions: QuestionMeta[] }>('questions.json').then((d) => d.questions)
  return flatPromise
}

export function loadTags(): Promise<Record<string, { name: string; count: number }[]>> {
  if (!tagPromise) tagPromise = getJSON('tags.json')
  return tagPromise
}

export function assetUrl(path: string): string {
  return `${contentBase()}assets/${path}`
}

/** 把 JSON 里的相对图片路径换成真实 URL */
export function fixHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/src="papers\//g, `src="${contentBase()}assets/papers/`)
    .replace(/src='papers\//g, `src='${contentBase()}assets/papers/`)
}

export interface LoadedQ {
  q: Question
  paper: Paper
  context?: Context
}

export async function loadQuestionsByIds(ids: string[]): Promise<LoadedQ[]> {
  const flat = await loadQuestions()
  const byId = new Map(flat.map((q) => [q.id, q]))
  const paperIds = [...new Set(ids.map((id) => byId.get(id)?.p).filter(Boolean) as string[])]
  const papers = new Map<string, Paper>()
  await Promise.all(paperIds.map(async (pid) => papers.set(pid, await loadPaper(pid))))
  const out: LoadedQ[] = []
  for (const id of ids) {
    const meta = byId.get(id)
    if (!meta) continue
    const paper = papers.get(meta.p)
    if (!paper) continue
    const q = paper.questions.find((x) => x.id === id)
    if (!q) continue
    const context = q.contextId ? paper.contexts.find((c) => c.id === q.contextId) : undefined
    out.push({ q, paper, context })
  }
  return out
}

export function gradeLabel(t: string): string {
  return t === 'choice' ? '选择' : t === 'blank' ? '填空' : '解答'
}
