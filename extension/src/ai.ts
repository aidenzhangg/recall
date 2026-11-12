// One place that decides which language model Recall talks to, with no backend required:
//  1. "key"    - the key the person who built this copy put in extension/.env.local (see builtIn below).
//  2. "device" - Chrome's built-in on-device model (no key, nothing leaves the computer).
//  3. "none"   - no model; callers fall back to notes search and rule-based questions.
// No key is ever written in this source code.
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type Provider = 'groq' | 'gemini' | 'openrouter' | 'openai' | 'custom'
export type AiSettings = { provider: Provider; model: string; key: string; baseUrl: string }
export type Engine = { kind: 'key' | 'device' | 'none'; label: string; budget: number }

export const PROVIDERS: Record<Provider, { name: string; url: string; note: string; keyPage: string }> = {
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1', note: 'Free tier', keyPage: 'https://console.groq.com/keys' },
  gemini: { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', note: 'Free tier', keyPage: 'https://aistudio.google.com/apikey' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', note: 'Has free models', keyPage: 'https://openrouter.ai/settings/keys' },
  openai: { name: 'OpenAI', url: 'https://api.openai.com/v1', note: 'Paid', keyPage: 'https://platform.openai.com/api-keys' },
  custom: { name: 'Other (OpenAI-compatible)', url: '', note: 'Any compatible address', keyPage: '' },
}
/** Chooses a sensible general chat model from what the key can actually use, so nobody has to know model names. */
export function pickModel(provider: Provider, ids: string[]): string {
  const usable = ids.filter(id => !/preview|exp|live|vision|search|thinking|native|computer|robotics|learnlm|aqa|compound|speech|transcri/i.test(id))
  const pool = usable.length ? usable : ids
  const wanted = provider === 'groq' ? [/llama-3\.3-70b/, /llama.*70b/, /llama/, /gemma|qwen/]
    : provider === 'gemini' ? [/^gemini-[\d.]+-flash$/, /flash(?!-lite)/, /flash/, /gemini/]
    : provider === 'openrouter' ? [/llama-3\.3-70b.*:free$/, /:free$/]
    : provider === 'openai' ? [/^gpt-[\d.]+o?-mini$/, /mini/, /^gpt/] : []
  for (const pattern of wanted) {
    const hits = pool.filter(id => pattern.test(id)).sort().reverse()
    if (hits.length) return hits[0]
  }
  return pool[0] ?? ''
}
/** No key is entered or kept in the browser any more; this also removes one saved by an earlier version. */
export function readAiSettings(): AiSettings {
  try { localStorage.removeItem('recall-ai-settings') } catch { /* Nothing to remove. */ }
  return { provider: 'groq', model: '', key: '', baseUrl: '' }
}
function endpoint(settings: AiSettings): string {
  const url = (settings.provider === 'custom' ? settings.baseUrl : PROVIDERS[settings.provider].url).trim().replace(/\/+$/, '')
  // A key must never travel over plain HTTP except to a model running on this computer.
  return /^https:\/\//.test(url) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(url) ? url : ''
}
// An optional shared key, read at build time from the git-ignored extension/.env.local. It is never in the repository,
// but it IS inside the built extension, so anyone who installs that build can read it. Use a free key you can revoke.
const DEFAULT_MODEL: Partial<Record<Provider, string>> = { groq: 'llama-3.3-70b-versatile', gemini: 'gemini-2.5-flash' }
function builtIn(): AiSettings | null {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  const key = env?.VITE_AI_KEY?.trim()
  if (!key) return null
  const provider = (env?.VITE_AI_PROVIDER ?? '') in PROVIDERS ? env!.VITE_AI_PROVIDER as Provider : 'groq'
  return { provider, key, model: env?.VITE_AI_MODEL?.trim() || DEFAULT_MODEL[provider] || '', baseUrl: env?.VITE_AI_BASE_URL?.trim() ?? '' }
}
/** True when this build carries a shared key, so nobody has to enter their own. */
export function hasBuiltInKey() { const shared = builtIn(); return !!shared && keyReady(shared) }
/** A key the user entered wins; otherwise the build's shared key, if any. */
function resolve(settings: AiSettings): AiSettings { return keyReady(settings) ? settings : builtIn() ?? settings }
export function keyReady(settings: AiSettings) { return !!endpoint(settings) && !!settings.model.trim() && (!!settings.key.trim() || endpoint(settings).startsWith('http://')) }

type DeviceSession = { prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>; destroy(): void }
type DeviceApi = { availability(): Promise<string>; create(options?: { initialPrompts?: ChatMessage[] }): Promise<DeviceSession> }
function deviceApi(): DeviceApi | null {
  const candidate = (globalThis as { LanguageModel?: DeviceApi }).LanguageModel
  return candidate && typeof candidate.availability === 'function' ? candidate : null
}
export async function currentEngine(chosen = readAiSettings()): Promise<Engine> {
  const settings = resolve(chosen)
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
/** Reads a streamed reply ("data: {...}" lines) and reports the text so far after each piece. */
async function readStream(response: Response, onText: (text: string) => void): Promise<string> {
  const reader = response.body!.getReader(); const decoder = new TextDecoder()
  let pending = ''; let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    pending += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const lines = pending.split('\n'); pending = done ? '' : lines.pop() ?? ''
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, '')
      if (!line.trim().startsWith('data:') || data === '[DONE]') continue
      try {
        const piece = JSON.parse(data)?.choices?.[0]?.delta?.content
        if (typeof piece === 'string' && piece) { text += piece; onText(text) }
      } catch { /* A partial or keep-alive line. */ }
    }
    if (done) return text
  }
}
/** `onText`, when given, receives the reply as it is written (provider keys only). */
export async function complete(messages: ChatMessage[], chosen = readAiSettings(), onText?: (text: string) => void): Promise<string> {
  const settings = resolve(chosen)
  if (keyReady(settings)) {
    let response: Response
    try {
      response = await fetch(`${endpoint(settings)}/chat/completions`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(settings.key ? { Authorization: `Bearer ${settings.key.trim()}` } : {}) },
        body: JSON.stringify({ model: settings.model.trim(), messages, ...(onText ? { stream: true } : {}) }), signal: AbortSignal.timeout(60000) })
    } catch { throw new Error('Could not reach the AI provider. Check your connection.') }
    if (!response.ok) throw new Error(failure(response.status))
    if (onText && response.body && /event-stream/i.test(response.headers.get('content-type') ?? '')) {
      const streamed = (await readStream(response, onText).catch(() => '')).trim()
      if (!streamed) throw new Error('The AI provider sent an empty reply. Try again.')
      return streamed
    }
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
