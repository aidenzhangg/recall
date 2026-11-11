export type QuizFormat = 'blank' | 'choice' | 'long' | 'mixed'
export type Question = { prompt: string; answer: string; kind?: Exclude<QuizFormat, 'mixed'>; options?: string[]; source?: string; topic?: string }
const logistics = /office hours|all rights reserved|copyright|contact (?:me|us|the instructor)|assignment (?:deadline|due)|submission deadline|course (?:code|outline|syllabus)|lecture slides (?:are|will)|slides (?:are|will be) (?:available|posted)|download (?:the|these) slides|next lecture (?:is|will)|attendance (?:is|will)|email (?:me|the instructor)|please (?:submit|upload|bring)|due (?:date|on)|instructor:|professor:|lecturer:/i
function isLogistics(line: string) {
  const numberedLabel = /^[A-Z]{2,8}\s*-?\s*[0-9]{2,4}[A-Z]?\b/i.test(line)
  const courseDescription = /\b(?:course|semester|syllabus|credits?|enrolment|enrollment|instructor)\b/i.test(line)
  return (numberedLabel && (!startsFact(line) || courseDescription))
    || /^(?:title|topic|section|unit|lecture(?:\s+[0-9]+)?|chapter(?:\s+[0-9]+)?)\s*:/i.test(line)
    || /^(?:the |an? )?(?:assignment|assessment|exam|midterm|final exam|grading|marks|syllabus|schedule)\b.*(?:due|worth|percent|%|scheduled|held|room|submit|grade|deadline)/i.test(line)
    || logistics.test(line) || /^(?:https?:\/\/|www\.)/i.test(line) || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(line)
}
const conceptVerbs = 'is defined as|refers to|consists of|is|are|means|describes|includes|contains|converts|convert|releases|release|absorbs|absorb|stores|store|carries|carry|produces|produce|uses|use|requires|require|causes|cause|increases|increase|decreases|decrease|prevents|prevent|occurs|occur|controls|control|transports|transport|binds|bind|measures|measure|represents|represent|differs from|results in|allows|allow'
const conceptSubject = new RegExp(`^(?:the |an? )?([A-Za-z][A-Za-z0-9'() /-]{0,85}?)\\s+(${conceptVerbs})\\b`, 'i')
const conceptDefinition = /^([A-Za-z][A-Za-z0-9'() /-]{0,85}?):\s+\S/
function startsFact(line: string) { return conceptSubject.test(line) || conceptDefinition.test(line) }
export function studyPassages(notes: string): string[] {
  const normalized = notes.replace(/\r\n?/g, '\n').replace(/\u00ad/g, '').replace(/(?<=\p{L})-\n(?=\p{Ll})/gu, '')
  const paragraphs: string[] = []
  let current = ''
  for (const raw of normalized.split('\n')) {
    const line = raw.trim().replace(/^[\u2022\u25cf\u25aa]\s*/, '')
    const words = line.split(/\s+/)
    const heading = !!line && !/[.!?:;]/.test(line) && words.length >= 3 && words.length <= 16 && words.filter(word => /^[A-Z][A-Za-z'-]*$/.test(word)).length >= Math.max(1, Math.ceil(words.length * .8))
    if (!line || isLogistics(line) || heading || /^#{1,6}\s+/.test(line) || /^(?:---+|===+|___+)$/.test(line) || /^(?:Page\s+)?[0-9]+(?:\s+(?:of|\/)\s+[0-9]+)?$/.test(line)) {
      if (current) paragraphs.push(current)
      current = ''; continue
    }
    if ((/^[\u2022\u25cf\u25aa]/.test(raw.trim()) || startsFact(line)) && current) { paragraphs.push(current); current = '' }
    current += (current ? ' ' : '') + line
  }
  if (current) paragraphs.push(current)
  return [...new Set(paragraphs.flatMap(paragraph => paragraph.split(/(?<=[.!?])\s+/)).map(line => line.trim().replace(/\s+/g, ' ')).filter(line => line.split(' ').length >= 5 && line.length <= 20000))]
}
type Candidate = { source: string; term: string; score: number }
function candidates(notes: string, focus: string): Candidate[] {
  const tokens = [...new Set(focus.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 2))]
  return studyPassages(notes).flatMap(source => {
    if (isLogistics(source) || source.length > 1200 || (tokens.length && !tokens.some(token => source.toLowerCase().includes(token)))) return []
    const definition = source.match(conceptDefinition)
    const match = source.match(conceptSubject)
    if (!definition && !match) return []
    const term = (definition ?? match)![1].trim()
    if (term.split(/\s+/).length > 7 || /^(?:this|that|these|those|it|they|we|you|there|here|what|which|how|why|students|everyone|today|tomorrow|lecture|chapter|slide|course|introduction|overview|learning objectives?|by the end|remember|note|example|for example|in summary|first|next|finally)\b/i.test(term)) return []
    const score = definition || /^(?:is|are|means|refers to|is defined as)$/i.test(match![2]) ? 6 : 4
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const repeats = [...notes.matchAll(new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'gi'))].length
    return [{ source, term, score: score + Math.min(2, Math.max(0, repeats - 1)) }]
  })
}
function selectCandidates(items: Candidate[], count: number, priority: (source: string) => number): Candidate[] {
  const sorted = [...items].sort((a, b) => priority(b.source) - priority(a.source) || b.score - a.score)
  if (sorted.some(item => priority(item.source) > 0)) return sorted.slice(0, count)
  const selected: Candidate[] = []
  for (let start = 0; start < sorted.length && selected.length < count;) {
    let end = start + 1
    while (end < sorted.length && sorted[end].score === sorted[start].score) end++
    const take = Math.min(count - selected.length, end - start)
    for (let i = 0; i < take; i++) selected.push(sorted[start + Math.floor(i * (end - start - 1) / Math.max(1, take - 1))])
    start = end
  }
  return selected
}
function generateQuestions(notes: string, count: number, format: QuizFormat, focus: string, priority: (source: string) => number): Question[] {
  const items = candidates(notes, focus)
  const pool = [...new Map(items.map(item => [item.term.toLowerCase(), item.term])).values()]
  return selectCandidates(items, count, priority).map(({ source, term }, index): Question => {
    const kind = format === 'mixed' ? (['blank', 'choice', 'long'] as const)[index % 3] : format
    if (kind === 'long') return { kind, source, topic: term, prompt: `Explain "${term}" using your notes.`, answer: source }
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const prompt = source.replace(new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'gi'), '________')
    const options = pool.filter(word => word.toLowerCase() !== term.toLowerCase()).slice(0, 3)
    if (kind === 'blank' || !options.length) return { kind: 'blank', source, topic: term, prompt, answer: term }
    options.splice(index % (options.length + 1), 0, term)
    return { kind, source, topic: term, prompt, answer: term, options }
  })
}
export function makeQuestions(notes: string, count: number, format: QuizFormat, focus = ''): Question[] {
  return generateQuestions(notes, count, format, focus, () => 0)
}
export function isCorrect(question: Question, answer = '') {
  return question.kind !== 'long' && answer.trim().toLowerCase() === question.answer.trim().toLowerCase()
}

export type ReviewItem = { source: string; topic: string; misses: number; successes: number; dueAt: number }
export function recordAttempt(previous: ReviewItem[], questions: Question[], answers: string[], now = Date.now()): ReviewItem[] {
  const history = new Map(previous.map(item => [item.source, { ...item }]))
  questions.forEach((q, i) => {
    if (q.kind === 'long' || !q.source) return
    const item = history.get(q.source) ?? { source: q.source, topic: q.topic ?? q.answer, misses: 0, successes: 0, dueAt: now }
    if (isCorrect(q, answers[i])) { item.successes++; item.dueAt = now + Math.min(7, item.successes) * 86400000 }
    else { item.misses++; item.dueAt = now }
    history.set(q.source, item)
  })
  return [...history.values()].sort((a,b) => b.dueAt-a.dueAt).slice(-250)
}
export function adaptiveQuestions(notes: string, count: number, format: QuizFormat, history: ReviewItem[], now = Date.now(), focus = ''): Question[] {
  const priority = (source: string) => {
    const item = history.find(entry => entry.source === source)
    return item && item.dueAt <= now ? item.misses - item.successes + 10 : 0
  }
  return generateQuestions(notes, count, format, focus, priority)
}
