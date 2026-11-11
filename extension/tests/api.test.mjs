import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8')
 .replace(/^export const API_BASE = .*$/m, "export const API_BASE = 'http://localhost:8080/api'")
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {extractPdf, extractPdfDocument} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const file = new File(['%PDF-fixture'], 'fixture.pdf', {type:'application/pdf'})
function mockFetch(t, fn) { const original=globalThis.fetch; globalThis.fetch=fn; t.after(()=>{globalThis.fetch=original}) }
test('PDF network failures explain how to start the backend',async t=>{
 mockFetch(t,async()=>{throw new TypeError('Failed to fetch')})
 await assert.rejects(extractPdf(file),/Start the Java server/)
})
test('PDF timeouts are distinguished from an unavailable backend',async t=>{
 mockFetch(t,async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'})})
 await assert.rejects(extractPdf(file),/timed out/)
})
test('PDF validation errors from the backend remain useful',async t=>{
 mockFetch(t,async()=>({ok:false,json:async()=>({message:'No selectable text found.'})}))
 await assert.rejects(extractPdf(file),/No selectable text/)
})
test('successful PDF text is returned and malformed responses are rejected',async t=>{
 mockFetch(t,async()=>({ok:true,json:async()=>({text:'Imported material'})}))
 assert.equal(await extractPdf(file),'Imported material')
 globalThis.fetch=async()=>({ok:true,json:async()=>({text:42})})
 await assert.rejects(extractPdf(file),/Invalid extracted text/)
})

test('PDF import preserves page counts and incomplete-text warnings',async t=>{
 mockFetch(t,async()=>({ok:true,json:async()=>({text:'Actual document body',pageCount:3,pages:[{number:1,words:20},{number:2,words:0},{number:3,words:40}],warnings:['Page 2 has no readable text.']})}))
 const result=await extractPdfDocument(file)
 assert.equal(result.text,'Actual document body')
 assert.equal(result.pageCount,3)
 assert.equal(result.pages[1].words,0)
 assert.deepEqual(result.warnings,['Page 2 has no readable text.'])
})
