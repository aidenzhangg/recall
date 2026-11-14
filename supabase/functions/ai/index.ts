// Recall AI proxy, run as a Supabase Edge Function.
// The Groq key lives here as a secret (GROQ_API_KEY) and never ships inside the extension.
// Only signed-in Recall users get answers, and each one has a daily limit, so a copied extension cannot drain the key.
const GROQ = 'https://api.groq.com/openai/v1/chat/completions'
// Groq retires models over time (llama-3.3-70b-versatile ended on free plans in August 2026). Override with the GROQ_MODEL secret.
const MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b'
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '200')
const MAX_CHARS = 60000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Message = { role: 'system' | 'user' | 'assistant'; content: string }

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

  // Count this request. use_ai (supabase/schema.sql) works out the user from the same token.
  const used = await fetch(`${url}/rest/v1/rpc/use_ai`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_limit: DAILY_LIMIT }),
  })
  if (!used.ok) return reply(500, 'usage_table_missing')
  if ((await used.json()) !== true) return reply(429, 'daily_limit')

  const body = await request.json().catch(() => null)
  const messages: Message[] = Array.isArray(body?.messages)
    ? body.messages
      .filter((m: Message) => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-24)
      .map((m: Message) => ({ role: m.role, content: m.content.slice(0, 30000) }))
    : []
  if (!messages.length) return reply(400, 'no_messages')
  if (messages.reduce((total, m) => total + m.content.length, 0) > MAX_CHARS) return reply(413, 'too_long')

  const upstream = await fetch(GROQ, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, messages, stream: body.stream === true, max_tokens: 8192,
      // gpt-oss models think before answering; a short think keeps replies fast.
      ...(MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
  })
  // Say what Groq objected to (never the key), so problems like a retired model are easy to spot.
  if (!upstream.ok) {
    const detail = await upstream.json().catch(() => null)
    const code = String(detail?.error?.code ?? detail?.error?.type ?? upstream.status)
    return new Response(JSON.stringify({ error: `groq_${code}`, model: MODEL, message: String(detail?.error?.message ?? '').slice(0, 300) }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  // Streamed or not, Groq's reply is passed straight back; the key is never part of it.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  })
})
