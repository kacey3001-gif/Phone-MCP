import test from 'node:test';
import assert from 'node:assert/strict';
import {uiFlow} from '../src/fast-workflows.js';

const packageName='com.example.fixture';
const args={packageName,_ownerKey:'owner',timeoutMs:2000,steps:[{op:'wait_and_click',query:'Next',by:'text',timeoutMs:1000}]};
const parent={nodeId:'0',clickable:true,bounds:[0,0,100,100]};
const label={nodeId:'0.1',parent:'0',text:'Next',bounds:[10,10,80,40]};
const frame=(nodes,extra={})=>({packageName,snapshotId:'observed',nodes,truncated:false,...extra});

test('foreground flow observes exact next screen for every click without unsupported native commands',async()=>{
 const events=[];let screen=0;
 const result=await uiFlow(async(op,a)=>{
  events.push({op,a});assert.equal(a._ownerKey,'owner');assert.equal(a.sessionId,undefined);
  if(op==='snapshot')return frame([parent,{...label,text:screen?'Done':'Next'}],{snapshotId:'screen-'+screen});
  assert.equal(op,'click');assert.equal(a.nodeId,'0');assert.equal(a.snapshotId,'screen-'+screen);screen++;return {performed:true};
 },{...args,steps:[...args.steps,{...args.steps[0],query:'Done'}]});
 assert.equal(result.completed,true);assert.equal(result.performedActions,2);
 assert.deepEqual(events.map(e=>e.op),['snapshot','click','snapshot','click']);
});

test('later pages participate in uniqueness checks before input',async()=>{
 let clicks=0;const cursors=[];
 const result=await uiFlow(async(op,a)=>{
  if(op==='click'){clicks++;return {performed:true};}
  cursors.push(a.cursor);return a.cursor?frame([{...parent,nodeId:'0.2',text:'Next'}]):frame([parent,label],{nextCursor:'observed.350'});
 },args);
 assert.equal(clicks,0);assert.equal(result.completed,false);assert.equal(result.uncertain,false);
 assert.match(result.reason,/Several/);assert.deepEqual(cursors,[undefined,'observed.350']);
});

test('truncated, changed, hidden, disabled and protected observations never generate input',async()=>{
 for(const nodes of [[{...parent,text:'Next',visible:false}],[{...parent,text:'Next',enabled:false}],[{...parent,text:'[champ protégé]',description:'Next'}],[{...label,parent:'missing'}]]){
  let clock=0,clicks=0;
  const result=await uiFlow(async op=>{if(op==='click')clicks++;clock+=1100;return frame(nodes);},args,{now:()=>clock});
  assert.equal(clicks,0);assert.equal(result.completed,false);
 }
 for(const variant of ['truncated','changed','wrong-app']){
  let reads=0,clicks=0;
  const result=await uiFlow(async op=>{
   if(op==='click'){clicks++;return {performed:true};}reads++;
   if(variant==='truncated')return frame([parent,label],{truncated:true});
   if(variant==='wrong-app')return frame([parent,label],{packageName:'com.other'});
   return reads===1?frame([parent],{nextCursor:'observed.350'}):frame([label],{snapshotId:'changed'});
  },args);
  assert.equal(clicks,0);assert.equal(result.completed,false);assert.equal(result.uncertain,false);
 }
});

test('a click timeout is uncertain and is never retried, nor are later steps run',async()=>{
 const events=[];
 const result=await uiFlow(async op=>{events.push(op);if(op==='snapshot')return frame([parent,label]);throw Error('transport timeout');},{...args,steps:[...args.steps,...args.steps]});
 assert.deepEqual(events,['snapshot','click']);assert.equal(result.uncertain,true);assert.equal(result.failedStep,0);assert.equal(result.replayed,false);
});

test('deadline and local stop prevent remaining writes',async()=>{
 let clock=0,clicks=0;
 const expired=await uiFlow(async op=>{if(op==='click')clicks++;clock=3000;return frame([parent,label]);},args,{now:()=>clock});
 assert.equal(clicks,0);assert.equal(expired.completed,false);
 const events=[];
 const stopped=await uiFlow(async op=>{events.push(op);if(op==='snapshot')throw Error('Session stopped');return {performed:true};},args);
 assert.deepEqual(events,['snapshot']);assert.equal(stopped.uncertain,false);assert.match(stopped.reason,/Session stopped/);
});

test('separately routed sessions retain the native path without foreground fallback',async()=>{
 const events=[];
 const result=await uiFlow(async op=>{events.push(op);throw Error('Commande inconnue');},{...args,sessionId:'native-session'});
 assert.deepEqual(events,['wait_and_click']);assert.equal(result.uncertain,true);
});
