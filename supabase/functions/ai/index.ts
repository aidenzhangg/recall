// Recall AI proxy, run as a Supabase Edge Function.
// The Groq key lives here as a secret (GROQ_API_KEY) and never ships inside the extension.
// Only signed-in Recall users get answers, and each one has a daily limit, so a copied extension cannot drain the key.
const GROQ = 'https://api.groq.com/openai/v1/chat/completions'
// Groq retires models over time (llama-3.3-70b-versatile ended on free plans in August 2026). Override with the GROQ_MODEL secret.
const MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b'
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '200')
const MAX_CHARS = 60000
// gpt-oss reads text only, so a request with a picture goes to Groq's vision model instead. Override with GROQ_VISION_MODEL.
const VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b'
// Groq's vision models take at most 3 images per request; the client shrinks screenshots to well under these sizes.
const MAX_IMAGES = 3
const MAX_IMAGE_CHARS = 1_500_000
const MAX_BODY_CHARS = MAX_IMAGES * MAX_IMAGE_CHARS + 500_000
const IMAGE_URL =/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
type Message = { role: 'system' | 'user' | 'assistant'; content: string | Part[] }
/** Keeps text and well-formed image parts only. Images are allowed in user messages and nowhere else. */
function clean(m: Message): Message | null {
  if (!m || !['system', 'user', 'assistant'].includes(m.role)) return null
  if (typeof m.content === 'string') return { role: m.role, content: m.content.slice(0, 30000) }
  if (m.role !== 'user' || !Array.isArray(m.content)) return null
  const parts: Part[] = m.content.flatMap((part: Part): Part[] =>
    part?.type === 'text' && typeof part.text === 'string' ? [{ type: 'text', text: part.text.slice(0, 30000) }]
    : part?.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url.length <= MAX_IMAGE_CHARS && IMAGE_URL.test(part.image_url.url)
      ? [{ type: 'image_url', image_url: { url: part.image_url.url } }] : [])
  return parts.length ? { role: 'user', content: parts } : null
}
const textOf = (m: Message) => typeof m.content === 'string' ? m.content : m.content.map(p => p.type === 'text' ? p.text : '').join('')
const imagesIn = (m: Message) => typeof m.content === 'string' ? 0 : m.content.filter(p => p.type === 'image_url').length

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply(405, 'post_only')

  const key = Deno.env.get('GROQ_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!key || !url || !anon) return reply(500, 'not_configured')

  // The anon key is also a valid token, so check that this one belongs to a real, signed-in user.
  const auth = request.headers.get('Authorization') ?? ''
  const who = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } })
  if (!who.ok) return reply(401, 'sign_in')
  const user = await who.json().catch(() => null)
  if (!user?.id || user.is_anonymous) return reply(401, 'sign_in')
  // A declared size that is already too big is refused before it costs a day's request.
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_CHARS) return reply(413, 'too_long')

  // Count this request. use_ai (supabase/schema.sql) works out the user from the same token.
  const used = await fetch(`${url}/rest/v1/rpc/use_ai`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_limit: DAILY_LIMIT }),
  })
  if (!used.ok) return reply(500, 'usage_table_missing')
  if ((await used.json()) !== true) return reply(429, 'daily_limit')

  // Three pictures plus text fit well under this; anything bigger is refused before it is parsed.
  const raw = await request.text().catch(() => '')
  if (raw.length > MAX_BODY_CHARS) return reply(413, 'too_long')
  let body: { messages?: unknown; stream?: unknown } | null = null
  try { body = JSON.parse(raw) } catch { body = null }
  const messages: Message[] = Array.isArray(body?.messages)
    ? body.messages.map(clean).filter((m: Message | null): m is Message => !!m).slice(-24)
    : []
  if (!messages.length) return reply(400, 'no_messages')
  if (messages.reduce((total, m) => total + textOf(m).length, 0) > MAX_CHARS) return reply(413, 'too_long')
  const images = messages.reduce((total, m) => total + imagesIn(m), 0)
  if (images > MAX_IMAGES) return reply(413, 'too_many_images')
  const model = images ? VISION_MODEL : MODEL

  const upstream = await fetch(GROQ, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages, stream: body?.stream === true, max_tokens: 8192,
      // gpt-oss models think before answering; a short think keeps replies fast.
      ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      // Qwen writes its thinking inside <think> tags unless told to keep it out of the reply.
      ...(model.startsWith('qwen/') ? { reasoning_format: 'hidden' } : {}),
    }),
  })
  // Say what Groq objected to (never the key), so problems like a retired model are easy to spot.
  if (!upstream.ok) {
    const detail = await upstream.json().catch(() => null)
    const code = String(detail?.error?.code ?? detail?.error?.type ?? upstream.status)
    return new Response(JSON.stringify({ error: `groq_${code}`, model, message: String(detail?.error?.message ?? '').slice(0, 300) }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  // Streamed or not, Groq's reply is passed straight back; the key is never part of it.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  })
})
