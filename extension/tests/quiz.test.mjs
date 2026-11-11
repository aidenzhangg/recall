import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source = readFileSync(new URL('../src/quiz.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {makeQuestions, isCorrect, adaptiveQuestions, recordAttempt} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const notes = 'Photosynthesis converts sunlight into stored chemical energy. Mitochondria release energy through cellular respiration. Chlorophyll absorbs light inside living plant cells.'
test('mixed questions have valid options and written responses are not auto-graded', () => {
 const questions = makeQuestions(notes,3,'mixed')
 assert.deepEqual(questions.map(q=>q.kind),['blank','choice','long'])
 assert.ok(questions[1].options.includes(questions[1].answer))
 assert.equal(new Set(questions[1].options).size,questions[1].options.length)
 assert.equal(isCorrect(questions[2],questions[2].answer),false)
})
test('missed material moves to the front of the next quiz', () => {
 const questions = makeQuestions(notes,3,'blank')
 const history = recordAttempt([],questions,[questions[0].answer,'wrong',questions[2].answer],1000)
 const next = adaptiveQuestions(notes,1,'blank',history,1001)
 assert.equal(next[0].source,questions[1].source)
})
test('correcting a topic schedules later review and does not mutate previous history', () => {
 const [q] = makeQuestions(notes,1,'blank')
 const missed = recordAttempt([],[q],['wrong'],1000)
 const corrected = recordAttempt(missed,[q],[q.answer],2000)
 assert.equal(missed[0].successes,0); assert.equal(corrected[0].successes,1)
 assert.ok(corrected[0].dueAt>2000)
})
test('written responses do not create fake mastery records', () => {
 const questions=makeQuestions(notes,3,'long')
 assert.deepEqual(recordAttempt([],questions,questions.map(q=>q.answer),1000),[])
})
test('history from a different document never becomes a question', () => {
 const history=[{source:'Unrelated older material has several words.',topic:'older',misses:9,successes:0,dueAt:0}]
 assert.ok(!adaptiveQuestions(notes,3,'blank',history,1000).some(q=>q.source===history[0].source))
 assert.deepEqual(makeQuestions('',5,'choice'),[])
})
