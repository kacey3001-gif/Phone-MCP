import test from 'node:test';import assert from 'node:assert/strict';
import {needsForegroundTextEvidence,verifyForegroundText,foregroundImageEvidence} from '../src/foreground-text.js';
import {runOperation} from '../src/automation.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {makeMcp} from '../src/mcp.js';
const frame=()=>({packageName:'com.example',displayId:0,snapshotId:'same-observation',nodes:[{nodeId:'0',text:'STALE 34',description:'OLD LABEL',editable:true,visible:true,bounds:[0,0,100,100]},{nodeId:'0.1',text:'7',clickable:true}]});
const shot=()=>({snapshotId:'same-observation',displayId:0,packageName:'com.example',mimeType:'image/png',data:'AA==',frameContent:'visible_pixels'});

test('old editable values are omitted without mutating IDs, bounds, original nodes or static labels',()=>{
 const original=frame(),safe=verifyForegroundText(original,{hasImage:true});assert.equal(safe.textFreshness.state,'verify_in_image');
 assert.equal(safe.nodes[0].text,undefined);assert.equal(safe.nodes[0].description,undefined);assert.equal(safe.nodes[0].textVerificationRequired,true);
 assert.equal(safe.nodes[0].nodeId,'0');assert.deepEqual(safe.nodes[0].bounds,[0,0,100,100]);assert.equal(safe.nodes[1].text,'7');assert.equal(original.nodes[0].text,'STALE 34');
 assert.match(safe.instruction,/fresh screenshot/);assert.deepEqual(safe.textFreshness.editableNodeIds,['0']);
});

test('native cache clearing, parallel displays, hidden and protected fields do not trigger capture',()=>{
 for(const value of [{...frame(),displayId:4},{...frame(),textFreshness:{state:'cache_cleared',method:'clearCache'}},{...frame(),nodes:[{nodeId:'0',text:'[champ protégé]',editable:true}]},{...frame(),nodes:[{nodeId:'0',text:'hidden',editable:true,visible:false}]}]){
  assert.equal(needsForegroundTextEvidence(value),false);assert.equal(verifyForegroundText(value),value);
 }
});

test('only visible image bytes bound to the exact observation count as visual evidence',()=>{
 assert.equal(foregroundImageEvidence(shot(),frame()),true);
 for(const patch of [{snapshotId:'other'},{packageName:'com.other'},{displayId:7},{sessionId:'other'},{data:''},{mimeType:'text/plain'},{frameContent:'black_or_empty'}])assert.equal(foregroundImageEvidence({...shot(),...patch},frame()),false);
});

test('direct snapshot obtains visual fallback even with optional images off and removes stale text',async()=>{
 const ops=[];const r=await runOperation(async(op,a)=>{ops.push({op,a});return op==='snapshot'?frame():shot();},'snapshot',{packageName:'com.example',includeScreenshot:false});
 assert.deepEqual(ops.map(x=>x.op),['snapshot','screenshot']);assert.equal(ops[1].a.snapshotId,'same-observation');
 assert.equal(r.textFreshness.state,'verify_in_image');assert.equal(r.nodes[0].text,undefined);assert.ok(r.screenshot);
});

test('post-action visual fallback never repeats input and returns a protected-value warning on refusal',async()=>{
 for(const capture of ['good','denied','wrong','black']){
  const ops=[];const r=await runOperation(async op=>{ops.push(op);if(op==='click')return {performed:true};if(op==='snapshot')return frame();if(capture==='denied')throw Error('Capture permission revoked');if(capture==='wrong')return {...shot(),snapshotId:'other'};if(capture==='black')return {...shot(),frameContent:'black_or_empty'};return shot();},'click',{packageName:'com.example',snapshotId:'before',nodeId:'0.1',includeScreenshot:false,settleMs:0});
  assert.deepEqual(ops,['click','snapshot','screenshot']);assert.equal(r.performed,true);assert.equal(r.observation.nodes[0].text,undefined);
  assert.equal(r.observation.textFreshness.state,capture==='good'?'verify_in_image':'unverified');
  if(capture!=='good'){assert.equal(r.screenshot,undefined);assert.ok(r.screenshotError);}
 }
});

test('read-only capture failures keep values unverified, and cursor pages retain their original IDs',async()=>{
 const ops=[];const r=await runOperation(async op=>{ops.push(op);if(op==='snapshot')return frame();throw Error('Capture denied');},'snapshot',{packageName:'com.example',cursor:'same-observation.200',includeScreenshot:false});
 assert.deepEqual(ops,['snapshot','screenshot']);assert.equal(r.snapshotId,'same-observation');assert.equal(r.textFreshness.state,'unverified');assert.equal(r.nodes[0].text,undefined);assert.match(r.screenshotError,/denied/);
});

test('native fixed companion returns verified text without the fallback capture cost',async()=>{
 const ops=[];const r=await runOperation(async op=>{ops.push(op);return {...frame(),textFreshness:{state:'cache_cleared',method:'reapplyServiceInfo'}};},'snapshot',{packageName:'com.example',includeScreenshot:false});
 assert.deepEqual(ops,['snapshot']);assert.equal(r.nodes[0].text,'STALE 34');assert.equal(r.textFreshness.state,'cache_cleared');
});

test('text search never reports a cached editable value as an exact found match',async()=>{
 const ops=[];const r=await runOperation(async op=>{ops.push(op);return op==='snapshot'?frame():shot();},'find_nodes',{packageName:'com.example',query:'STALE 34',by:'text',match:'exact'});
 assert.deepEqual(ops,['snapshot','screenshot']);assert.equal(r.found,false);assert.equal(r.unverifiedMatch,true);assert.equal(r.nodes[0].text,undefined);assert.ok(r.screenshot);
});

test('idle reads expose visual evidence at the MCP image level, never embedded base64 in nodes',async()=>{
 const ops=[];const r=await runOperation(async op=>{ops.push(op);return op==='snapshot'?frame():shot();},'wait_for_idle',{packageName:'com.example',stableMs:0,timeoutMs:100});
 assert.deepEqual(ops,['snapshot','screenshot']);assert.equal(r.idle,true);assert.equal(r.observation.nodes[0].text,undefined);assert.equal(r.observation.screenshot,undefined);assert.ok(r.screenshot);
});

test('real MCP transport emits an image and omits legacy editable text from both snapshot and action results',async t=>{
 const observed={...frame(),snapshotId:'9405dd7c-cdd2-45b3-8b1f-6157113483d7'};
 const server=makeMcp({scopes:['phone.read','phone.write'],family:'fresh-text-test'},async op=>op==='snapshot'?observed:op==='screenshot'?{...shot(),snapshotId:observed.snapshotId}:{performed:true},()=>({connected:true}));
 const client=new Client({name:'fresh-text-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);t.after(()=>client.close());t.after(()=>server.close());
 for(const [name,arguments_] of [['phone_snapshot',{packageName:'com.example',includeScreenshot:false}],['phone_click',{packageName:'com.example',snapshotId:observed.snapshotId,nodeId:'0.1',settleMs:0,includeScreenshot:false}]]){
  const response=await client.callTool({name,arguments:arguments_});assert.equal(response.isError,undefined);assert.equal(response.content[0].type,'image');
  const result=JSON.parse(response.content.find(c=>c.type==='text').text),screen=result.observation??result;
  assert.equal(screen.nodes[0].text,undefined);assert.equal(screen.textFreshness.state,'verify_in_image');assert.equal(result.screenshot.data,undefined);
 }
});
