import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};
const jsx=(type,props)=>({type,props});
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/account-gate.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react/jsx-runtime'?{jsx,jsxs:jsx}:{}});
function nodes(tree) {return Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];}
const props={name:'Vaulted',error:'',busy:'',linking:false,onConnect(){},onRetry(){},onSignOut(){}};
test('normal account loading has only the logo, spinner and status',()=>{
  for(const value of [props,{...props,error:'Temporary error',busy:'Connecting…'}]) {
    const tree=exports.AccountGate(value),all=nodes(tree);
    assert.equal(tree.props['aria-busy'],true);
    assert.equal(all.filter(n=>n.type==='h1'||n.type==='button').length,0);
    assert.equal(all.some(n=>n.props?.href),false);
    assert.equal(all.find(n=>n.props?.role==='status').props.children,'Getting your account ready…');
  }
});
test('a real legacy-account error keeps review and exit actions available',()=>{
  const tree=exports.AccountGate({...props,error:'This wallet still has assets on its previous network.'}),all=nodes(tree);
  assert.equal(tree.props['aria-busy'],false);
  assert.equal(all.find(n=>n.type==='h1').props.children,'Your earlier account needs review');
  assert.equal(all.some(n=>n.props?.href==='/?demo=1'),true);
  assert.equal(all.some(n=>n.type==='button'&&n.props.children==='Log out'),true);
});
