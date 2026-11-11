export type QuizFormat = 'blank' | 'choice' | 'long' | 'mixed'
export type Question = { prompt: string; answer: string; kind?: Exclude<QuizFormat, 'mixed'>; options?: string[]; source?: string; topic?: string }
export function makeQuestions(notes: string, count: number, format: QuizFormat): Question[] {
  const sources = notes.split(/(?<=[.!?])\s+|\n+/).map(line => line.trim()).filter(line => line.split(/\s+/).length >= 5)
  const pool = [...new Set(notes.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? [])]
  return sources.slice(0, count).flatMap((source, index): Question[] => {
    const term = [...(source.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? [])].sort((a,b) => b.length-a.length)[0]
    if (!term) return []
    const kind = format === 'mixed' ? (['blank', 'choice', 'long'] as const)[index % 3] : format
    if (kind === 'long') return [{ kind, source, topic: term, prompt: `Explain the role of "${term}" in this part of your notes.`, answer: source }]
    const prompt = source.split(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join('________')
    if (kind === 'blank') return [{ kind, source, topic: term, prompt, answer: term }]
    const distractors = pool.filter(word => word.toLowerCase() !== term.toLowerCase())
      .filter((word, i, all) => all.findIndex(other => other.toLowerCase() === word.toLowerCase()) === i).slice(0,3)
    if (!distractors.length) return [{ kind: 'blank', source, topic: term, prompt, answer: term }]
    const options = [...distractors]
    options.splice(index % (options.length + 1), 0, term)
    return [{ kind, source, topic: term, prompt, answer: term, options }]
  })
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
export function adaptiveQuestions(notes: string, count: number, format: QuizFormat, history: ReviewItem[], now = Date.now()): Question[] {
  const sources = notes.split(/(?<=[.!?])\s+|\n+/).map(line => line.trim()).filter(line => line.split(/\s+/).length >= 5)
  const priority = (source: string) => {
    const item = history.find(i => i.source === source)
    return item && item.dueAt <= now ? item.misses - item.successes + 10 : 0
  }
  sources.sort((a,b) => priority(b)-priority(a))
  // Keep the full notes as the distractor pool while ordering by review priority.
  return makeQuestions(sources.join('\n'), count, format)
}
