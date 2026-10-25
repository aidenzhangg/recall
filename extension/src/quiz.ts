export type QuizFormat = 'blank' | 'choice' | 'long' | 'mixed'
export type Question = { prompt: string; answer: string; kind?: Exclude<QuizFormat, 'mixed'>; options?: string[] }
export function makeQuestions(notes: string, count: number, format: QuizFormat): Question[] {
  const sources = notes.split(/(?<=[.!?])\s+|\n+/).map(line => line.trim()).filter(line => line.split(/\s+/).length >= 5)
  const pool = [...new Set(notes.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? [])]
  return sources.slice(0, count).flatMap((source, index): Question[] => {
    const term = [...(source.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? [])].sort((a,b) => b.length-a.length)[0]
    if (!term) return []
    const kind = format === 'mixed' ? (['blank', 'choice', 'long'] as const)[index % 3] : format
    if (kind === 'long') return [{ kind, prompt: `Explain the role of "${term}" in this part of your notes.`, answer: source }]
    const prompt = source.split(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join('________')
    if (kind === 'blank') return [{ kind, prompt, answer: term }]
    const distractors = pool.filter(word => word.toLowerCase() !== term.toLowerCase())
      .filter((word, i, all) => all.findIndex(other => other.toLowerCase() === word.toLowerCase()) === i).slice(0,3)
    if (!distractors.length) return [{ kind: 'blank', prompt, answer: term }]
    const options = [...distractors]
    options.splice(index % (options.length + 1), 0, term)
    return [{ kind, prompt, answer: term, options }]
  })
}
export function isCorrect(question: Question, answer = '') {
  return question.kind !== 'long' && answer.trim().toLowerCase() === question.answer.trim().toLowerCase()
}
