import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDomain, createBlocker, installBlocker, BLOCKER_KEY } from '../public/blocker.js'

function mockApi(initial={enabled:false,domains:[]}) {
 let stored=structuredClone(initial);let rules=[{id:42,action:{type:'allow'}}];let failSave=false;const listeners={}
 const api={
  storage:{local:{get:async()=>({[BLOCKER_KEY]:structuredClone(stored)}),set:async value=>{if(failSave){failSave=false;throw new Error('storage unavailable')}stored=structuredClone(value[BLOCKER_KEY])}}},
  declarativeNetRequest:{getDynamicRules:async()=>structuredClone(rules),updateDynamicRules:async({removeRuleIds,addRules})=>{rules=rules.filter(r=>!removeRuleIds.includes(r.id)).concat(addRules)}},
  runtime:{id:'synthetic-extension',onInstalled:{addListener:fn=>{listeners.installed=fn}},onStartup:{addListener:fn=>{listeners.startup=fn}},onMessage:{addListener:fn=>{listeners.message=fn}}}
 }
 return {api,listeners,rules:()=>rules,failNextSave:()=>{failSave=true}}
}
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
 await blocker.update({action:'add',domain:'https://www.example.com/private'})
 assert.equal(mock.rules().length,1)
 await blocker.update({action:'toggle',enabled:true})
 const rule=mock.rules().find(r=>r.id===10000)
 assert.equal(rule.action.type,'block')
 assert.deepEqual(rule.condition.requestDomains,['example.com'])
 assert.deepEqual(rule.condition.resourceTypes,['main_frame'])
 assert.ok(mock.rules().some(r=>r.id===42))
 await blocker.update({action:'toggle',enabled:false})
 assert.deepEqual(mock.rules().map(r=>r.id),[42])
 assert.deepEqual((await blocker.get()).domains,['example.com'])
})
test('removing a website updates active blocking and settings persist across worker restarts',async()=>{
 const mock=mockApi({enabled:true,domains:['example.com','youtube.com']});const blocker=createBlocker(mock.api)
 await blocker.restore();await blocker.update({action:'remove',domain:'example.com'})
 assert.deepEqual(mock.rules().filter(r=>r.id>=10000).flatMap(r=>r.condition.requestDomains),['youtube.com'])
 assert.deepEqual(await createBlocker(mock.api).restore(),{enabled:true,domains:['youtube.com']})
})
test('serialized operations do not lose simultaneous additions',async()=>{
 const mock=mockApi();const blocker=createBlocker(mock.api)
 await Promise.all([blocker.update({action:'add',domain:'example.com'}),blocker.update({action:'add',domain:'youtube.com'})])
 assert.deepEqual((await blocker.get()).domains,['example.com','youtube.com'])
 await assert.rejects(blocker.update({action:'add',domain:'WWW.EXAMPLE.COM'}),/already/)
})
test('storage failures restore the prior browser rules',async()=>{
 const mock=mockApi({enabled:true,domains:['example.com']});const blocker=createBlocker(mock.api)
 await blocker.restore();mock.failNextSave()
 await assert.rejects(blocker.update({action:'add',domain:'youtube.com'}),/save/)
 assert.deepEqual((await blocker.get()).domains,['example.com'])
 assert.deepEqual(mock.rules().filter(r=>r.id>=10000).flatMap(r=>r.condition.requestDomains),['example.com'])
})
test('messages from other extensions cannot change blocking',async()=>{
 const mock=mockApi();installBlocker(mock.api)
 assert.equal(mock.listeners.message({type:'recall.blocker',action:'toggle',enabled:true},{id:'different-extension'},()=>assert.fail('must not respond')),false)
 const state=await new Promise(resolve=>{
  const waiting=mock.listeners.message({type:'recall.blocker',action:'get'},{id:mock.api.runtime.id},resolve)
  assert.equal(waiting,true)
 })
 assert.equal(state.ok,true);assert.equal(state.state.enabled,false)
})
test('the list is bounded and malformed cached domains are ignored',async()=>{
 const domains=Array.from({length:100},(_,i)=>`site${i}.example.com`)
 const blocker=createBlocker(mockApi({enabled:true,domains}).api)
 await assert.rejects(blocker.update({action:'add',domain:'extra.example.com'}),/limit/)
 const sanitized=createBlocker(mockApi({enabled:true,domains:['localhost','example.com',null]}).api)
 assert.deepEqual(await sanitized.restore(),{enabled:true,domains:['example.com']})
})
