import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDomain, createBlocker, installBlocker, BLOCKER_KEY } from '../public/blocker.js'

function mockApi(legacy) {
 let stored=legacy?structuredClone(legacy):undefined;let rules=[{id:42,action:{type:'allow'}}];const listeners={}
 const api={
  storage:{local:{get:async()=>(stored?{[BLOCKER_KEY]:structuredClone(stored)}:{}),set:async()=>assert.fail('nothing may be saved to the device'),remove:async()=>{stored=undefined}}},
  declarativeNetRequest:{getDynamicRules:async()=>structuredClone(rules),updateDynamicRules:async({removeRuleIds,addRules})=>{rules=rules.filter(r=>!removeRuleIds.includes(r.id)).concat(addRules)}},
  runtime:{id:'synthetic-extension',onMessage:{addListener:fn=>{listeners.message=fn}}}
 }
 return {api,listeners,rules:()=>rules,stored:()=>stored}
}
const blocked=mock=>mock.rules().filter(r=>r.id>=10000).flatMap(r=>r.condition.requestDomains)
test('URLs reduce to a canonical hostname without saving paths or queries',()=>{
 assert.equal(normalizeDomain(' HTTPS://WWW.YouTube.com/watch?v=private '),'youtube.com')
 assert.equal(normalizeDomain('example.com:8080/a'),'example.com')
 assert.equal(normalizeDomain('example.com.'),'example.com')
 assert.equal(normalizeDomain('https://b\u00fccher.de/path'),'xn--bcher-kva.de')
})
test('invalid domains, login details, wildcards and local services are rejected',()=>{
 for(const value of ['','localhost','127.0.0.1','http://127.1','https://[::1]','*.example.com','https://name:password@example.com','file://example.com','bad host.com','singlelabel']) assert.throws(()=>normalizeDomain(value),value)
})
test('turning blocking on installs only main-frame domain rules and preserves unrelated rules',async()=>{
 const mock=mockApi();const blocker=createBlocker(mock.api)
 await blocker.set({enabled:false,domains:['example.com']})
 assert.equal(mock.rules().length,1)
 await blocker.set({enabled:true,domains:['example.com']})
 const rule=mock.rules().find(r=>r.id===10000)
 assert.equal(rule.action.type,'block')
 assert.deepEqual(rule.condition.requestDomains,['example.com'])
 assert.deepEqual(rule.condition.resourceTypes,['main_frame'])
 assert.ok(mock.rules().some(r=>r.id===42))
 await blocker.set({enabled:false,domains:['example.com']})
 assert.deepEqual(mock.rules().map(r=>r.id),[42])
})
test('the account list replaces the active rules and nothing is written to the device',async()=>{
 const mock=mockApi();const blocker=createBlocker(mock.api)
 await blocker.set({enabled:true,domains:['example.com','youtube.com']})
 await blocker.set({enabled:true,domains:['youtube.com']})
 assert.deepEqual(blocked(mock),['youtube.com'])
 assert.deepEqual(await createBlocker(mock.api).get(),{enabled:true,domains:['youtube.com']})
 await blocker.set({enabled:false,domains:[]})
 assert.deepEqual(await blocker.get(),{enabled:false,domains:[]})
})
test('a list saved on the device by an earlier version is handed over once, then removed',async()=>{
 const mock=mockApi({enabled:false,domains:['example.com','localhost']});const blocker=createBlocker(mock.api)
 const legacy=await blocker.get()
 assert.deepEqual(legacy,{enabled:false,domains:['example.com']})
 await blocker.set(legacy)
 assert.equal(mock.stored(),undefined)
 assert.deepEqual(await blocker.get(),{enabled:false,domains:[]})
})
test('simultaneous updates are applied in order',async()=>{
 const mock=mockApi();const blocker=createBlocker(mock.api)
 await Promise.all([blocker.set({enabled:true,domains:['example.com']}),blocker.set({enabled:true,domains:['example.com','youtube.com']})])
 assert.deepEqual(blocked(mock),['example.com','youtube.com'])
})
test('messages from other extensions cannot change blocking',async()=>{
 const mock=mockApi();installBlocker(mock.api)
 assert.equal(mock.listeners.message({type:'recall.blocker',action:'set',state:{enabled:true,domains:['example.com']}},{id:'different-extension'},()=>assert.fail('must not respond')),false)
 const send=message=>new Promise(resolve=>assert.equal(mock.listeners.message(message,{id:mock.api.runtime.id},resolve),true))
 const state=await send({type:'recall.blocker',action:'get'})
 assert.equal(state.ok,true);assert.equal(state.state.enabled,false)
 assert.equal((await send({type:'recall.blocker',action:'toggle',enabled:true})).ok,false)
 assert.deepEqual((await send({type:'recall.blocker',action:'set',state:{enabled:true,domains:['example.com']}})).state.domains,['example.com'])
})
test('the list is bounded and malformed domains are ignored',async()=>{
 const mock=mockApi();const blocker=createBlocker(mock.api)
 const domains=Array.from({length:120},(_,i)=>`site${i}.example.com`)
 assert.equal((await blocker.set({enabled:true,domains})).domains.length,100)
 assert.deepEqual(await blocker.set({enabled:true,domains:['localhost','example.com',null,'EXAMPLE.com']}),{enabled:true,domains:['example.com']})
})
