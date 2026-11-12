// Study features written by a language model from the student's notes, instead of copied sentences.
import { complete, currentEngine } from './ai'
import type { ChatMessage } from './ai'
import { excerpt, parseCards, parseQuestions } from './aiParse'
import type { AiCard } from './aiParse'
import { studyPassages } from './quiz'
import type { Question, QuizFormat } from './quiz'
import { searchNotes } from './tutor'

const TUTOR = 'You are Recall, a friendly, precise study tutor. Explain ideas in your own words, simply, as you would to a classmate. Use short paragraphs or a short list. Do not use markdown symbols such as ** or #.'

/** Returns [] when no model is available so the caller can use the rule-based generator. */
export async function aiQuestions(notes: string, count: number, format: QuizFormat, focus: string, weak: string[]): Promise<{ questions: Question[]; label: string }> {
  const engine = await currentEngine()
  if (engine.kind === 'none' || format === 'blank') return { questions: [], label: '' }
  const material = excerpt(studyPassages(notes), focus, engine.budget)
  if (material.length < 80) return { questions: [], label: '' }
  const shape = format === 'long'
    ? 'Each item: {"question": an open question that needs a 2-4 sentence answer, "answer": a model answer, "topic": 1-3 words}.'
    : format === 'mixed'
      ? 'Alternate two kinds. Multiple choice: {"question", "options": exactly 4 short options, "answer": the correct option copied exactly, "explanation": one sentence on why, "topic": 1-3 words}. Open: {"question", "answer": a model answer, "topic"} with no options.'
      : 'Each item: {"question", "options": exactly 4 short options, "answer": the correct option copied exactly, "explanation": one sentence on why it is right, "topic": 1-3 words}.'
  const prompt = `Write ${count} exam-style questions that test understanding of the notes below.
Rules: ask about meaning, cause, comparison or application, never "fill in the missing word". Do not copy sentences from the notes; rephrase. Wrong options must be plausible and about the same subject. Use only facts in the notes. Skip course logistics (dates, instructors, grading).${focus.trim() ? ` Focus on: ${focus.trim()}.` : ''}${weak.length ? ` The student recently got these wrong, so include them: ${weak.slice(0, 5).join(', ')}.` : ''}
Reply with ONLY a JSON array. ${shape}

NOTES:
${material}`
  const questions = parseQuestions(await complete([{ role: 'system', content: 'You write accurate study questions and reply with JSON only.' }, { role: 'user', content: prompt }]), count)
  return { questions, label: engine.label }
}

export async function aiCards(notes: string, count: number): Promise<AiCard[]> {
  const engine = await currentEngine()
  if (engine.kind === 'none') return []
  const material = excerpt(studyPassages(notes), '', engine.budget)
  if (material.length < 80) return []
  const prompt = `Make ${count} flashcards from the notes below. "front" is a term or a short question. "back" is a clear explanation in your own words, 1-2 sentences, not a copied sentence. Cover the most important ideas, one per card. Use only facts in the notes.
Reply with ONLY a JSON array of {"front", "back"}.

NOTES:
${material}`
  return parseCards(await complete([{ role: 'system', content: 'You write accurate flashcards and reply with JSON only.' }, { role: 'user', content: prompt }]), count)
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
/** A real conversation: earlier turns are kept, and the notes most relevant to the latest message are attached. */
export async function chat(input: { notes: string; history: ChatTurn[]; message: string; hidden?: string; quizPrompt?: string; options?: string[]; hintLevel?: number; onText?: (text: string) => void }): Promise<{ text: string; sources: string[]; label: string }> {
  const engine = await currentEngine()
  if (engine.kind === 'none') throw new Error('No AI model is set up.')
  const passages = studyPassages(input.notes)
  const hinting = input.hintLevel !== undefined && !!input.quizPrompt
  const sources = searchNotes(passages, hinting ? `${input.quizPrompt} ${input.hidden ?? ''}` : input.message, 6)
  const steps = [
    'This is hint 1 of 3. Explain the idea the question is testing in two or three sentences, and what to think about, so they can reason their way to it.',
    'This is hint 2 of 3. Be more specific: narrow it down, and if there are options, rule out one wrong option and say why it is wrong.',
    'This is hint 3 of 3. Get them almost there: describe exactly what the answer is or does and how it differs from the closest wrong option, without naming it.',
  ]
  const context = sources.length ? sources.join('\n') : excerpt(passages, '', Math.min(engine.budget, 3000))
  const system = [TUTOR,
    context ? `The student's notes say:\n${context}\n\nPrefer these notes. If you add something that is not in them, say that it is outside their notes.` : 'The student has not added notes yet. Answer from general knowledge and say "I am not sure" rather than guessing.',
    input.quizPrompt ? `The student is working on this quiz question: "${input.quizPrompt}"${input.options?.length ? `\nOptions: ${input.options.join(' | ')}` : ''}` : '',
    input.hidden ? `The correct answer is "${input.hidden}". They must work it out themselves, so never write that answer, spell it, or give its first letter or length. Teach the idea instead.` : '',
    hinting ? `${steps[Math.min(input.hintLevel!, 2)]} Give a real hint about the meaning, never a hint about letters or word length.` : '',
  ].filter(Boolean).join('\n\n')
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...input.history.slice(-8), { role: 'user', content: input.message.slice(0, 2000) }]
  // A reply that must hide an answer is checked before it is shown, so it is not streamed.
  const tidy = (value: string) => value.replace(/\*\*|^#+\s*/gm, '').slice(0, 4000)
  const text = tidy(await complete(messages, undefined, input.hidden || !input.onText ? undefined : value => input.onText!(tidy(value))))
  if (input.hidden && text.toLowerCase().includes(input.hidden.toLowerCase())) throw new Error('leak')
  return { text, sources: hinting ? [] : sources.slice(0, 3), label: engine.label }
}

/** Short feedback on a written answer. Returns '' when no model is available. */
export async function gradeAnswer(input: { notes: string; prompt: string; answer: string; reference: string }): Promise<string> {
  const engine = await currentEngine()
  if (engine.kind === 'none') return ''
  const context = searchNotes(studyPassages(input.notes), input.prompt, 5).join('\n')
  const text = await complete([
    { role: 'system', content: `${TUTOR} You mark written answers fairly and briefly.` },
    { role: 'user', content: `Question: ${input.prompt}\n\nStudent's answer: ${input.answer.slice(0, 3000)}\n\n${context ? `Relevant notes:\n${context}\n\n` : ''}${input.reference.length < 1500 ? `Reference: ${input.reference}\n\n` : ''}Start with one line: "Mark: strong", "Mark: partly right" or "Mark: needs work". Then say in two to four sentences what they got right, what is missing or wrong, and how to improve it.` },
  ])
  return text.replace(/\*\*|^#+\s*/gm, '').slice(0, 2000)
}
