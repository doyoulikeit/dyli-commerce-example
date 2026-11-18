import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
 const exports={},attempted={current:''};let effect;
 const source=ts.transpileModule(readFileSync(new URL('../src/components/use-wallet-registration.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(source,{exports,require:()=>({useRef:()=>attempted,useEffect:callback=>{effect=callback;}})});
 return props=>{exports.useWalletRegistration(props);effect();};
}

test('only a ready signed-in embedded wallet is registered, once per account, with no retry loop',()=>{
 const render=fixture(),calls=[];
 const props={ready:true,authenticated:true,address:'0xabc',needsRegistration:true,busy:'',chainId:8453,embedded:true,register:async()=>{calls.push('register');return false;}};
 render({...props,authenticated:false});render({...props,embedded:false});render({...props,needsRegistration:false});assert.equal(calls.length,0);
 render(props);render(props);render({...props,register:async()=>{calls.push('wrong-repeat');return false;}});assert.deepEqual(calls,['register']);
 render({...props,address:'0xdef'});assert.equal(calls.length,2);
 render({...props,authenticated:false});render({...props,busy:'Connecting…'});assert.equal(calls.length,2);render(props);assert.equal(calls.length,3);
});
