// One place that decides which language model Recall talks to:
//  0. "cloud"  - Recall AI on Supabase (supabase/functions/ai). The key stays on the server; needs a signed-in account.
//  1. "key"    - a key the person who built this copy put in extension/.env.local (see builtIn below). Shipped in the build.
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
  const wanted = provider === 'groq' ? [/gpt-oss-120b/, /gpt-oss/, /qwen/, /llama/]
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
const DEFAULT_MODEL: Partial<Record<Provider, string>> = { groq: 'openai/gpt-oss-120b', gemini: 'gemini-2.5-flash' }
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

// Recall AI on Supabase, registered by account.ts when accounts are on. It only works while someone is signed in.
type CloudAi = { url: string; signedIn: () => boolean; token: () => Promise<string> }
let cloudAi: CloudAi | null = null
export function setCloudAi(value: CloudAi | null) { cloudAi = value }
const cloudReady = () => !!cloudAi?.signedIn()

type DeviceSession = { prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>; destroy(): void }
type DeviceApi = { availability(): Promise<string>; create(options?: { initialPrompts?: ChatMessage[] }): Promise<DeviceSession> }
function deviceApi(): DeviceApi | null {
  const candidate = (globalThis as { LanguageModel?: DeviceApi }).LanguageModel
  return candidate && typeof candidate.availability === 'function' ? candidate : null
}
export async function currentEngine(chosen = readAiSettings()): Promise<Engine> {
  if (cloudReady()) return { kind: 'key', label: 'Recall AI', budget: 12000 }
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
function cloudFailure(status: number, error: string): string {
  if (error) console.warn(`Recall AI server said: ${error}`)
  return error === 'daily_limit' ? 'You have used today\'s Recall AI limit. It resets tomorrow.'
    : /^groq_.*(?:model|not_found|404|decommission)/i.test(error) ? 'Recall AI\'s model is not available. Set GROQ_MODEL in Supabase Edge Function secrets to a current Groq model.'
    : /^groq_.*(?:401|invalid_api_key|auth)/i.test(error) ? 'The Groq key on the server was rejected. Check GROQ_API_KEY in Supabase Edge Function secrets.'
    : /^groq_.*(?:429|rate)/i.test(error) ? 'Recall AI is busy. Wait a minute and try again.'
    : error.startsWith('groq_') ? 'Recall AI\'s model provider returned an error. Try again.'
    : status === 401 ? 'Sign in again to use Recall AI.'
    : status === 413 ? 'That is too much text for Recall AI at once. Try a shorter question or less material.'
    : status === 429 ? 'Recall AI is busy. Wait a minute and try again.'
    : error === 'not_configured' ? 'Recall AI is missing GROQ_API_KEY in Supabase Edge Function secrets.'
    : error === 'usage_table_missing' ? 'Recall AI is missing its usage table. Run supabase/schema.sql again.'
    : status === 404 ? 'Recall AI is not deployed on the server yet.'
    : 'Recall AI could not answer. Try again.'
}
/** Sends a chat request and reads the reply, streamed or whole. */
async function chatRequest(url: string, headers: Record<string, string>, body: object, onText: ((text: string) => void) | undefined, failed: (response: Response) => Promise<string>): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, ...(onText ? { stream: true } : {}) }), signal: AbortSignal.timeout(60000) })
  } catch { throw new Error('Could not reach the AI. Check your connection.') }
  if (!response.ok) throw new Error(await failed(response))
  if (onText && response.body && /event-stream/i.test(response.headers.get('content-type') ?? '')) {
    const streamed = (await readStream(response, onText).catch(() => '')).trim()
    if (!streamed) throw new Error('The AI sent an empty reply. Try again.')
    return streamed
  }
  const data = await response.json().catch(() => ({}))
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('The AI sent an empty reply. Try again.')
  return text.trim()
}
/** `onText`, when given, receives the reply as it is written (not for the on-device model). */
export async function complete(messages: ChatMessage[], chosen = readAiSettings(), onText?: (text: string) => void): Promise<string> {
  if (cloudReady()) {
    let token: string
    try { token = await cloudAi!.token() } catch { throw new Error('Sign in again to use Recall AI.') }
    return chatRequest(`${cloudAi!.url}/functions/v1/ai`, { Authorization: `Bearer ${token}` }, { messages }, onText,
      async response => cloudFailure(response.status, (await response.json().catch(() => ({})))?.error ?? ''))
  }
  const settings = resolve(chosen)
  if (keyReady(settings)) {
    return chatRequest(`${endpoint(settings)}/chat/completions`, settings.key ? { Authorization: `Bearer ${settings.key.trim()}` } : {},
      { model: settings.model.trim(), messages }, onText, async response => failure(response.status))
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
