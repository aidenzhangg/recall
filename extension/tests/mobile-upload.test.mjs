import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
const source = readFileSync(new URL('../../backend/src/main/resources/static/connect.js', import.meta.url), 'utf8')
function harness(size, type='image/png') {
 const elements = Object.fromEntries(['pair','send','status','file','notes','upload'].map(id=>[id,{value:'',textContent:'',disabled:false}]))
 elements.file.files=[{size,type}]
 let submit; let sent=0
 elements.upload.addEventListener=(_,fn)=>{submit=fn}
 elements.upload.reset=()=>{}
 vm.runInNewContext(source, {
  document:{getElementById:id=>elements[id]}, location:{hash:'#synthetic-pairing',pathname:'/connect.html'},
  history:{replaceState(){}}, FormData:class {append(){}}, AbortSignal:{timeout(){}},
  fetch:async()=>{sent++;return {ok:true}}
 })
 return {run:()=>submit({preventDefault(){}}), sent:()=>sent, elements}
}
test('phone page accepts a photo at the 20 MB boundary',async()=>{
 const page=harness(20*1024*1024);await page.run();assert.equal(page.sent(),1)
 assert.match(page.elements.status.textContent,/Sent/)
})
test('phone page rejects oversized files before making a request',async()=>{
 const page=harness(20*1024*1024+1);await page.run();assert.equal(page.sent(),0)
 assert.match(page.elements.status.textContent,/20 MB/)
})
test('larger limit does not allow unsupported image types',async()=>{
 const page=harness(100,'image/svg+xml');await page.run();assert.equal(page.sent(),0)
})
