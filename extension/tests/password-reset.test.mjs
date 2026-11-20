import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const js = ts.transpileModule(readFileSync(new URL('../src/supabase.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { createCloud, recoveryCode } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

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
const recovered = { access_token: 'recovery-access', refresh_token: 'recovery-refresh', expires_in: 3600, user: { id: 'user-1', email: 'sam@example.com', user_metadata: { name: 'Sam' } } }

test('reset codes accept 6 to 10 digits, ignoring spaces and dashes', () => {
  assert.equal(recoveryCode('123456'), '123456')
  assert.equal(recoveryCode(' 123 456 '), '123456')
  assert.equal(recoveryCode('123-456-78'), '12345678')
  assert.equal(recoveryCode('12345'), null)
  assert.equal(recoveryCode('12345678901'), null)
  assert.equal(recoveryCode('12a456'), null)
})

test('asking for a reset code looks the same for registered and unknown emails, including the per-email rate limit', async () => {
  // Supabase answers 200 for unknown emails, and 429 only for a real account that was sent a code in the last minute.
  const t = setup(call => call.body.email === 'known@example.com' ? [429, { error_code: 'over_request_rate_limit', msg: 'For security purposes, you can only request this after 42 seconds.' }] : [200, {}])
  try {
    await t.cloud.requestReset('unknown@example.com')
    await t.cloud.requestReset('known@example.com')
    assert.equal(t.calls.length, 2)
    assert.match(t.calls[0].url, /\/auth\/v1\/recover$/)
    assert.equal(t.calls[0].method, 'POST')
    assert.deepEqual(t.calls[0].body, { email: 'unknown@example.com' })
    assert.equal(t.calls[0].headers.apikey, 'anon-placeholder')
    assert.equal(t.cloud.signedIn(), false)
  } finally { t.restore() }
})

test('asking for a reset code still reports a bad email address or an unreachable service', async () => {
  const t = setup(() => [400, { error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' }])
  try { await assert.rejects(t.cloud.requestReset('not-an-email'), /invalid format/) } finally { t.restore() }
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  try { await assert.rejects(createCloud({ url: 'https://project.example', key: 'anon-placeholder' }, { getItem: () => null, setItem() {}, removeItem() {} }).requestReset('sam@example.com'), /Cannot reach the account service/) }
  finally { globalThis.fetch = original }
})

test('a correct code gives a recovery session that is not saved until the new password is set, then signs in', async () => {
  const t = setup(call => call.url.endsWith('/auth/v1/verify') ? [200, recovered]
    : call.url.endsWith('/auth/v1/user') ? [200, recovered.user]
    : [200, [{ data: { version: 1, notes: 'saved' } }]])
  try {
    const recovery = await t.cloud.verifyReset('sam@example.com', '123 456')
    assert.deepEqual(t.calls[0].body, { type: 'recovery', email: 'sam@example.com', token: '123456' })
    assert.equal(t.cloud.signedIn(), false)
    assert.equal(t.items.size, 0)
    const result = await t.cloud.finishReset(recovery, 'a brand new password')
    const update = t.calls[1]
    assert.equal(update.method, 'PUT')
    assert.match(update.url, /\/auth\/v1\/user$/)
    assert.equal(update.headers.Authorization, 'Bearer recovery-access')
    assert.deepEqual(update.body, { password: 'a brand new password' })
    assert.equal(t.cloud.signedIn(), true)
    assert.deepEqual(result.user, { id: 'user-1', email: 'sam@example.com', name: 'Sam' })
    assert.equal(JSON.parse(result.progress).notes, 'saved')
    assert.equal(t.calls[2].headers.Authorization, 'Bearer recovery-access')
  } finally { t.restore() }
})

test('wrong or expired codes, weak or reused passwords and rate limits give clear messages', async () => {
  let answer
  const t = setup(() => answer)
  try {
    await assert.rejects(t.cloud.verifyReset('sam@example.com', '12'), /6 to 10 digits/)
    assert.equal(t.calls.length, 0)
    answer = [403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }]
    await assert.rejects(t.cloud.verifyReset('sam@example.com', '000000'), /wrong or has expired/)
    answer = [429, { error_code: 'over_request_rate_limit' }]
    await assert.rejects(t.cloud.verifyReset('sam@example.com', '000000'), /Too many attempts/)
    answer = [200, recovered]
    const recovery = await t.cloud.verifyReset('sam@example.com', '000000')
    const calls = t.calls.length
    await assert.rejects(t.cloud.finishReset(recovery, 'short'), /at least 10 characters/)
    assert.equal(t.calls.length, calls)
    answer = [422, { error_code: 'weak_password', msg: 'Password is known to be weak' }]
    await assert.rejects(t.cloud.finishReset(recovery, 'password1234'), /at least 10 characters/)
    answer = [422, { error_code: 'same_password', msg: 'New password should be different from the old password.' }]
    await assert.rejects(t.cloud.finishReset(recovery, 'the old password'), /different from your old one/)
    answer = [401, { msg: 'JWT expired' }]
    await assert.rejects(t.cloud.finishReset(recovery, 'a brand new password'), /reset has expired/)
    assert.equal(t.cloud.signedIn(), false)
    t.advance(3600 * 1000)
    const before = t.calls.length
    await assert.rejects(t.cloud.finishReset(recovery, 'a brand new password'), /reset has expired/)
    assert.equal(t.calls.length, before)
  } finally { t.restore() }
})
