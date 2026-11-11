import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source = readFileSync(new URL('../src/material.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {appendMaterial, MAX_MATERIAL_LENGTH} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
test('photo text appends without losing existing notes', () => {
 assert.equal(appendMaterial('Existing notes', '  New notes  '), 'Existing notes\n\nNew notes')
 assert.equal(appendMaterial('   ', 'New notes'), 'New notes')
})
test('the length limit includes the separator and never truncates text', () => {
 const existing='a'.repeat(MAX_MATERIAL_LENGTH-3)
 assert.equal(appendMaterial(existing,'b').length,MAX_MATERIAL_LENGTH)
 assert.throws(()=>appendMaterial(existing,'bb'),/exceed/)
 assert.equal(existing.length,MAX_MATERIAL_LENGTH-3)
})
test('blank photo transcription cannot be imported', () => {
 assert.throws(()=>appendMaterial('Existing','   '),/Add text/)
})
