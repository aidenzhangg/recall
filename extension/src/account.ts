import type { Question, QuizFormat, ReviewItem } from './quiz'
import { API_BASE } from './api'
export type User = { id: string; name: string; email: string }
export type Account = { token: string; user: User }
export type SavedProgress = { version: 1; notes: string; noteName: string; count: number; format?: QuizFormat; hintsOn: boolean; questions: Question[]; answers: string[]; submitted: boolean; questionIndex: number; studyDays: string[]; review?: ReviewItem[]; adaptive?: boolean }
export function parseProgress(raw: string): SavedProgress {
  const v = JSON.parse(raw)
  if (v?.version !== 1 || typeof v.notes !== 'string' || typeof v.noteName !== 'string' || typeof v.hintsOn !== 'boolean'
    || !Array.isArray(v.questions) || v.questions.length > 15 || !v.questions.every((q: { prompt?: unknown; answer?: unknown }) => q && typeof q.prompt === 'string' && typeof q.answer === 'string')
    || !Array.isArray(v.answers) || !v.answers.every((a: unknown) => typeof a === 'string') || typeof v.submitted !== 'boolean'
    || !Array.isArray(v.studyDays) || !v.studyDays.every((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('Saved progress could not be read. Your workspace has not been changed.')
  const review: ReviewItem[] = Array.isArray(v.review) ? v.review.filter((item: ReviewItem) => item && typeof item.source === 'string' && item.source.length <= 20000 && typeof item.topic === 'string' && item.topic.length <= 4000 && Number.isInteger(item.misses) && item.misses >= 0 && Number.isInteger(item.successes) && item.successes >= 0 && Number.isFinite(item.dueAt)).slice(-250) : []
  return { review, adaptive: v.adaptive !== false, version: 1, notes: v.notes, noteName: v.noteName, count: [5,10,15].includes(v.count) ? v.count : 5, hintsOn: v.hintsOn, format: ['blank','choice','long','mixed'].includes(v.format) ? v.format : 'blank', questions: v.questions.map((q: Question) => {
      const kind = q.kind ?? 'blank'
      if (!['blank','choice','long'].includes(kind) || (kind === 'choice' && (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !q.options.every(option => typeof option === 'string') || new Set(q.options).size !== q.options.length || !q.options.includes(q.answer)))) throw new Error('Invalid saved question')
      return { prompt: q.prompt, answer: q.answer, kind, ...(typeof q.source === 'string' ? { source: q.source } : {}), ...(typeof q.topic === 'string' ? { topic: q.topic } : {}), ...(kind === 'choice' ? { options: q.options } : {}) }
    }),
    answers: v.questions.map((_: unknown, i: number) => v.answers[i] ?? ''), submitted: v.submitted,
    questionIndex: Math.max(0, Math.min(Number.isInteger(v.questionIndex) ? v.questionIndex : 0, v.questions.length - 1)), studyDays: [...new Set<string>(v.studyDays)].sort().slice(-366) }
}
export function readToken(): string | null { try { return sessionStorage.getItem('recall-session') } catch { return null } }
export function rememberToken(token: string | null) { try { if (token) sessionStorage.setItem('recall-session', token); else sessionStorage.removeItem('recall-session') } catch { /* Session stays in memory. */ } }
export async function accountRequest(path: string, body?: unknown, token?: string, signal?: AbortSignal) {
  let response: Response
  try { response = await fetch(`${API_BASE}/account/${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ?? AbortSignal.timeout(15000) }) }
  catch (failure) {
    if (signal?.aborted) throw failure
    throw new Error('Cannot reach the Recall backend. Run start-backend.cmd in the recall folder, wait for "Started BackendApplication", then try again.', { cause: failure })
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(response.status === 400 ? 'Check your details. New passwords need at least 10 characters.' : data.message ?? data.detail ?? (response.status === 401 ? 'Please sign in again.' : response.status === 409 ? 'An account already exists for this email.' : response.status === 429 ? 'Too many attempts. Please wait five minutes.' : 'Account storage is unavailable. Try again.'))
  return data
}
/** Opens Google's sign-in window from the extension and exchanges the resulting ID token for a Recall session. */
export async function googleSignIn(): Promise<{ token: string; user: User; progress?: string | null }> {
  const { clientId } = await accountRequest('google')
  if (typeof clientId !== 'string' || !clientId) throw new Error('Google sign-in is not set up yet. Set RECALL_GOOGLE_CLIENT_ID for the backend and restart it. The README has the steps.')
  if (typeof chrome === 'undefined' || !chrome.identity?.launchWebAuthFlow) throw new Error('Google sign-in works in the installed Chrome extension. Reload Recall at chrome://extensions and try again.')
  const nonce = crypto.randomUUID()
  const query = new URLSearchParams({ client_id: clientId, response_type: 'id_token', redirect_uri: chrome.identity.getRedirectURL(), scope: 'openid email profile', nonce, prompt: 'select_account' })
  let redirect: string | undefined
  try { redirect = await chrome.identity.launchWebAuthFlow({ url: `https://accounts.google.com/o/oauth2/v2/auth?${query}`, interactive: true }) }
  catch (failure) { throw new Error('Google sign-in was cancelled or blocked. Check that the redirect address of this extension is allowed for the client ID.', { cause: failure }) }
  const idToken = redirect ? new URLSearchParams(new URL(redirect).hash.slice(1)).get('id_token') : null
  if (!idToken) throw new Error('Google did not return a sign-in token. Try again.')
  return accountRequest('google', { idToken, nonce })
}
export async function saveProgress(account: Account, progress: SavedProgress, signal?: AbortSignal) { return accountRequest('progress', { progress: JSON.stringify(progress) }, account.token, signal) }
