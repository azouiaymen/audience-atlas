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
  try{const input=sampleInput();input.fetchPages=true;const c=await analyze(input,{BRIGHTDATA_API_KEY:'test-key',BRIGHTDATA_UNLOCKER_ZONE:'test-zone'});assert.equal(c.warnings.length,5);assert.ok(c.matches.every(m=>m.sourceMode.includes('fetch failed')));assert.equal(c.collection,'Pasted text (all live fetches failed)');assert.equal(c.collectionStats.succeeded,0);}
  finally{globalThis.fetch=original;}
});

test('Bright Data fetches real community URLs without overwriting the structured agenda',async()=>{
  const original=globalThis.fetch,calls=[];
  const page='Python developers discuss open-source Python libraries, maintainers and first-time contributions to useful projects.';
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return new Response(page);};
  try{
    const input=sampleInput();input.fetchPages=true;input.communities=input.communities.slice(0,2);
    const c=await analyze(input,{BRIGHTDATA_API_KEY:'test-key',BRIGHTDATA_UNLOCKER_ZONE:'test-zone'});
    assert.equal(c.event.text,input.event.text);assert.equal(c.talks.length,3);assert.equal(calls.length,2);
    assert.ok(calls.every(call=>call.url==='https://api.brightdata.com/request'&&call.body.data_format==='markdown'));
    assert.deepEqual(calls.map(call=>call.body.url),input.communities.map(x=>x.url));
    assert.equal(c.collection,'Bright Data (2/2 fetched)');assert.equal(c.collectionStats.succeeded,2);
    assert.ok(c.matches.every(m=>m.text===page&&m.sourceMode==='Bright Data'&&m.fetchedAt));
  }finally{globalThis.fetch=original;}
});

test('requesting live collection without credentials fails instead of claiming Bright Data',async()=>{
  const input=sampleInput();input.fetchPages=true;await assert.rejects(()=>analyze(input),/Connect Bright Data/);
});

test('partial Bright Data failure preserves source-specific provenance and accurate counts',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>JSON.parse(options.body).url.includes('/AI_Agents/')?new Response('AI agents and knowledge graphs help developers build persistent agent memory across application sessions.'):new Response('failure',{status:503});
  try{
    const input=sampleInput();input.fetchPages=true;input.communities=input.communities.slice(0,2);
    const c=await analyze(input,{BRIGHTDATA_API_KEY:'test-key',BRIGHTDATA_UNLOCKER_ZONE:'test-zone'});
    assert.deepEqual(c.collectionStats,{requested:2,succeeded:1,failed:1});assert.equal(c.collection,'Bright Data (1/2 fetched)');
    assert.equal(c.warnings.length,1);assert.equal(c.matches.find(m=>m.name==='r/Python').text,input.communities[1].text);
    assert.equal(c.matches.find(m=>m.name==='r/AI_Agents').sourceMode,'Bright Data');
  }finally{globalThis.fetch=original;}
});

test('a failed community fetch without sufficient pasted evidence stops the analysis',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('unavailable',{status:503});
  try{const input=sampleInput();input.fetchPages=true;input.communities[0].text='too short';await assert.rejects(()=>analyze(input,{BRIGHTDATA_API_KEY:'test-key',BRIGHTDATA_UNLOCKER_ZONE:'test-zone'}),/Bright Data returned HTTP 503/);}
  finally{globalThis.fetch=original;}
});

test('link-heavy Markdown is cleaned before truncation and cannot invent Python matches',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('A design community discussing visual design. [Read more](https://site.com/python/'+ 'x'.repeat(18000)+') We discuss Rust compiler internals, cargo packages and low-level systems programming.');
  try{
    const input=sampleInput();input.fetchPages=true;input.communities=input.communities.slice(0,1);
    const c=await analyze(input,{BRIGHTDATA_API_KEY:'test-key',BRIGHTDATA_UNLOCKER_ZONE:'test-zone'});
    assert.ok(c.matches[0].text.includes('Rust compiler'));assert.ok(!c.matches[0].text.includes('python'));
    assert.ok(c.matches[0].text.length<300);assert.equal(c.matches[0].matchCount,0);
  }finally{globalThis.fetch=original;}
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
