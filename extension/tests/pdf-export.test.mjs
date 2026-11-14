import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const load = async name => {
  const js = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}
const { pdfSafe } = await load('pdfExport')

test('symbols the PDF font cannot draw are written out', () => {
  assert.equal(pdfSafe('x ≤ 5 → y ≥ 2π'), 'x <= 5 -> y >= 2pi')
  assert.equal(pdfSafe('“Quoted” – dash…'), '"Quoted" - dash...')
  assert.equal(pdfSafe('Δv over √t'), 'deltav over sqrtt')
})
test('characters the font has, line breaks and tabs are kept', () => {
  assert.equal(pdfSafe('25°C, ½ and µm²'), '25°C, ½ and µm²')
  assert.equal(pdfSafe('a\r\nb\tc'), 'a\nb    c')
  assert.equal(pdfSafe('emoji 🙂'), 'emoji ?')
})
