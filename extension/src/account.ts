import { API_BASE } from './api'
export type User = { id: string; name: string; email: string }
export type Account = { token: string; user: User }
export type SavedProgress = { version: 1; notes: string; noteName: string; count: number; hintsOn: boolean; questions: { prompt: string; answer: string }[]; answers: string[]; submitted: boolean; questionIndex: number; studyDays: string[] }
export function parseProgress(raw: string): SavedProgress {
  const v = JSON.parse(raw)
  if (v?.version !== 1 || typeof v.notes !== 'string' || typeof v.noteName !== 'string' || typeof v.hintsOn !== 'boolean'
    || !Array.isArray(v.questions) || v.questions.length > 15 || !v.questions.every((q: { prompt?: unknown; answer?: unknown }) => q && typeof q.prompt === 'string' && typeof q.answer === 'string')
    || !Array.isArray(v.answers) || !v.answers.every((a: unknown) => typeof a === 'string') || typeof v.submitted !== 'boolean'
    || !Array.isArray(v.studyDays) || !v.studyDays.every((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('Saved progress could not be read. Your workspace has not been changed.')
  return { version: 1, notes: v.notes, noteName: v.noteName, count: [5,10,15].includes(v.count) ? v.count : 5, hintsOn: v.hintsOn, questions: v.questions,
    answers: v.questions.map((_: unknown, i: number) => v.answers[i] ?? ''), submitted: v.submitted,
    questionIndex: Math.max(0, Math.min(Number.isInteger(v.questionIndex) ? v.questionIndex : 0, v.questions.length - 1)), studyDays: [...new Set<string>(v.studyDays)].sort().slice(-366) }
}
export function readToken(): string | null { try { return sessionStorage.getItem('recall-session') } catch { return null } }
export function rememberToken(token: string | null) { try { if (token) sessionStorage.setItem('recall-session', token); else sessionStorage.removeItem('recall-session') } catch { /* Session stays in memory. */ } }
export async function accountRequest(path: string, body?: unknown, token?: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/account/${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ?? AbortSignal.timeout(15000) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(response.status === 400 ? 'Check your details. New passwords need at least 10 characters.' : data.message ?? data.detail ?? (response.status === 401 ? 'Please sign in again.' : response.status === 409 ? 'An account already exists for this email.' : response.status === 429 ? 'Too many attempts. Please wait five minutes.' : 'Account storage is unavailable. Try again.'))
  return data
}
export async function saveProgress(account: Account, progress: SavedProgress, signal?: AbortSignal) { return accountRequest('progress', { progress: JSON.stringify(progress) }, account.token, signal) }
