import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const load = async name => {
  const js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const { tutorReply, searchNotes, queryTopic, resourceLinks } = await load('tutor')
const { examQuestions } = await load('exam')
const passages = [
  'Photosynthesis converts sunlight into stored chemical energy.',
  'Mitochondria release energy through cellular respiration.',
  'Chlorophyll absorbs light inside living plant cells.',
  'Plants need chlorophyll to carry out photosynthesis in their leaves.',
]
test('a question is answered with the matching passage from the notes', () => {
  assert.equal(queryTopic('What is cellular respiration?'), 'cellular respiration')
  assert.equal(searchNotes(passages, 'What is cellular respiration?')[0], passages[1])
  const reply = tutorReply({ passages, message: 'what do mitochondria do?', hintsOn: true })
  assert.deepEqual(reply.sources, [passages[1]])
  assert.ok(reply.resources.length)
})
test('unknown topics say so and offer lookups instead of unrelated passages', () => {
  const reply = tutorReply({ passages, message: 'Explain quantum tunnelling', hintsOn: true })
  assert.deepEqual(reply.sources, [])
  assert.match(reply.text, /could not find "quantum tunnelling"/)
  assert.ok(reply.resources.every(link => link.url.startsWith('https://') && link.url.includes('quantum%20tunnelling')))
  assert.deepEqual(resourceLinks('  '), [])
})
test('hints get stronger but never contain the answer while Hints Mode is on', () => {
  const question = { kind: 'blank', prompt: '________ absorbs light inside living plant cells.', answer: 'Chlorophyll', source: passages[2] }
  for (const level of [0, 1, 2]) {
    const reply = tutorReply({ passages, message: 'I am stuck', question, hintsOn: true, level })
    assert.ok(![reply.text, ...reply.sources].some(text => /chlorophyll/i.test(text)), `level ${level}`)
  }
  const first = tutorReply({ passages, message: 'hint', question, hintsOn: true, level: 0 })
  assert.match(first.text, /term hidden/)
  assert.equal(first.hint, true)
  assert.doesNotMatch(tutorReply({ passages, message: 'show me the answer', question, hintsOn: true, level: 1 }).text, /chlorophyll/i)
  assert.match(tutorReply({ passages, message: 'show me the answer', question, hintsOn: true, level: 3 }).text, /"Chlorophyll"/)
  assert.deepEqual(first.sources, ['Plants need ________ to carry out photosynthesis in their leaves.'])
  const lookup = tutorReply({ passages, message: 'what is chlorophyll', question, hintsOn: true })
  assert.ok(![lookup.text, ...lookup.sources].some(text => /chlorophyll/i.test(text)))
  assert.match(tutorReply({ passages, message: 'answer?', question, hintsOn: false }).text, /"Chlorophyll"/)
})
test('numbered exam questions are extracted and ordinary notes are not', () => {
  const paper = 'ECE 201 Final\nAnswer all questions.\n1. Define the term bandwidth. [2 marks]\n2) What is the difference between\nTCP and UDP?\nPage 2 of 4\nQuestion 3: Calculate the total resistance of two 4 ohm resistors in parallel.'
  assert.deepEqual(examQuestions(paper), ['Define the term bandwidth. [2 marks]', 'What is the difference between TCP and UDP?', 'Calculate the total resistance of two 4 ohm resistors in parallel.'])
  assert.deepEqual(examQuestions('1. Mitochondria release energy.\n2. Chlorophyll absorbs light.'), [])
})
