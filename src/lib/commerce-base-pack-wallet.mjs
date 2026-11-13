import { createPublicClient, custom, http, keccak256, toHex } from 'viem';
import { base } from 'viem/chains';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { CoinbaseFailoverError, sendSponsoredUserOperation } from './commerce-sponsored-user-operation.mjs';
import { recoverAuthorizationAddress } from 'viem/utils';
import { toModularAccountV2, ModularAccountV2VersionRegistry } from '@alchemy/smart-accounts';
import { estimateFeesPerGas } from '@alchemy/aa-infra';

// toViemAccount({ wallet }) comes from @privy-io/react-auth. Keep the same
// embedded wallet and useSign7702Authorization hook from its existing Privy app.
export function commercePrivyOwner(owner, signAuthorization, chainId = 8453) {
  const delegation = ModularAccountV2VersionRegistry.SemiModularAccount7702['v1.1.0'].delegationAddress;
  return { ...owner,
    signMessage: ({ message }) => owner.signMessage({ message: typeof message === 'string' ? toHex(message)
      : message?.raw instanceof Uint8Array ? toHex(message.raw) : message.raw }),
    signAuthorization: async authorization => {
      if (authorization.chainId !== chainId || authorization.address.toLowerCase() !== delegation.toLowerCase()
        || !Number.isSafeInteger(authorization.nonce) || authorization.nonce < 0) throw Error('Unexpected wallet authorization.');
      const signed = await signAuthorization({ contractAddress: delegation, chainId, nonce: authorization.nonce },
        { address: owner.address });
      if (signed.chainId !== chainId || signed.nonce !== authorization.nonce
        || signed.address.toLowerCase() !== delegation.toLowerCase()
        || (await recoverAuthorizationAddress({ authorization: signed })).toLowerCase() !== owner.address.toLowerCase())
        throw Error('Wallet authorization did not match the selected wallet.');
      return signed;
    },
  };
}

// request(action, body) calls YOUR authenticated backend. That backend verifies
// its customer session, adds the server Commerce key and the customer's fresh
// Privy access token, and forwards to /api/commerce/v1/wallet/{action}.
export const createCommercePackSender = options => createCommerceSender(options, 'pack');
export const createCommerceGiftSender = options => createCommerceSender(options, 'gift');
export const createCommerceActionSender = options => createCommerceSender(options, 'action');

function createCommerceSender({ owner, externalCustomerId, request, chain = base,
  rpcUrl, storage = globalThis.localStorage, makeSmartAccount = toModularAccountV2,
  makeBundler = createBundlerClient, makePaymaster = createPaymasterClient }, kind) {
  if (![8453, 84532].includes(chain.id) || typeof owner.signAuthorization !== 'function')
    throw Error('Use a Base wallet with EIP-7702 authorization support.');
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  let smartPromise;
  const prefix=kind==='gift'?'GIFT':kind==='action'?'WALLET':'PACK', scopeField=kind==='gift'?'item_gift_id':'box_play_id';
  const pending = id => Object.assign(Error(`This ${kind} transaction is pending. Resume it before sending another.`), { operationId: id, code: `${prefix}_TRANSACTION_PENDING` });
  async function recover(saved, key, resubmit = false) {
    const result = await request('recovery', { external_customer_id: externalCustomerId, ...(saved.scope || { [scopeField]: saved[scopeField] }),
      id: saved.id, intent: saved.token, resubmit });
    if (result.state === 'confirmed' && result.transactionHash) { storage?.removeItem(key); return result.transactionHash; }
    if (result.state === 'reverted') { storage?.removeItem(key); throw Object.assign(Error(`The ${kind} transaction reverted.`), { code: `${prefix}_TRANSACTION_REVERTED` }); }
    if (result.submitted === false && ['prepared', 'expired'].includes(result.state) || result.state === 'expired' && result.safeToRetry) {
      storage?.removeItem(key); return null;
    }
    throw pending(saved.id);
  }
  return {
    async send(boxPlay, { resubmit = false } = {}) {
      const tx = boxPlay?.transaction;
      const actionScope = kind === 'action' ? tx?.sponsorship : null;
      if (kind === 'action' && (!actionScope || Object.keys(actionScope).length !== 1
        || !['community_action_id', 'offer_acceptance_id', 'redemption_id', 'transfer'].includes(Object.keys(actionScope)[0])))
        throw Object.assign(Error('Use the wallet action returned by DYLI.'), { broadcastAttempted: false });
      if (!boxPlay?.id || !tx || tx.chain_id !== chain.id || tx.from.toLowerCase() !== owner.address.toLowerCase()
        || kind==='pack'&&!['buy', 'finalize'].includes(tx.phase) || BigInt(tx.value || 0) !== 0n)
        throw Error('Use the current transaction returned for this customer’s pack play.');
      const key = [`dyli:commerce-${kind}`, chain.id, externalCustomerId, owner.address.toLowerCase(), boxPlay.id, keccak256(tx.data)].join(':');
      const cached = storage?.getItem(key);
      if (cached) {
        const result = await recover(JSON.parse(cached), key, resubmit);
        if (result) return result;
      }
      const smart = await (smartPromise ||= makeSmartAccount({ client, owner, mode: '7702', version: 'v1.1.0' }));
      if (smart.address.toLowerCase() !== owner.address.toLowerCase()) throw Error('The smart account must preserve the existing wallet address.');
      const approval = boxPlay.approval_transaction;
      if (approval && (kind!=='pack' || !(tx.phase === 'buy' || tx.phase === 'finalize' && boxPlay.claim_before_reveal === true) || approval.chain_id !== chain.id
        || approval.from.toLowerCase() !== owner.address.toLowerCase() || BigInt(approval.value || 0) !== 0n))
        throw Error('Use this pack’s returned approval.');
      const calls = [...(approval ? [{ to:approval.to, data:approval.data, value:0n }] : []),
        { to: tx.to, data: tx.data, value: 0n }];
      const scope = { external_customer_id: externalCustomerId, ...(actionScope || { [scopeField]: boxPlay.id }) };
      const saved = { ...await request('intent', { ...scope, calls: calls.map(call => ({ ...call, value: '0' })),
        callData: await smart.encodeCalls(calls) }), ...(actionScope ? { scope: actionScope } : { [scopeField]: boxPlay.id }) };
      // Save before signing. No wallet key, customer access token or signed
      // UserOperation is stored here; DYLI retains the durable recovery record.
      storage?.setItem(key, JSON.stringify(saved));
      if(kind==='gift'&&saved.recovery_required){
        const result=await recover(saved,key,resubmit);
        if(result)return result;
        storage?.setItem(key,JSON.stringify(saved));
      }
      const makeTransport = provider => custom({ request: async ({ method, params }) => {
        const result = await request('rpc', { ...scope, intent: saved.token, method, params, ...(provider ? { provider } : {}) });
        if (provider === 'coinbase' && result.retryWith === 'alchemy')
          throw new CoinbaseFailoverError(result.message || 'Switching gas sponsorship to Alchemy.');
        if (result.error) throw Object.assign(Error(result.error.message || result.error),
          typeof result.error.code === 'number' ? { code: result.error.code } : {});
        return result.result;
      } }, { retryCount: provider === 'coinbase' ? 0 : 3 });
      const transport = makeTransport();
      const bundler = makeBundler({ account: smart, chain, client, transport, pollingInterval: 1500,
        paymaster: makePaymaster({ transport }), userOperation: { estimateFeesPerGas } });
      const coinbaseTransport = saved.sponsorshipProviders?.[0] === 'coinbase' ? makeTransport('coinbase') : null;
      const preferredBundler = coinbaseTransport ? makeBundler({ account: smart, chain, client,
        transport: coinbaseTransport, paymaster: makePaymaster({ transport: coinbaseTransport }) }) : undefined;
      try {
        const hash = await sendSponsoredUserOperation({ bundler, preferredBundler, smart, client, calls });
        const receipt = await bundler.waitForUserOperationReceipt({ hash });
        if (!receipt.success) { storage?.removeItem(key); throw Error('The pack transaction reverted.'); }
        storage?.removeItem(key);
        return receipt.receipt.transactionHash;
      } catch (error) {
        try { const result = await recover(saved, key); if (result) return result; }
        catch (recoveryError) { throw [`${prefix}_TRANSACTION_PENDING`, `${prefix}_TRANSACTION_REVERTED`].includes(recoveryError.code) ? recoveryError : pending(saved.id); }
        throw error;
      }
    },
  };
}
