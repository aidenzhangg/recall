import type { Question, QuizFormat, ReviewItem } from './quiz'
// Where the Spring Boot server runs during development
export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8080/api').replace(/\/$/, '')

// Returns true if the server answers /api/health with {"status":"ok"}
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return false
    const data: { status?: string } = await response.json()
    return data.status === 'ok'
  } catch {
    // fetch throws when the server isn't running at all
    return false
  }
}

export async function requestHint(question: string, message: string): Promise<{ hint: string; mode: 'local' }> {
  const response = await fetch(`${API_BASE}/hints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, message }),
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error('Hint request failed')
  const data = await response.json()
  if (typeof data.hint !== 'string' || data.mode !== 'local') throw new Error('Invalid hint response')
  return data
}

export async function requestQuiz(notes: string, count: number, format: QuizFormat, history: ReviewItem[], focus = ''): Promise<Question[]> {
  const response = await fetch(`${API_BASE}/study/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({notes, count, format, history, focus}), signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Quiz service unavailable')
  const data: unknown = await response.json()
  if (!Array.isArray(data) || data.length > 15 || !data.every(q => q && typeof q.prompt === 'string' && typeof q.answer === 'string' && typeof q.source === 'string' && typeof q.topic === 'string' && ['blank','choice','long'].includes(q.kind) && (q.kind !== 'choice' || (Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 && q.options.every((option: unknown) => typeof option === 'string') && new Set(q.options).size === q.options.length && q.options.includes(q.answer))))) throw new Error('Invalid quiz response')
  return data
}

export type CloudAi = { enabled: boolean; model: string }
/** Whether the backend has an AI provider configured. The key itself never leaves the backend. */
export async function cloudAiStatus(): Promise<CloudAi> {
  try {
    const response = await fetch(`${API_BASE}/ai`, { signal: AbortSignal.timeout(5000) })
    const data = response.ok ? await response.json() : {}
    return { enabled: data.enabled === true, model: typeof data.model === 'string' ? data.model : '' }
  } catch { return { enabled: false, model: '' } }
}
export async function askCloudAi(token: string, input: { message: string; sources: string[]; hidden?: string }): Promise<string> {
  const response = await fetch(`${API_BASE}/ai/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: input.message.slice(0, 1000), sources: input.sources.slice(0, 6).map(source => source.slice(0, 1200)), ...(input.hidden ? { hidden: input.hidden.slice(0, 200) } : {}) }), signal: AbortSignal.timeout(45000) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.text !== 'string' || !data.text.trim()) throw new Error(typeof data.message === 'string' ? data.message : 'The AI request failed.')
  return data.text.trim()
}

export type PdfImport = { text: string; pageCount: number; pages: { number: number; words: number }[]; warnings: string[] }
export async function extractPdfDocument(file: File): Promise<PdfImport> {
  const body = new FormData(); body.append('file', file)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/material/extract`, {method:'POST', body, signal:AbortSignal.timeout(30000)})
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      throw new Error('PDF import timed out. Try a smaller PDF or retry once the backend is ready.', { cause: error })
    throw new Error('Cannot reach the Recall backend. Start the Java server, then click Check connection and retry the import.', { cause: error })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'PDF import failed. Start the backend and try a text-based PDF up to 20 MB.')
  if (typeof data.text !== 'string' || data.text.length > 200000) throw new Error('Invalid extracted text')
  return {
    text: data.text,
    pageCount: Number.isInteger(data.pageCount) && data.pageCount > 0 ? data.pageCount : 0,
    pages: Array.isArray(data.pages) ? data.pages.filter((page: { number?: unknown; words?: unknown }) => Number.isInteger(page?.number) && Number.isInteger(page?.words)) : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((warning: unknown) => typeof warning === 'string') : [],
  }
}
export async function extractPdf(file: File): Promise<string> {
  return (await extractPdfDocument(file)).text
}
