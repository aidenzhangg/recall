import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const js = ts.transpileModule(readFileSync(new URL('../src/localModel.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { modelStatus, explain, buildPrompt } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const fake = reply => { let destroyed = 0; globalThis.LanguageModel = { availability: async () => 'available', create: async () => ({ prompt: async () => reply, destroy: () => { destroyed++ } }) }; return () => destroyed }
test('without a browser model Recall reports unavailable and falls back', async () => {
  delete globalThis.LanguageModel
  assert.equal(await modelStatus(), 'unavailable')
  assert.equal(await explain({ message: 'What is osmosis?', sources: [] }), null)
})
test('the prompt is grounded in the note lines and never needs a key', () => {
  const prompt = buildPrompt({ message: 'What is osmosis?', sources: ['Osmosis is the movement of water.'], hidden: 'Osmosis' })
  assert.match(prompt, /ONLY these lines/); assert.match(prompt, /- Osmosis is the movement of water\./); assert.match(prompt, /Never write the term "Osmosis"/)
  assert.match(buildPrompt({ message: 'x', sources: [] }), /do not cover this/)
  assert.doesNotMatch(readFileSync(new URL('../src/localModel.ts', import.meta.url), 'utf8'), /fetch\(|https?:\/\/|api[_-]?key\s*[:=]/i)
})
test('a model reply is used, and one that leaks a hidden quiz answer is rejected', async () => {
  const destroyed = fake(' Water moves across a membrane. ')
  assert.equal(await modelStatus(), 'ready')
  assert.equal(await explain({ message: 'q', sources: ['s'] }), 'Water moves across a membrane.')
  assert.equal(destroyed(), 1)
  fake('The answer is osmosis.')
  assert.equal(await explain({ message: 'q', sources: ['s'], hidden: 'Osmosis' }), null)
  delete globalThis.LanguageModel
})
