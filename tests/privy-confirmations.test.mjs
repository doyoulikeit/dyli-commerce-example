import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('embedded wallet still signs authorization, without a second confirmation popup', async () => {
  const calls = [];
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const source = ts.transpileModule(readFileSync(new URL('../src/components/providers.tsx', import.meta.url), 'utf8') + '\nexport { PrivyAdapter };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => {
    if (name === 'react') return { createContext: value => ({ Provider: 'provider', value }) };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@privy-io/react-auth') return {
      usePrivy: () => ({ ready: true, authenticated: true }), useWallets: () => ({ wallets: [] }),
      useModalStatus: () => ({ isOpen: false }),
      useSignMessage: () => ({ signMessage: async (...args) => { calls.push(args); return { signature: 'real-signature-result' }; } }),
    };
    if (name === './commerce-auth') return { CommerceAuthContext: { Provider: 'auth' } };
    return {};
  } });
  const tree = exports.PrivyAdapter({ children: null });
  const auth = tree.props.children.props.value;
  const result = await auth.signMessage({ message: 'DYLI authorization' }, { address: 'wallet' });
  assert.equal(result.signature, 'real-signature-result');
  assert.equal(calls[0][0].message, 'DYLI authorization');
  assert.equal(calls[0][1].address, 'wallet');
  assert.equal(calls[0][1].uiOptions.showWalletUIs, false);
});
