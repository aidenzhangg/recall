// Optional on-device language model: Chrome's built-in Prompt API (Gemini Nano).
// It runs inside the browser, so there is no API key, no account and no request to an AI service.
// When the browser does not provide it, Recall keeps using its notes search.
type Session = { prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>; destroy(): void }
type Monitor = { addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void }
type PromptApi = {
  availability(): Promise<string>
  create(options?: { initialPrompts?: { role: 'system'; content: string }[]; monitor?: (monitor: Monitor) => void }): Promise<Session>
}
export type ModelStatus = 'ready' | 'downloadable' | 'downloading' | 'unavailable'

function promptApi(): PromptApi | null {
  const candidate = (globalThis as { LanguageModel?: PromptApi }).LanguageModel
  return candidate && typeof candidate.availability === 'function' && typeof candidate.create === 'function' ? candidate : null
}
export async function modelStatus(): Promise<ModelStatus> {
  try {
    const state = await promptApi()?.availability()
    return state === 'available' ? 'ready' : state === 'downloadable' || state === 'downloading' ? state : 'unavailable'
  } catch { return 'unavailable' }
}
/** Must be called from a click: Chrome only starts the model download after a user gesture. */
export async function downloadModel(onProgress: (percent: number) => void): Promise<boolean> {
  try {
    const session = await promptApi()!.create({ monitor: monitor => monitor.addEventListener('downloadprogress', event => onProgress(Math.round(event.loaded * 100))) })
    session.destroy()
    return true
  } catch { return false }
}

const SYSTEM = 'You are Recall, a study tutor inside a student\'s notes app. Be accurate, plain and brief: at most four sentences, no markdown, no preamble.'
export function buildPrompt(input: { message: string; sources: string[]; hidden?: string }): string {
  const notes = input.sources.length
    ? `Answer using ONLY these lines from the student's notes. If they do not answer the question, say the notes do not cover it.\n${input.sources.map(source => `- ${source.slice(0, 1200)}`).join('\n')}`
    : 'The student\'s notes do not cover this. Answer from general knowledge, and say "I am not sure" rather than guessing.'
  const guard = input.hidden ? `\nThe student is being quizzed. Never write the term "${input.hidden}" or spell it out; guide them toward it instead.` : ''
  return `${notes}${guard}\n\nStudent: ${input.message.slice(0, 1000)}`
}
/** Returns null when the model is missing, fails, times out or leaks a hidden quiz answer, so callers can fall back. */
export async function explain(input: { message: string; sources: string[]; hidden?: string }): Promise<string | null> {
  const api = promptApi()
  if (!api) return null
  let session: Session | undefined
  try {
    session = await api.create({ initialPrompts: [{ role: 'system', content: SYSTEM }] })
    const text = (await session.prompt(buildPrompt(input), { signal: AbortSignal.timeout(45000) })).trim()
    if (!text || (input.hidden && text.toLowerCase().includes(input.hidden.toLowerCase()))) return null
    return text.slice(0, 2000)
  } catch { return null }
  finally { session?.destroy() }
}
