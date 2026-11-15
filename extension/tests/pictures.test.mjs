import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const load = async name => {
  const js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const { complete, imagesSupported, textOf, GROQ_VISION_MODEL } = await load('ai')
const { isSavedPicture } = await load('images')

const picture = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const groq = { provider: 'groq', model: 'openai/gpt-oss-120b', key: 'test-key', baseUrl: '' }
const withFetch = async (reply, run) => {
  const original = globalThis.fetch; const sent = []
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(reply), { headers: { 'Content-Type': 'application/json' } }) }
  try { return { result: await run(), sent } } finally { globalThis.fetch = original }
}

test('a turn with a picture goes to the vision model as an image part, and thinking is hidden', async () => {
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'What is this graph?' }, { type: 'image_url', image_url: { url: picture } }] }]
  const { result, sent } = await withFetch({ choices: [{ message: { content: '<think>looking</think>A sine wave.' } }] }, () => complete(messages, groq))
  assert.equal(result, 'A sine wave.')
  assert.equal(sent[0].body.model, GROQ_VISION_MODEL)
  assert.equal(sent[0].body.reasoning_format, 'hidden')
  assert.deepEqual(sent[0].body.messages[0].content[1], { type: 'image_url', image_url: { url: picture } })
})
test('text-only turns keep the chosen text model', async () => {
  const { sent } = await withFetch({ choices: [{ message: { content: 'Hi.' } }] }, () => complete([{ role: 'user', content: 'Hello' }], groq))
  assert.equal(sent[0].body.model, 'openai/gpt-oss-120b')
  assert.equal(sent[0].body.reasoning_format, undefined)
})
test('pictures need a model behind a key, and text is read out of mixed content', () => {
  assert.equal(imagesSupported({ kind: 'key', label: 'Recall AI', budget: 1 }), true)
  assert.equal(imagesSupported({ kind: 'device', label: 'On-device model', budget: 1 }), false)
  assert.equal(imagesSupported({ kind: 'none', label: 'Notes search', budget: 0 }), false)
  assert.equal(textOf({ role: 'user', content: [{ type: 'text', text: 'Explain' }, { type: 'image_url', image_url: { url: picture } }] }), 'Explain')
})
test('only small JPEG previews are accepted from saved chats', () => {
  assert.equal(isSavedPicture(picture), true)
  assert.equal(isSavedPicture('data:image/svg+xml;base64,PHN2Zz4='), false)
  assert.equal(isSavedPicture('https://example.com/a.jpg'), false)
  assert.equal(isSavedPicture(`data:image/jpeg;base64,${'A'.repeat(200_001)}`), false)
})
