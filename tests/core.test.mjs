import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,sampleInput,safeUrl,extractTopics,parseSSE,templateDraft,validateInput,visibleSourceText,graphWriteQuery} from '../src/core.mjs';

test('sample campaign finds evidence-backed paths and excludes unrelated communities',async()=>{
  const c=await analyze(sampleInput());
  assert.equal(c.engine,'Local graph traversal');assert.equal(c.talks.length,3);
  assert.equal(c.matches.find(m=>m.name.includes('Design club')).matchCount,0);
  const matched=c.matches.filter(m=>m.matchCount);assert.equal(matched.length,4);
  for(const m of matched)for(const p of m.paths){assert.ok(m.text.includes(p.communityEvidence));assert.ok(c.talks.find(t=>t.id===p.talkId).text.includes(p.talkEvidence));}
});
test('matching follows relationships instead of making every group a match',async()=>{
  const a=sampleInput();a.communities=[{name:'Rust builders',url:'https://www.reddit.com/r/rust/',text:'Rust compiler work, cargo packages and systems programming.'}];
  const c=await analyze(a);assert.equal(c.matches[0].matchCount,0);
  a.event.text+='\nRust tooling | Jo | A practical Rust and cargo workshop.';
  const d=await analyze(a);assert.equal(d.matches[0].matchCount,1);assert.equal(d.matches[0].paths[0].topic,'Rust');
});
test('service modes fail explicitly when credentials are missing',async()=>{
  const input=sampleInput();input.useFalkor=true;await assert.rejects(()=>analyze(input),/FalkorDB is not configured/);
  input.useFalkor=false;input.useAI=true;await assert.rejects(()=>analyze(input),/Connect OpenAI/);
});
test('public source URLs reject unsafe protocols and embedded credentials',()=>{
  for(const u of ['http://example.com','https://user:secret@reddit.com/','https://127.0.0.1/','https://localhost/','file:///x','https://[::1]/','https://reddit.com:6379/'])assert.throws(()=>safeUrl(u));
  assert.equal(safeUrl('https://www.reddit.com/r/Python/#x'),'https://www.reddit.com/r/Python/');
});
test('keyword extraction retains exact source evidence and respects word boundaries',()=>{
  assert.deepEqual(extractTopics('We like trust and colorful cargo pants.'),[]);
  assert.deepEqual(extractTopics('We like trust and illustration.'),[]);
  const s='We discuss Python and pandas.';assert.equal(extractTopics(s).find(t=>t.name==='Python').evidence,s);
});
test('FalkorDB multiline SSE payloads parse and error events survive',()=>{
  const events=parseSSE('event: result\ndata: {\ndata: "data":[{"communityId":"c1"}]\ndata: }\n\nevent: error\ndata: {"message":"failed"}\n\n');
  assert.equal(events[0].data.data[0].communityId,'c1');assert.equal(events[1].event,'error');
});
test('drafts disclose organizer affiliation and no-match drafts are rejected',async()=>{
  const c=await analyze(sampleInput());const text=templateDraft(c.event,c.matches[0]);assert.match(text,/helping organize/);assert.match(text,/registration/);
  assert.throws(()=>templateDraft(c.event,c.matches.find(m=>!m.matchCount)),/no supported connection/);
});
test('duplicate community sources are rejected',()=>{
  const input=sampleInput();input.communities[1].url=input.communities[0].url;assert.throws(()=>validateInput(input),/different URL/);
});

test('Markdown URL destinations do not become topic evidence; visible labels remain',()=>{
  const text='We discuss illustration. [Read more](https://site.com/python-guide)\n[More][guide]\n[guide]: https://site.com/rust\n<https://site.com/fastapi> https://site.com/pandas';
  assert.deepEqual(extractTopics(text),[]);assert.ok(visibleSourceText(text).includes('Read more'));
  assert.equal(extractTopics('[Python workshop](https://site.com/article)')[0].name,'Python');
  assert.equal(visibleSourceText('[Read more](https://site.com/a_(python))'),'Read more');
});

test('unverified event URLs are never stored as sources for supplied talk quotes',async()=>{
  const c=await analyze(sampleInput());
  assert.equal(c.event.sourceMode,'Organizer-supplied agenda');
  for(const edge of c.graph.edges.filter(e=>e.type==='COVERS')){assert.equal(edge.url,'');assert.equal(edge.sourceMode,'Organizer-supplied agenda');}
  for(const m of c.matches)for(const p of m.paths){assert.equal(p.talkSourceUrl,'');assert.equal(p.talkSourceMode,'Organizer-supplied agenda');}
  assert.match(graphWriteQuery(c.graph),/sourceMode:"Organizer-supplied agenda"/);
});
