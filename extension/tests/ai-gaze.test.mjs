import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const load = async name => {
  const js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const { parseQuestions, parseCards, excerpt } = await load('aiParse')
const { classify, FocusTracker, signals } = await load('gaze')

test('model output becomes valid questions and malformed items are dropped', () => {
  const reply = 'Sure! ```json\n[{"question":"Why does water move into a cell placed in pure water?","options":["Osmosis","Diffusion of salt","Active transport","Evaporation"],"answer":"osmosis","explanation":"Water moves toward the higher solute concentration.","topic":"Osmosis"},{"question":"Bad one","options":["A","B","C"],"answer":"Not listed"},{"question":"Explain why mitochondria matter.","answer":"They release energy the cell can use."},{"question":"short","answer":"x"}]\n``` hope that helps'
  const questions = parseQuestions(reply, 10)
  assert.equal(questions.length, 2)
  assert.deepEqual([questions[0].kind, questions[0].answer, questions[0].options.length], ['choice', 'Osmosis', 4])
  assert.equal(questions[0].explanation, 'Water moves toward the higher solute concentration.')
  assert.equal(questions[1].kind, 'long')
  assert.ok(questions.every(q => q.source.startsWith('ai:')))
  assert.deepEqual(parseQuestions('I cannot do that.', 5), [])
  assert.equal(parseQuestions(reply, 1).length, 1)
})
test('flashcards are parsed, de-duplicated and capped', () => {
  const cards = parseCards('[{"front":"Osmosis","back":"Water moving across a membrane."},{"front":"osmosis","back":"dup"},{"front":"","back":"x"},{"front":"ATP","back":"The cell\'s energy currency."}]', 5)
  assert.deepEqual(cards.map(card => card.front), ['Osmosis', 'ATP'])
})
test('the excerpt puts focus passages first and respects the budget', () => {
  const passages = ['Plants need light.', 'Mitochondria release energy.', 'Osmosis moves water.']
  assert.ok(excerpt(passages, 'osmosis', 200).startsWith('Osmosis moves water.'))
  assert.ok(excerpt(passages, '', 30).length <= 30)
})
const facing = { yaw: .5, pitch: .55, blink: 0, side: .1, up: .1, down: .3 }
test('gaze is classified from head pose and eye signals', () => {
  assert.equal(classify(null), 'none')
  assert.equal(classify(facing), 'screen')
  assert.equal(classify({ ...facing, down: .6 }), 'screen')
  assert.equal(classify({ ...facing, yaw: .78 }), 'away')
  assert.equal(classify({ ...facing, side: .85 }), 'away')
  assert.equal(classify({ ...facing, blink: .9 }), 'closed')
  const points = []; points[1] = { x: .5, y: .5 }; points[234] = { x: .3, y: .5 }; points[454] = { x: .7, y: .5 }; points[10] = { x: .5, y: .2 }; points[152] = { x: .5, y: .8 }
  const read = signals(points, { eyeBlinkLeft: .2, eyeBlinkRight: .4 })
  assert.ok(Math.abs(read.yaw - .5) < 1e-9 && Math.abs(read.pitch - .5) < 1e-9 && Math.abs(read.blink - .3) < 1e-9)
  assert.equal(classify(read), 'screen')
  assert.equal(signals([], {}), null)
})
test('focus score counts time on screen, ignores blinks, and checks in once after the timeout', () => {
  const tracker = new FocusTracker(5)
  let now = 1000, snapshot
  const run = (state, seconds) => { for (let i = 0; i < seconds * 5; i++) { now += 200; snapshot = tracker.update(state, now) } }
  tracker.update('screen', now)
  run('screen', 10); assert.equal(snapshot.score, 100); assert.equal(snapshot.bestStreakSeconds, 10)
  now += 200; snapshot = tracker.update('closed', now); assert.equal(snapshot.awaySeconds, 0)
  let alerts = 0
  for (let i = 0; i < 50; i++) { now += 200; snapshot = tracker.update('away', now); if (snapshot.checkIn) alerts++ }
  // Only the five seconds before the check-in are scored; the paused wait afterwards is not.
  assert.equal(alerts, 1); assert.equal(snapshot.awaySeconds, 10); assert.equal(snapshot.score, 67); assert.equal(snapshot.lapses, 1)
  run('screen', 1); assert.equal(snapshot.awaySeconds, 0)
  now += 60000; snapshot = tracker.update('none', now); assert.equal(snapshot.awaySeconds, 0)
})
test('looking back for two seconds ends a check-in, and short glances are not lapses', () => {
  const tracker = new FocusTracker(5)
  let now = 1000, snapshot, returns = 0, alerts = 0
  const run = (state, seconds) => { for (let i = 0; i < seconds * 5; i++) { now += 200; snapshot = tracker.update(state, now); if (snapshot.returned) returns++; if (snapshot.checkIn) alerts++ } }
  tracker.update('screen', now)
  run('screen', 3); run('away', 1); run('screen', 3)
  assert.equal(snapshot.lapses, 0); assert.equal(snapshot.bestStreakSeconds, 6)
  run('away', 6); assert.equal(alerts, 1)
  run('screen', 1); assert.equal(returns, 0)
  run('away', 1); run('screen', 3); assert.equal(returns, 1)
  const scored = snapshot.observedSeconds
  run('away', 6); assert.equal(alerts, 2); assert.equal(snapshot.lapses, 2)
  tracker.acknowledge(); run('screen', 2)
  assert.ok(snapshot.observedSeconds > scored); assert.equal(snapshot.awaySeconds, 0)
  assert.ok(snapshot.timeline.length > 0 && snapshot.timeline.length <= 60)
  assert.ok(snapshot.timeline.includes('away') && snapshot.timeline.includes('screen'))
  tracker.reset(); assert.equal(tracker.update('screen', now + 200).timeline.length, 0)
})

test('a chat model is chosen from what the key can use, and replies can be streamed', async () => {
  const { pickModel, complete } = await load('ai')
  assert.equal(pickModel('groq', ['gemma2-9b-it', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile']), 'llama-3.3-70b-versatile')
  assert.equal(pickModel('gemini', ['gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro']), 'gemini-2.5-flash')
  assert.equal(pickModel('openrouter', ['openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct:free']), 'meta-llama/llama-3.3-70b-instruct:free')
  assert.equal(pickModel('custom', []), '')
  const original = globalThis.fetch
  const seen = []
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.body).stream, true)
    const body = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n'
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const text = await complete([{ role: 'user', content: 'hi' }], { provider: 'groq', model: 'm', key: 'test-value', baseUrl: '' }, value => seen.push(value))
    assert.equal(text, 'Hello')
    assert.deepEqual(seen, ['Hel', 'Hello'])
  } finally { globalThis.fetch = original }
})
