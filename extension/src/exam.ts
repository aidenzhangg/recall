// Pulls numbered questions out of an imported past paper so they can be practised one at a time.
const START = /^(?:(?:Q|Question)\s*)?(\d{1,2})\s*[.):]\s+(?=\S)/i
const ASKS = /^(?:explain|describe|define|calculate|state|compare|contrast|discuss|show|prove|derive|find|determine|what|why|how|which|when|where|who|give|list|name|outline|identify|evaluate|sketch|draw|solve|compute|write|suggest|estimate|justify|using|consider|suppose|given)\b/i
const MARKS = /[[(]\s*\d+\s*(?:marks?|pts?|points?)\s*[\])]/i
const RUBRIC = /answer (?:all|any|both|each)|calculators?|write your (?:name|answers)|time allowed|do not (?:open|turn)|this (?:paper|exam) (?:has|contains|consists)/i

export function examQuestions(text: string, limit = 15): string[] {
  const found: string[] = []
  let current = ''
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (/^(?:Page\s+)?\d+(?:\s+(?:of|\/)\s+\d+)?$/i.test(line)) continue
    const start = line.match(START)
    if (start) { if (current) found.push(current); current = line.slice(start[0].length) }
    else if (current && line) current += ` ${line}`
  }
  if (current) found.push(current)
  const questions = found.map(question => question.replace(/\s+/g, ' ').trim())
    .filter(question => question.length >= 15 && question.length <= 1500 && !RUBRIC.test(question) && (question.includes('?') || MARKS.test(question) || ASKS.test(question)))
  // A single match is more likely a numbered note than a paper.
  return questions.length >= 2 ? [...new Set(questions)].slice(0, limit) : []
}
