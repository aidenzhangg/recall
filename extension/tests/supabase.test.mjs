import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const js = ts.transpileModule(readFileSync(new URL('../src/supabase.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { createCloud, cloudConfig } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

function setup(handler) {
  const items = new Map(); const calls = []
  const store = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }
  let time = 1_000_000
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined }
    calls.push(call)
    const [status, data] = handler(call)
    return new Response(JSON.stringify(data), { status })
  }
  const cloud = createCloud({ url: 'https://project.example', key: 'anon-placeholder' }, store, () => time)
  return { cloud, calls, items, advance: ms => { time += ms }, restore: () => { globalThis.fetch = original } }
}
const session = (n = 1) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, user: { id: 'user-1', email: 'sam@example.com', user_metadata: { name: 'Sam' } } })

test('accounts are off until a Supabase project is configured', () => { assert.equal(cloudConfig(), null) })

test('signing in stores a session and loads that account\'s saved progress', async () => {
  const t = setup(call => call.url.includes('/auth/v1/token') ? [200, session()] : [200, [{ data: { version: 1, notes: 'saved' } }]])
  try {
    const result = await t.cloud.login('sam@example.com', 'correct horse battery')
    assert.deepEqual(result.user, { id: 'user-1', email: 'sam@example.com', name: 'Sam' })
    assert.equal(JSON.parse(result.progress).notes, 'saved')
    assert.equal(t.cloud.signedIn(), true)
    assert.equal(t.calls[0].headers.apikey, 'anon-placeholder')
    assert.equal(t.calls[1].headers.Authorization, 'Bearer access-1')
  } finally { t.restore() }
})

test('saving upserts only the signed-in user\'s row and refreshes an expired token first', async () => {
  let n = 1
  const t = setup(call => call.url.includes('grant_type=password') ? [200, session(1)] : call.url.includes('grant_type=refresh_token') ? [200, session(++n)] : call.method === 'POST' ? [201, {}] : [200, []])
  try {
    await t.cloud.login('sam@example.com', 'correct horse battery')
    t.advance(3600 * 1000)
    await t.cloud.save(JSON.stringify({ version: 1, notes: 'new' }))
    const refresh = t.calls.find(call => call.url.includes('refresh_token'))
    assert.deepEqual(refresh.body, { refresh_token: 'refresh-1' })
    const upsert = t.calls.at(-1)
    assert.match(upsert.url, /\/rest\/v1\/progress\?on_conflict=user_id$/)
    assert.equal(upsert.headers.Authorization, 'Bearer access-2')
    assert.equal(upsert.body.user_id, 'user-1')
    assert.equal(upsert.body.data.notes, 'new')
  } finally { t.restore() }
})

test('wrong passwords, unconfirmed sign-ups and a missing table give clear messages; signing out clears the session', async () => {
  const t = setup(call => call.url.includes('grant_type=password') ? [400, { error_code: 'invalid_credentials' }] : call.url.includes('/signup') ? [200, { id: 'user-2' }] : [404, { code: 'PGRST205', message: 'Could not find the table' }])
  try {
    await assert.rejects(t.cloud.login('sam@example.com', 'nope'), /Wrong email or password/)
    await assert.rejects(t.cloud.register('new@example.com', 'long enough password', 'New'), /confirmation link/)
    assert.equal(t.cloud.signedIn(), false)
    await assert.rejects(t.cloud.me(), /sign in again/)
  } finally { t.restore() }
  const signed = setup(call => call.url.includes('/auth/v1/token') ? [200, session()] : call.url.includes('/rest/') ? [404, { code: 'PGRST205' }] : [204, {}])
  try {
    await assert.rejects(signed.cloud.login('sam@example.com', 'correct horse battery'), /supabase\/schema\.sql/)
    await signed.cloud.logout()
    assert.equal(signed.cloud.signedIn(), false)
  } finally { signed.restore() }
})
