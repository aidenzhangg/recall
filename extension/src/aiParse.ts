// Turns a language model's reply into validated study items. Anything malformed is dropped rather than shown.
export type AiQuestion = { kind: 'choice' | 'long'; prompt: string; answer: string; options?: string[]; topic: string; explanation?: string; source: string }
export type AiCard = { front: string; back: string }

/** Models often wrap JSON in prose or code fences; take the outermost array. */
export function extractArray(text: string): unknown[] {
  const start = text.indexOf('['); const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try { const value: unknown = JSON.parse(text.slice(start, end + 1)); return Array.isArray(value) ? value : [] } catch { return [] }
}
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

export function parseQuestions(text: string, limit: number): AiQuestion[] {
  const seen = new Set<string>()
  const questions: AiQuestion[] = []
  for (const raw of extractArray(text)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const prompt = clean(item.question, 600); const answer = clean(item.answer, 1500)
    const topic = clean(item.topic, 80) || prompt.slice(0, 60)
    const explanation = clean(item.explanation, 800) || undefined
    if (prompt.length < 8 || !answer || seen.has(prompt.toLowerCase())) continue
    if (Array.isArray(item.options)) {
      const options = [...new Set(item.options.map(option => clean(option, 200)).filter(Boolean))].slice(0, 4)
      // The answer must be one of the options verbatim, or the question cannot be marked.
      const match = options.find(option => option.toLowerCase() === answer.toLowerCase())
      if (options.length < 3 || !match) continue
      questions.push({ kind: 'choice', prompt, answer: match, options, topic, explanation, source: `ai:${prompt}` })
    } else questions.push({ kind: 'long', prompt, answer, topic, explanation, source: `ai:${prompt}` })
    seen.add(prompt.toLowerCase())
    if (questions.length >= limit) break
  }
  return questions
}
export function parseCards(text: string, limit: number): AiCard[] {
  const cards: AiCard[] = []
  for (const raw of extractArray(text)) {
    if (!raw || typeof raw !== 'object') continue
    const front = clean((raw as Record<string, unknown>).front, 200); const back = clean((raw as Record<string, unknown>).back, 700)
    if (front && back && !cards.some(card => card.front.toLowerCase() === front.toLowerCase())) cards.push({ front, back })
    if (cards.length >= limit) break
  }
  return cards
}

/** Picks the part of the notes to show the model: passages matching the focus first, then the rest, within a size budget. */
export function excerpt(passages: string[], focus: string, budget: number): string {
  const tokens = focus.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3)
  const matching = tokens.length ? passages.filter(passage => tokens.some(token => passage.toLowerCase().includes(token))) : []
  const ordered = [...matching, ...passages.filter(passage => !matching.includes(passage))]
  let text = ''
  for (const passage of ordered) {
    if (text.length + passage.length + 1 > budget) { if (!text) text = passage.slice(0, budget); break }
    text += (text ? '\n' : '') + passage
  }
  return text
}
