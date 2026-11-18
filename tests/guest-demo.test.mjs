import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { readDemoStorage, writeDemoStorage, removeDemoStorage } from '../src/lib/demo-storage.ts';

function pageFixture() {
  const exports = {};let runtimeReads = 0;
  const source = ts.transpileModule(readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, {exports,require(name) {
    if (name === 'react/jsx-runtime') return { jsx: (type,props)=>({type,props}) };
    if (name === '@/components/storefront') return { Storefront: 'demo-storefront' };
    if (name === '@/components/providers') return { Providers: 'live-auth-provider' };
    if (name === '@/components/live-storefront') return { LiveStorefront: 'live-storefront' };
    if (name === '@/lib/storefront-server') return { loadStorefront: async()=>({packs:[],catalog:[]}) };
    if (name === '@/config/storefront') return { storefrontConfig: { demo: { enabled:false } } };
    if (name === '@/lib/runtime-server') return { loadCommerceRuntime: async()=>{runtimeReads++;return {authMode:'dyli_managed'};} };
    return {};
  }});
  return {render: demo=>exports.default({searchParams:Promise.resolve({demo})}),runtimeReads:()=>runtimeReads};
}

test('the guest demo route never initializes live login or a signing provider', async()=>{
  const f=pageFixture();const page=await f.render('1');
  assert.equal(page.type,'demo-storefront');assert.equal(f.runtimeReads(),0);
  const live=await f.render('0');assert.equal(live.type,'live-auth-provider');assert.equal(f.runtimeReads(),1);
});

test('blocked browser storage keeps guest demo state optional without touching live recovery',()=>{
  const blocked=()=>{throw Error('Storage unavailable');};
  assert.equal(readDemoStorage('demo',blocked),null);
  assert.equal(writeDemoStorage('demo','value',blocked),false);
  assert.doesNotThrow(()=>removeDemoStorage('demo',blocked));
  const map=new Map();const memory=()=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
  assert.equal(writeDemoStorage('demo','saved',memory),true);assert.equal(readDemoStorage('demo',memory),'saved');removeDemoStorage('demo',memory);assert.equal(map.size,0);
});
