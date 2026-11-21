import type { Grade, Subject } from './types'

const KEY = 'gzzk.v1'

export type Mode = 'practice' | 'exam' | 'review' | 'mistakes'

export interface Attempt {
  qid: string
  s: Subject
  p: string
  grade: Grade
  mode: Mode
  ts: number
  ms?: number
  tag?: string
}

export interface SrsCard {
  box: number
  due: number
  lapses: number
  seen: number
  last: Grade
}

export interface ExamRecord {
  pid: string
  s: Subject
  ts: number
  score: number
  total: number
  autoScore: number
  rightCount: number
  wrongCount: number
  halfCount: number
  ms: number
}

export interface Settings {
  examDate: string
  dailyGoal: number
  name: string
  /** 内容来源：空 = 跟 App 同源；也可填远程静态地址，如 https://cdn.xx.com/gzzk/ */
  contentBase: string
  autoUpdate: boolean
}

export interface DB {
  v: number
  attempts: Attempt[]
  srs: Record<string, SrsCard>
  bookmarks: string[]
  exams: ExamRecord[]
  settings: Settings
  lastQuestion?: { pid: string; no: number }
  xp: number
  /** 每日 XP：{ '2026-11-20': 45 } */
  daily: Record<string, number>
  /** 考点掌握度 0-5 */
  mastery: Record<string, number>
  /** 已应用的内容版本（按来源区分） */
  contentVersion?: string
}

const DAY = 86400000
const BOXES = [1, 2, 4, 7, 15, 30, 60]

function defaults(): DB {
  return {
    v: 1,
    attempts: [],
    srs: {},
    bookmarks: [],
    exams: [],
    settings: {
      examDate: '2027-06-20',
      dailyGoal: 20,
      name: '',
      contentBase: '',
      autoUpdate: true,
    },
    xp: 0,
    daily: {},
    mastery: {},
  }
}

let db: DB = load()
const listeners = new Set<() => void>()

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as DB
    return { ...defaults(), ...parsed, settings: { ...defaults().settings, ...parsed.settings } }
  } catch {
    return defaults()
  }
}

let saveTimer: number | undefined
function persist() {
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      if (db.attempts.length > 8000) db.attempts = db.attempts.slice(-8000)
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      // 容量不足时丢弃最早的记录
      db.attempts = db.attempts.slice(-2000)
      try {
        localStorage.setItem(KEY, JSON.stringify(db))
      } catch {
        /* ignore */
      }
    }
  }, 200)
}

function emit() {
  persist()
  listeners.forEach((l) => l())
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function snapshot(): DB {
  return db
}

export function settings(): Settings {
  return db.settings
}

export function updateSettings(patch: Partial<Settings>) {
  db.settings = { ...db.settings, ...patch }
  emit()
}

export function dayStart(d = Date.now()): number {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

export function nextDue(box: number, from = Date.now()): number {
  return dayStart(from) + BOXES[Math.min(box, BOXES.length - 1)] * DAY
}

export function record(
  qid: string,
  s: Subject,
  p: string,
  grade: Grade,
  mode: Mode,
  ms?: number,
  tag?: string
) {
  db.attempts.push({ qid, s, p, grade, mode, ts: Date.now(), ms, tag })
  const card = db.srs[qid] ?? { box: 0, due: 0, lapses: 0, seen: 0, last: grade }
  card.seen += 1
  card.last = grade
  if (grade === 'right') card.box = Math.min(card.box + 1, BOXES.length - 1)
  else if (grade === 'half') card.box = Math.max(0, Math.min(card.box, 2))
  else if (grade === 'wrong') {
    card.box = 0
    card.lapses += 1
  }
  card.due = nextDue(card.box)
  db.srs[qid] = card
  emit()
}

export function gradeOf(qid: string): Grade | undefined {
  return db.srs[qid]?.last
}

export function srsCard(qid: string): SrsCard | undefined {
  return db.srs[qid]
}

export function dueCount(now = Date.now()): number {
  return Object.values(db.srs).filter((c) => c.due <= now).length
}

export function dueIds(now = Date.now()): string[] {
  return Object.entries(db.srs)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id)
}

export function toggleBookmark(qid: string): boolean {
  const i = db.bookmarks.indexOf(qid)
  if (i >= 0) db.bookmarks.splice(i, 1)
  else db.bookmarks.push(qid)
  emit()
  return i < 0
}

export function isBookmarked(qid: string): boolean {
  return db.bookmarks.includes(qid)
}

export function bookmarks(): string[] {
  return db.bookmarks
}

export function wrongIds(subject?: Subject): string[] {
  const seen = new Map<string, Grade>()
  for (const a of db.attempts) {
    if (subject && a.s !== subject) continue
    seen.set(a.qid, a.grade)
  }
  return [...seen.entries()].filter(([, g]) => g === 'wrong' || g === 'half').map(([id]) => id)
}

export function recordExam(rec: ExamRecord) {
  db.exams.push(rec)
  emit()
}

export function exams(): ExamRecord[] {
  return db.exams
}

export function setLast(pid: string, no: number) {
  db.lastQuestion = { pid, no }
  persist()
}

export function lastQuestion() {
  return db.lastQuestion
}

const LEVEL_STEP = 120

export function xpTotal(): number {
  return db.xp
}

export function levelInfo(xp = db.xp) {
  const level = Math.floor(xp / LEVEL_STEP) + 1
  const inLevel = xp % LEVEL_STEP
  return { level, inLevel, need: LEVEL_STEP, pct: inLevel / LEVEL_STEP }
}

export function addXp(n: number) {
  db.xp += n
  const k = dayKey()
  db.daily[k] = (db.daily[k] ?? 0) + n
  emit()
}

export function dayKey(d = Date.now()): string {
  const t = new Date(d)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export function xpToday(): number {
  return db.daily[dayKey()] ?? 0
}

export function streakDays(): number {
  let n = 0
  for (let i = 0; i < 400; i++) {
    if ((db.daily[dayKey(Date.now() - i * DAY)] ?? 0) > 0) n++
    else if (i > 0) break
  }
  return n
}

export function masteryOf(tag: string): number {
  return db.mastery[tag] ?? 0
}

export function bumpMastery(tag: string, n = 1) {
  db.mastery[tag] = Math.min(5, (db.mastery[tag] ?? 0) + n)
  emit()
}

export function setContentVersion(v: string) {
  db.contentVersion = v
  emit()
}

export function contentVersion(): string | undefined {
  return db.contentVersion
}

export function resetAll() {
  db = defaults()
  emit()
}

export function exportJSON(): string {
  return JSON.stringify(db, null, 1)
}

export function importJSON(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as DB
    db = { ...defaults(), ...parsed, settings: { ...defaults().settings, ...parsed.settings } }
    emit()
    return true
  } catch {
    return false
  }
}

export function subjectStats(subject: Subject) {
  let right = 0
  let half = 0
  let wrong = 0
  const byTag = new Map<string, { r: number; w: number }>()
  const qids = new Set<string>()
  for (const a of db.attempts) {
    if (a.s !== subject) continue
    qids.add(a.qid)
    if (a.grade === 'right') right += 1
    else if (a.grade === 'half') half += 1
    else if (a.grade === 'wrong') wrong += 1
    if (a.tag) {
      const t = byTag.get(a.tag) ?? { r: 0, w: 0 }
      if (a.grade === 'right') t.r += 1
      if (a.grade === 'wrong' || a.grade === 'half') t.w += 1
      byTag.set(a.tag, t)
    }
  }
  const total = right + half + wrong
  return {
    right,
    half,
    wrong,
    total,
    accuracy: total ? (right + half * 0.5) / total : 0,
    covered: qids.size,
    byTag,
  }
}

export function todayStats() {
  const start = dayStart()
  let count = 0
  let right = 0
  for (const a of db.attempts) {
    if (a.ts < start) continue
    count += 1
    if (a.grade === 'right') right += 1
  }
  return { count, right }
}
