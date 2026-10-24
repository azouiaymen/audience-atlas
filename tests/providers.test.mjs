import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,draft,sampleInput,parseSSE} from '../src/core.mjs';

test('FalkorDB mode builds a graph and uses returned database rows for recommendations',async()=>{
  const input=sampleInput();input.useFalkor=true;const queries=[];
  const c=await analyze(input,{__falkorQuery:async(name,query)=>{queries.push({name,query});return queries.length===1?[{created:1}]:[{communityId:'community-2',talkId:'talk-2',topic:'Security',communityEvidence:'Technical security research, software supply chain vulnerabilities and open-source security tools.',talkEvidence:input.event.text.split('\n')[2]}];}});
  assert.equal(c.engine,'FalkorDB');assert.equal(queries.length,2);assert.match(queries[0].query,/CREATE/);assert.match(queries[1].query,/MATCH/);
  assert.deepEqual(c.matches.filter(m=>m.matchCount).map(m=>m.name),['r/netsec']);
});
test('Bright Data fetch errors use supplied text and preserve warnings',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('failure',{status:503});
  try{const input=sampleInput();input.fetchPages=true;const c=await analyze(input,{BRIGHTDATA_API_KEY:'test-key',BRIGHTDATA_UNLOCKER_ZONE:'test-zone'});assert.equal(c.warnings.length,6);assert.ok(c.matches.every(m=>m.sourceMode.includes('fetch failed')));}
  finally{globalThis.fetch=original;}
});
test('OpenAI writer sends graph evidence and requires completed JSON output',async()=>{
  const original=globalThis.fetch;let sent;
  globalThis.fetch=async(url,options)=>{sent=JSON.parse(options.body);assert.equal(String(url),'https://api.openai.com/v1/responses');return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({text:'I am organizing a conference with a Python workshop.'})}]}]});};
  try{const c=await analyze(sampleInput());const result=await draft({event:c.event,match:c.matches[0],provider:'openai'},{OPENAI_API_KEY:'test-key'});assert.equal(result.provider,'OpenAI');assert.equal(sent.store,false);assert.match(sent.input,/communityEvidence/);}
  finally{globalThis.fetch=original;}
});
test('TrueForge writer creates an OpenAI agent session and reads terminal output',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});if(calls.length===1)return Response.json({id:'test-session'});return new Response('data: '+JSON.stringify({type:'turn.done',state:{status:'done',output:{content:'Draft from the configured OpenAI agent.'}}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});};
  try{const c=await analyze(sampleInput());const result=await draft({event:c.event,match:c.matches[0],provider:'trueforge'},{TRUEFORGE_BASE_URL:'https://trueforge.example.com'});assert.equal(result.sessionId,'test-session');assert.equal(calls[0].body.agent.spec.model.name,'openai/gpt-4.1-mini');assert.equal(calls[1].body.stream,true);assert.match(calls[1].url,/test-session\/turns$/);}
  finally{globalThis.fetch=original;}
});
