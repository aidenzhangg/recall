// One place that decides which language model Recall talks to, with no backend required:
//  1. "key"    - a provider key the user typed into Settings, kept only in this browser profile.
//  2. "device" - Chrome's built-in on-device model (no key, nothing leaves the computer).
//  3. "none"   - no model; callers fall back to notes search and rule-based questions.
// No key is ever written in this source code.
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type Provider = 'groq' | 'gemini' | 'openrouter' | 'openai' | 'custom'
export type AiSettings = { provider: Provider; model: string; key: string; baseUrl: string }
export type Engine = { kind: 'key' | 'device' | 'none'; label: string; budget: number }

export const PROVIDERS: Record<Provider, { name: string; url: string; note: string }> = {
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1', note: 'Free tier' },
  gemini: { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', note: 'Free tier' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', note: 'Has free models' },
  openai: { name: 'OpenAI', url: 'https://api.openai.com/v1', note: 'Paid' },
  custom: { name: 'Other (OpenAI-compatible)', url: '', note: 'Any compatible address' },
}
const STORE = 'recall-ai-settings'
export function readAiSettings(): AiSettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) ?? '{}')
    return { provider: value.provider in PROVIDERS ? value.provider : 'groq', model: typeof value.model === 'string' ? value.model : '', key: typeof value.key === 'string' ? value.key : '', baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '' }
  } catch { return { provider: 'groq', model: '', key: '', baseUrl: '' } }
}
export function saveAiSettings(settings: AiSettings) {
  try { localStorage.setItem(STORE, JSON.stringify(settings)) } catch { /* Settings then last for this session only. */ }
}
function endpoint(settings: AiSettings): string {
  const url = (settings.provider === 'custom' ? settings.baseUrl : PROVIDERS[settings.provider].url).trim().replace(/\/+$/, '')
  // A key must never travel over plain HTTP except to a model running on this computer.
  return /^https:\/\//.test(url) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(url) ? url : ''
}
export function keyReady(settings: AiSettings) { return !!endpoint(settings) && !!settings.model.trim() && (!!settings.key.trim() || endpoint(settings).startsWith('http://')) }

type DeviceSession = { prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>; destroy(): void }
type DeviceApi = { availability(): Promise<string>; create(options?: { initialPrompts?: ChatMessage[] }): Promise<DeviceSession> }
function deviceApi(): DeviceApi | null {
  const candidate = (globalThis as { LanguageModel?: DeviceApi }).LanguageModel
  return candidate && typeof candidate.availability === 'function' ? candidate : null
}
export async function currentEngine(settings = readAiSettings()): Promise<Engine> {
  if (keyReady(settings)) return { kind: 'key', label: `${PROVIDERS[settings.provider].name} · ${settings.model}`, budget: 12000 }
  try { if (await deviceApi()?.availability() === 'available') return { kind: 'device', label: 'On-device model', budget: 4500 } } catch { /* Treated as no model. */ }
  return { kind: 'none', label: 'Notes search', budget: 0 }
}
function failure(status: number): string {
  return status === 401 || status === 403 ? 'The AI provider rejected this key. Check it in AI settings.'
    : status === 429 ? 'The AI provider\'s limit was reached. Wait a minute and try again.'
    : status === 404 ? 'The AI provider does not know this model. Pick another in AI settings.'
    : 'The AI provider returned an error. Try again.'
}
/** Lists the models this key can use, so nobody has to guess a model name. */
export async function listModels(settings: AiSettings): Promise<string[]> {
  const base = endpoint(settings)
  if (!base) throw new Error('Enter an https:// address for the provider.')
  let response: Response
  try { response = await fetch(`${base}/models`, { headers: settings.key ? { Authorization: `Bearer ${settings.key.trim()}` } : {}, signal: AbortSignal.timeout(15000) }) }
  catch { throw new Error('Could not reach the AI provider. Check your connection.') }
  if (!response.ok) throw new Error(failure(response.status))
  const data = await response.json().catch(() => ({}))
  const ids: string[] = Array.isArray(data.data) ? data.data.map((model: { id?: unknown }) => typeof model?.id === 'string' ? model.id.replace(/^models\//, '') : '').filter(Boolean) : []
  return [...new Set(ids)].filter(id => !/embed|whisper|tts|image|audio|guard|moderation|rerank/i.test(id)).sort()
}
export async function complete(messages: ChatMessage[], settings = readAiSettings()): Promise<string> {
  if (keyReady(settings)) {
    let response: Response
    try {
      response = await fetch(`${endpoint(settings)}/chat/completions`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(settings.key ? { Authorization: `Bearer ${settings.key.trim()}` } : {}) },
        body: JSON.stringify({ model: settings.model.trim(), messages }), signal: AbortSignal.timeout(60000) })
    } catch { throw new Error('Could not reach the AI provider. Check your connection.') }
    if (!response.ok) throw new Error(failure(response.status))
    const data = await response.json().catch(() => ({}))
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new Error('The AI provider sent an empty reply. Try again.')
    return text.trim()
  }
  const api = deviceApi()
  if (!api) throw new Error('No AI model is set up.')
  let session: DeviceSession | undefined
  try {
    session = await api.create({ initialPrompts: messages.slice(0, -1) })
    const text = (await session.prompt(messages[messages.length - 1].content, { signal: AbortSignal.timeout(90000) })).trim()
    if (!text) throw new Error('empty')
    return text
  } catch { throw new Error('The on-device model could not answer. Try a shorter question.') }
  finally { session?.destroy() }
}
