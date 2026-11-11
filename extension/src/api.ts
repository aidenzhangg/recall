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

export async function requestQuiz(notes: string, count: number, format: QuizFormat, history: ReviewItem[]): Promise<Question[]> {
  const response = await fetch(`${API_BASE}/study/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({notes, count, format, history}), signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Quiz service unavailable')
  const data: unknown = await response.json()
  if (!Array.isArray(data) || data.length > 15 || !data.every(q => q && typeof q.prompt === 'string' && typeof q.answer === 'string' && typeof q.source === 'string' && typeof q.topic === 'string' && ['blank','choice','long'].includes(q.kind) && (q.kind !== 'choice' || (Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 && q.options.every((option: unknown) => typeof option === 'string') && new Set(q.options).size === q.options.length && q.options.includes(q.answer))))) throw new Error('Invalid quiz response')
  return data
}

export async function extractPdf(file: File): Promise<string> {
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
  return data.text
}
