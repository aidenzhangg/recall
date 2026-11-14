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
export async function chat(input: { notes: string; history: ChatTurn[]; message: string; subject?: string; hidden?: string; quizPrompt?: string; options?: string[]; hintLevel?: number; onText?: (text: string) => void }): Promise<{ text: string; sources: string[]; label: string }> {
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
    input.subject ? `This chat is about ${input.subject.slice(0, 30)}. Answer as a ${input.subject.slice(0, 30)} tutor, and use examples from ${input.subject.slice(0, 30)}.` : '',
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

const plain = (text: string) => text.replace(/^```\w*\n?|```$/gm, '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim()
/** A new exam in the same format as a past paper: same layout, numbering and marks, different questions. */
export async function predictPaper(paper: string, changes = ''): Promise<{ text: string; cut: boolean }> {
  const engine = await currentEngine()
  if (engine.kind === 'none') throw new Error('Connect an AI in Recall AI first.')
  const budget = engine.kind === 'key' ? 14000 : 4000
  const original = paper.trim().slice(0, budget)
  const text = await complete([
    { role: 'system', content: 'You are an experienced examiner who writes practice exam papers. You reply with the paper only, as plain text.' },
    { role: 'user', content: `Below is a past exam paper. Write a NEW paper that predicts what a future sitting could look like.

Keep exactly the same format, line by line: the same title and header lines (add "Prediction paper" to the title), the same instructions, the same section headings, the same question numbering and sub-parts such as (a), (b), (i), the same mark allocations written the same way, the same number of questions, and the same question types (multiple choice stays multiple choice with the same number of options, calculations stay calculations, essays stay essays).

Change every question: test the same topics and skills at the same difficulty, but with different wording, different scenarios and different numbers. Do not repeat any original question. Do not include answers. Do not add notes, commentary or markdown. Keep the line breaks and blank lines of the original layout.
${changes.trim() ? `\nThe student asked for these changes, which override the rules above where they conflict: ${changes.trim().slice(0, 400)}\n` : ''}
PAST PAPER:
${original}` },
  ])
  const written = plain(text)
  if (written.length < 40) throw new Error('The AI did not return a usable paper. Try again.')
  return { text: written.slice(0, 30000), cut: paper.trim().length > budget }
}
/** Model answers for a generated paper, numbered the same way. */
export async function markScheme(paper: string): Promise<string> {
  const text = await complete([
    { role: 'system', content: 'You are an examiner writing a concise mark scheme. Plain text only.' },
    { role: 'user', content: `Write a mark scheme for this paper. Use the same question numbers and sub-parts. For each, give the answer or the key points that earn the marks, matching the marks available. Be brief. No markdown.\n\nPAPER:\n${paper.slice(0, 14000)}` },
  ])
  return plain(text).slice(0, 30000)
}

export type Difficulty = 'easier' | 'same' | 'harder'
export type ProblemSet = { problems: string; answers: string; label: string }
const ANSWERS = '===ANSWERS==='
/** A set of practice problems on one topic, with worked answers kept separate so they can go at the back. */
export async function problemSet(input: { notes: string; topic: string; count: number; difficulty: Difficulty; extra?: string; weak: string[] }): Promise<ProblemSet> {
  const engine = await currentEngine()
  if (engine.kind === 'none') throw new Error('no-ai')
  const topic = input.topic.trim().slice(0, 120)
  const material = excerpt(studyPassages(input.notes), topic, Math.min(engine.budget, 9000))
  const level = input.difficulty === 'easier' ? 'a little easier than a typical exam, to build confidence' : input.difficulty === 'harder' ? 'harder than a typical exam, with multi-step problems' : 'at typical exam difficulty'
  const text = await complete([
    { role: 'system', content: 'You are an experienced teacher writing a practice problem set. Plain text only, no markdown.' },
    { role: 'user', content: `Write a problem set of ${input.count} problems${topic ? ` on ${topic}` : ''}, ${level}.
Mix problem types that suit the subject: calculations with real numbers, short explanations, applying ideas to new situations, and a few multi-part problems with (a), (b). Number them 1, 2, 3... and show marks in brackets like [3 marks].${input.weak.length ? `\nThe student keeps getting these wrong, so give them extra problems: ${input.weak.slice(0, 5).join(', ')}.` : ''}${input.extra?.trim() ? `\nAlso: ${input.extra.trim().slice(0, 300)}` : ''}
Then write a line containing only ${ANSWERS} and after it a worked answer for every problem, numbered the same, showing the steps.
${material.length >= 80 ? `Base the problems on these notes. You may use standard knowledge of the topic beyond them, but stay consistent with the notes:\n${material}` : 'There are no notes, so use standard course knowledge of the topic.'}` },
  ])
  const [problems, answers = ''] = plain(text).split(ANSWERS)
  if (problems.trim().length < 40) throw new Error('The AI did not return a usable problem set. Try again.')
  return { problems: problems.trim().slice(0, 30000), answers: answers.trim().slice(0, 30000), label: engine.label }
}
