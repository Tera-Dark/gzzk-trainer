export type Subject =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'chinese'
  | 'english'
  | 'history'
  | 'politics'

export type QType = 'choice' | 'blank' | 'long'

export interface ImageRef {
  file: string
  w: number
  h: number
  disp: [number, number] | null
}

export interface Option {
  k: string
  md: string
  html: string
}

export interface Question {
  id: string
  no: number
  type: QType
  score: number | null
  section: string
  stem: string
  stemHtml: string
  options: Option[]
  answer: string
  answerHtml: string
  analysis: string
  analysisHtml: string
  answerKey: string | null
  /** 多选题：答案不是一个字母，前端不做自动判分 */
  multi?: boolean
  images: ImageRef[]
  contextId: string | null
  tags?: string[]
}

export interface Context {
  id: string
  md: string
  html: string
  images: ImageRef[]
}

export interface Page {
  url: string
  w: number
  h: number
}

export interface Paper {
  id: string
  subject: Subject
  subjectCn: string
  subjectName: string
  color: string
  year: number
  title: string
  source: { blank: string | null; answer: string | null }
  fullScore: number
  durationMin: number
  contexts: Context[]
  questions: Question[]
  pages: Page[]
  answerPages?: Page[]
  /** 题量明显少于同科正常年份：能练，但估分不可信 */
  incomplete?: boolean
  expectedCount?: number
}

export interface PaperMeta {
  id: string
  subject: Subject
  subjectCn: string
  subjectName: string
  color: string
  year: number
  title: string
  fullScore: number
  durationMin: number
  count: number
  choiceCount: number
  withAnswer: number
  contexts: number
  pages: number
  sections: string[]
  incomplete?: boolean
  expectedCount?: number | null
}

export interface QuestionMeta {
  a?: number
  id: string
  s: Subject
  p: string
  y: number
  n: number
  t: QType
  k: string | null
  g: string[]
  x: string
  sc: number | null
}

export type Grade = 'right' | 'half' | 'wrong' | 'skip'
