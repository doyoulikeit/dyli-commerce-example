import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as preferences from '../src/lib/opening-preferences.ts';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/demo-opening.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS},
}).outputText,{exports,require:name=>{assert.equal(name,'./opening-preferences');return preferences;}});
const {restoreDemoOpening}=exports;
const pull = {id:'card',name:'Card',image:'/card.webp',brand:'Pokemon',grade:'9',value:10,buyback:8,tier:'Rare',odds:20};
const run = {id:'opening',item:{id:'1',key:'pack:1',name:'Pack',raw:{}},rewards:[pull,pull],decisions:[null,'claim'],total:2,revealed:true,preferences:{mode:'normal'}};
const activity=[{id:'opening',status:'Opening'}];

test('an unfinished demo resumes the same draws and sparse choices after reload',()=>{
  const restored=restoreDemoOpening(JSON.stringify(run),activity);
  assert.equal(restored.id,run.id);
  assert.equal(JSON.stringify(restored.rewards),JSON.stringify(run.rewards));
  assert.equal(restored.decisions[0],undefined);
  assert.equal(restored.decisions[1],'claim');
  assert.equal(restored.revealed,true);
  assert.equal(restored.preferences.mode,'normal');
});

test('completed and unrelated demo purchases cannot replay a saved opening',()=>{
  assert.equal(restoreDemoOpening(JSON.stringify(run),[{id:run.id,status:'Completed'}]),null);
  assert.equal(restoreDemoOpening(JSON.stringify(run),[{id:'other',status:'Opening'}]),null);
  assert.equal(restoreDemoOpening(null,activity),null);
});

test('corrupt draws are ignored and unavailable buybacks never restore a sell choice',()=>{
  for(const raw of ['{','null',JSON.stringify({...run,total:11}),JSON.stringify({...run,rewards:[]}),JSON.stringify({...run,rewards:[null,null]}),JSON.stringify({...run,rewards:[{...pull,value:-1},pull]})]) {
    assert.equal(restoreDemoOpening(raw,activity),null);
  }
  const restored=restoreDemoOpening(JSON.stringify({...run,rewards:[{...pull,buyback:0},pull],decisions:['sell_back','sell_back','claim']}),activity);
  assert.equal(restored.decisions[0],undefined);
  assert.equal(restored.decisions[1],'sell_back');
  assert.equal(restored.decisions.length,2);
});
