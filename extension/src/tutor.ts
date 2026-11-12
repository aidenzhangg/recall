// Recall AI: answers come from the student's own notes. Everything here runs locally with
// plain text matching - no model and no network - so replies can only quote what was imported.
export type Resource = { label: string; url: string }
export type TutorQuestion = { prompt: string; answer: string; kind?: string; source?: string; options?: string[] }
export type TutorReply = { text: string; sources: string[]; resources: Resource[]; /** True for a notes lookup (as opposed to a quiz hint or answer). */ lookup?: boolean; /** True for a stepped quiz hint. */ hint?: boolean }

const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our '
  + 'should so some than that the their them then there these they this those to was we were what when where which who why will with would you your '
  + 'about explain describe define tell give mean means meaning definition please help understand know dont not no any more again').split(' '))
const REVEAL = /\b(?:show|tell|give|reveal)\b.*\banswer\b|\bwhat(?:'s| is) the answer\b|\bgive up\b/i
const HELP = /\b(?:hints?|stuck|answer|help|clue|idk|no idea|blank|missing|give up|don'?t (?:know|get|understand)|not sure|confused)\b/i

function stem(word: string) {
  return word.length > 4 ? word.replace(/ies$/, 'y').replace(/(?:ing|ed|es|s)$/, '') : word
}
function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(word => word.length >= 2 && !STOP.has(word)).map(stem)
}
function escapeRegex(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function redact(text: string, term: string) {
  return term.trim() ? text.replace(new RegExp(`(?<![A-Za-z])${escapeRegex(term.trim())}(?![A-Za-z])`, 'gi'), '________') : text
}

/** The subject of a message with question words removed, e.g. "what is osmosis?" -> "osmosis". */
export function queryTopic(message: string): string {
  return (message.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? []).filter(word => !STOP.has(word.toLowerCase().replace(/'/g, ''))).slice(0, 6).join(' ')
}

/** Search links for a topic. These open a search on each site; they are not curated recommendations. */
export function resourceLinks(topic: string): Resource[] {
  const query = encodeURIComponent(topic.trim().slice(0, 120))
  if (!query) return []
  return [
    { label: 'Wikipedia', url: `https://en.wikipedia.org/wiki/Special:Search?search=${query}` },
    { label: 'Khan Academy', url: `https://www.khanacademy.org/search?page_search_query=${query}` },
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${query}+explained` },
    { label: 'MIT OpenCourseWare', url: `https://ocw.mit.edu/search/?q=${query}` },
  ]
}

/** Passages ranked by how many of the question's keywords they contain; rarer keywords count for more. */
export function searchNotes(passages: string[], query: string, limit = 3): string[] {
  const wanted = [...new Set(tokens(query))]
  if (!wanted.length || !passages.length) return []
  const sets = passages.map(passage => new Set(tokens(passage)))
  const weight = new Map(wanted.map(token => [token, Math.log(1 + passages.length / Math.max(1, sets.filter(set => set.has(token)).length))]))
  const phrase = queryTopic(query).toLowerCase()
  return passages.map((passage, index) => {
    const matched = wanted.filter(token => sets[index].has(token))
    const lower = passage.toLowerCase()
    const bonus = phrase.includes(' ') && lower.includes(phrase) ? 1 : 0
    const defines = phrase && lower.replace(/^(?:the|an?) /, '').startsWith(phrase) ? 1 : 0
    return { passage, index, coverage: matched.length / wanted.length, score: matched.reduce((sum, token) => sum + weight.get(token)!, 0) + bonus + defines }
  }).filter(hit => hit.coverage >= .5).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(hit => hit.passage)
}

function pattern(answer: string, reveal: number) {
  return answer.split(/\s+/).map(word => [...word].map((char, i) => !/[A-Za-z0-9]/.test(char) || i === 0 || (reveal > 1 && (i === word.length - 1 || i % 2 === 0)) ? char : '_').join(' ')).join('   ')
}

function hintFor(question: TutorQuestion, passages: string[], level: number): TutorReply {
  const answer = question.answer.trim()
  if (question.kind === 'long') {
    const related = question.source ? [question.source] : searchNotes(passages, question.prompt, 2)
    const keywords = [...new Set(related.flatMap(passage => passage.match(/[A-Za-z][A-Za-z-]{5,}/g) ?? []).map(word => word.toLowerCase()))].filter(word => !STOP.has(word) && !question.prompt.toLowerCase().includes(word)).slice(0, 5)
    if (!keywords.length) return { text: 'Start with a one-sentence definition, then say what it does and why it matters. I could not find a matching passage in your notes for this question.', sources: [], resources: resourceLinks(queryTopic(question.prompt)) }
    return level === 0
      ? { text: `A strong answer covers these ideas from your notes: ${keywords.join(', ')}. Try writing one sentence for each.`, sources: [], resources: [] }
      : { text: 'Here is the passage this question is based on. Read it, close it, then write the answer in your own words.', sources: related, resources: [] }
  }
  // Hints are about meaning first: what the notes say about the answer, with the answer itself masked.
  const mentions = new RegExp(`(?<![A-Za-z])${escapeRegex(answer)}(?![A-Za-z])`, 'i')
  const about = passages.filter(passage => mentions.test(passage)).sort((a, b) => Number(a === question.source) - Number(b === question.source)).map(passage => redact(passage, answer))
  const wrong = question.options?.filter(option => option.toLowerCase() !== answer.toLowerCase()) ?? []
  // What the notes say about a wrong option shows why it does not fit.
  const describe = (option: string) => passages.find(passage => new RegExp(`(?<![A-Za-z])${escapeRegex(option)}(?![A-Za-z])`, 'i').test(passage) && !mentions.test(passage))
  if (level === 0) return about.length
    ? { text: 'Think about what the question is describing. Your notes talk about the answer here, with the term hidden:', sources: about.slice(0, 1), resources: [] }
    : { text: 'Break the question down: what kind of thing is being described, and what does it do? Match that against each option rather than the wording.', sources: [], resources: [] }
  if (level === 1) {
    const ruled = wrong.find(describe)
    if (ruled) return { text: `You can rule out "${ruled}". Your notes describe it differently:`, sources: [describe(ruled)!], resources: [] }
    if (about.length > 1) return { text: 'Here is another place your notes mention it:', sources: about.slice(1, 2), resources: [] }
    return { text: wrong.length > 1 ? `It is not "${wrong[0]}". Compare what is left with the description in the question.` : 'Reread the description and say in your own words what it does. The term for that is the answer.', sources: [], resources: [] }
  }
  const remaining = wrong.slice(-1)
  return { text: `${question.options?.length && remaining.length ? `It is not "${remaining[0]}" either. ` : ''}Last hint, the shape of the word: ${pattern(answer, 1)}\nAsk me to show the answer if you are still stuck.`, sources: [], resources: [] }
}

export function tutorReply(input: { passages: string[]; message: string; question?: TutorQuestion; hintsOn: boolean; level?: number }): TutorReply {
  const { passages, message, question, hintsOn, level = 0 } = input
  const topic = queryTopic(message)
  const wantsHelp = HELP.test(message) || !topic
  const hide = (text: string) => question && hintsOn && question.kind !== 'long' ? redact(text, question.answer) : text
  if (question && wantsHelp) {
    // Hints first; after the last hint, asking for the answer shows it even with Hints Mode on.
    if (hintsOn && !(REVEAL.test(message) && level >= 3)) return { ...hintFor(question, passages, Math.min(level, 2)), hint: true }
    return question.kind === 'long'
      ? { text: 'Reference from your notes:', sources: [question.source ?? question.answer], resources: [] }
      : { text: `The answer is "${question.answer}".${question.source ? ' It comes from this line in your notes:' : ''}`, sources: question.source ? [question.source] : [], resources: resourceLinks(question.answer) }
  }
  if (!topic) return { text: 'Ask me about something in your notes, for example "What is osmosis?" or "How does the Krebs cycle work?". Pick a quiz question above if you want a hint for it.', sources: [], resources: [] }
  const hits = searchNotes(passages, message)
  if (hits.length) return { text: `Here is what your notes say about ${hide(topic)}:`, sources: hits.map(hide), resources: resourceLinks(topic), lookup: true }
  if (question && hintsOn) {
    const hint = hintFor(question, passages, Math.min(level, 2))
    return { ...hint, hint: true, text: `I could not find "${topic}" in your notes, so here is a hint for the question instead. ${hint.text}` }
  }
  return {
    text: passages.length
      ? `I could not find "${topic}" in your notes. Try a keyword that appears in them, or look it up here:`
      : `You have not added any notes yet, so I have nothing to answer from. Add notes and I will quote the relevant parts. Until then, you can look up "${topic}" here:`,
    sources: [], resources: resourceLinks(topic), lookup: true,
  }
}
