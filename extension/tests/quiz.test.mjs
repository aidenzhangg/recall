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

test('PDF line wrapping keeps body sentences and skips a title and page numbers', () => {
 const pdf = 'Introduction To The Biology Of Plants\n\nPhotosynthesis converts\nsunlight into stored\nchemical energy.\n\nPage 1\n\nMitochondria release\nenergy through cellular\nrespiration.\n\nChlorophyll absorbs light\ninside living plant cells.'
 const questions = makeQuestions(pdf, 2, 'blank')
 assert.equal(questions[0].source, 'Photosynthesis converts sunlight into stored chemical energy.')
 assert.ok(questions[1].source.includes('Chlorophyll'))
 assert.ok(questions.every(q => !q.source.includes('Introduction') && !q.source.includes('Page 1')))
 const broken = makeQuestions('Photo-\nsynthesis converts light into chemical energy.',1,'blank')
 assert.equal(broken[0].source,'Photosynthesis converts light into chemical energy.')
})

const lecture = `Introduction To The Biology Of Plants
Professor: Alex Example
The assignment is worth thirty percent of your grade.
Office hours are available every Wednesday afternoon.
Please upload the assignment by Friday evening.
Copyright 2026 University Lecture Resources. All rights reserved.
Lecture slides are posted after each class.
This is an extraordinarily complicated introductory presentation.
Photosynthesis converts sunlight into stored chemical energy.
Mitochondria release energy through cellular respiration.
Homeostasis is the regulation of stable internal conditions.
Diffusion: particles move from high concentration to low concentration.`
test('lecture logistics never become questions or multiple-choice distractors', () => {
 const questions = makeQuestions(lecture,15,'choice')
 assert.equal(questions.length,4)
 assert.ok(questions.every(q=>!/(office|professor|assignment|copyright|slides|extraordinarily)/i.test(q.source)))
 assert.ok(questions.flatMap(q=>q.options ?? []).every(option=>['Photosynthesis','Mitochondria','Homeostasis','Diffusion'].includes(option)))
 assert.equal(questions[0].answer,'Homeostasis')
})
test('concept subjects replace longest-word guessing and definitions rank first', () => {
 const [q] = makeQuestions('Mitochondria release extraordinarily substantial amounts of energy.',1,'blank')
 assert.equal(q.answer,'Mitochondria')
 assert.ok(q.prompt.startsWith('________ release'))
 const [definition] = makeQuestions(lecture,1,'blank')
 assert.equal(definition.answer,'Homeostasis')
})
test('focus limits both new and adaptive questions without filling with unrelated facts', () => {
 const selected = makeQuestions(lecture,10,'blank','respiration')
 assert.equal(selected.length,1)
 assert.equal(selected[0].answer,'Mitochondria')
 assert.deepEqual(makeQuestions(lecture,10,'blank','quantum physics'),[])
 const history=[{source:'Homeostasis is the regulation of stable internal conditions.',topic:'Homeostasis',misses:8,successes:0,dueAt:0}]
 assert.equal(adaptiveQuestions(lecture,5,'blank',history,1000,'respiration')[0].answer,'Mitochondria')
 assert.deepEqual(makeQuestions('Office hours are every Wednesday afternoon.',5,'mixed'),[])
})

test('short and sentence-case titles cannot become part of a body question', () => {
 for (const title of ['Cell Biology', 'cell biology', 'How cells work', '# Cell biology', 'Biology:', 'Title: an introduction to the biology of cells']) {
  const [q] = makeQuestions(`${title}\nCells are the fundamental units of living organisms.`,1,'blank')
  assert.equal(q.source,'Cells are the fundamental units of living organisms.',title)
  assert.equal(q.answer,'Cells',title)
  assert.equal(q.prompt,'________ are the fundamental units of living organisms.',title)
 }
})
test('independent facts without periods remain separate and wrapped subjects survive', () => {
 const questions=makeQuestions('Cell biology\nCells are the fundamental units of living organisms\nMitochondria release energy through cellular respiration',5,'blank')
 assert.equal(questions.length,2)
 assert.deepEqual(questions.map(q=>q.answer),['Cells','Mitochondria'])
 assert.equal(makeQuestions('Photosynthesis\nconverts sunlight into stored chemical energy.',1,'blank')[0].answer,'Photosynthesis')
 assert.equal(makeQuestions('Homeostasis:\nregulation of stable internal conditions.',1,'blank')[0].answer,'Homeostasis')
 assert.deepEqual(makeQuestions('Cell Biology',5,'blank'),[])
})

test('ECE course labels cannot become quiz subjects or distractors', () => {
 const notes = 'ECE 150 Fundamentals of Programming\nis taught in the first semester of engineering.\nVariables are named storage locations for program values.\nFunctions are reusable blocks of program instructions.'
 const questions = makeQuestions(notes,10,'choice')
 assert.equal(questions.length,2)
 assert.deepEqual(questions.map(q=>q.answer),['Variables','Functions'])
 assert.ok(questions.every(q=>!/(ECE|semester|fundamentals)/i.test(q.source)))
 assert.ok(questions.flatMap(q=>q.options ?? []).every(option=>['Variables','Functions'].includes(option)))
 assert.deepEqual(makeQuestions('ECE150 Fundamentals of Programming is a first year engineering course.',5,'blank'),[])
})
