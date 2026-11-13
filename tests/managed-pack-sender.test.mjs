import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { commercePrivyOwner, createCommercePackSender, createCommerceGiftSender } from '../src/lib/commerce-base-pack-wallet.mjs';
const signer=privateKeyToAccount('0x'+'8'.repeat(64));
const gacha='0x'+'2'.repeat(40),txHash='0x'+'a'.repeat(64);
test('the Privy adapter signs the original wallet’s messages and exact EIP-7702 authorization',async()=>{
  const owner=commercePrivyOwner({...signer,signMessage:({message})=>signer.signMessage({message:{raw:message}})},
    async({contractAddress,chainId,nonce},{address})=>{
      assert.equal(address,signer.address);return signer.signAuthorization({address:contractAddress,chainId,nonce});
    });
  const signature=await owner.signMessage({message:{raw:'0x1234'}});
  assert.equal(await recoverMessageAddress({message:{raw:'0x1234'},signature}),signer.address);
  const message='DYLI Base wallet registration';
  assert.equal(await recoverMessageAddress({message,signature:await owner.signMessage({message})}),signer.address);
  const {ModularAccountV2VersionRegistry}=await import('@alchemy/smart-accounts');
  const delegation=ModularAccountV2VersionRegistry.SemiModularAccount7702['v1.1.0'].delegationAddress;
  const authorization=await owner.signAuthorization({address:delegation,chainId:8453,nonce:0});
  assert.equal(authorization.nonce,0);
  await assert.rejects(owner.signAuthorization({address:gacha,chainId:8453,nonce:0}));
});
function fixture({fail=false,recovery={state:'submitted'},kind='pack',existingIntent=false}={}){
  const values=new Map(),requests=[],storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const play={id:'play',transaction:{chain_id:8453,from:signer.address,to:gacha,data:'0x1234',value:'0',phase:'buy'}};
  if(kind==='gift')delete play.transaction.phase;
  const sender=(kind==='gift'?createCommerceGiftSender:createCommercePackSender)({owner:{...signer,signAuthorization:async()=>{}},externalCustomerId:'clerk-a',storage,
    request:async(action,body)=>{
      requests.push({action,body});
      if(action==='intent')return{id:'intent-id',token:'scoped-intent',...(existingIntent?{recovery_required:true}:{})};
      if(action==='recovery')return recovery;
      if(action==='rpc')return{result:'0x'+'b'.repeat(64)};
      throw Error('Unexpected action');
    },
    makeSmartAccount:async()=>({address:signer.address,encodeCalls:async()=> '0x5678',isDeployed:async()=>true}),
    makePaymaster:()=>({}),
    makeBundler:options=>({
      sendUserOperation:async()=>{
        assert.equal(values.size,1,'recovery state is saved before signing/submission');
        if(fail)throw Error('Lost response');
        return options.transport({}).request({method:'eth_sendUserOperation',params:[]});
      },
      waitForUserOperationReceipt:async()=>({success:true,receipt:{transactionHash:txHash}}),
    })});
  return {sender,play,values,requests};
}
test('the example keeps the wallet address, scopes every request and returns a transaction hash',async()=>{
  const f=fixture();assert.equal(await f.sender.send(f.play),txHash);assert.equal(f.values.size,0);
  for(const request of f.requests){assert.equal(request.body.external_customer_id,'clerk-a');assert.equal(request.body.box_play_id,'play');}
});

test('the sender batches a returned first-time approval with the priced buy in one sponsored submission',async()=>{
  const f=fixture();
  f.play.approval_transaction={chain_id:8453,from:signer.address,to:'0x'+'3'.repeat(40),data:'0x095ea7b3',value:'0'};
  assert.equal(await f.sender.send(f.play),txHash);
  const intent=f.requests.find(r=>r.action==='intent');
  assert.equal(intent.body.calls.length,2);assert.equal(intent.body.calls[0].to,f.play.approval_transaction.to);
  assert.equal(intent.body.calls[1].data,f.play.transaction.data);
  assert.equal(f.requests.filter(r=>r.action==='rpc'&&r.body.method==='eth_sendUserOperation').length,1);
});
test('a claim-first sale batches its optional collection approval before the exact helper transaction',async()=>{
  const f=fixture();
  f.play.claim_before_reveal=true;f.play.transaction.phase='finalize';
  f.play.approval_transaction={chain_id:8453,from:signer.address,to:'0x'+'3'.repeat(40),data:'0xa22cb465',value:'0'};
  assert.equal(await f.sender.send(f.play),txHash);
  const intent=f.requests.find(r=>r.action==='intent');
  assert.deepEqual(intent.body.calls.map(c=>c.data),['0xa22cb465',f.play.transaction.data]);
  for(const mutate of [f=>{delete f.play.claim_before_reveal},f=>{f.play.approval_transaction.chain_id=1},
      f=>{f.play.approval_transaction.from=gacha},f=>{f.play.approval_transaction.value='1'}]){
    const blocked=fixture();blocked.play.claim_before_reveal=true;blocked.play.transaction.phase='finalize';
    blocked.play.approval_transaction={...f.play.approval_transaction};mutate(blocked);
    await assert.rejects(blocked.sender.send(blocked.play),/returned approval/);
    assert.equal(blocked.requests.length,0);
  }
});
test('an ambiguous send keeps the saved intent and retries recovery without starting another opening',async()=>{
  const f=fixture({fail:true});await assert.rejects(f.sender.send(f.play),e=>e.code==='PACK_TRANSACTION_PENDING');
  assert.equal(f.values.size,1);
  await assert.rejects(f.sender.send(f.play,{resubmit:true}),e=>e.code==='PACK_TRANSACTION_PENDING');
  assert.equal(f.requests.filter(r=>r.action==='intent').length,1);
  assert.equal(f.requests.at(-1).body.resubmit,true);
});
test('confirmed recovery returns the original hash and reverted recovery remains a terminal failure',async()=>{
  const confirmed=fixture({fail:true,recovery:{state:'confirmed',transactionHash:txHash}});
  assert.equal(await confirmed.sender.send(confirmed.play),txHash);assert.equal(confirmed.values.size,0);
  const reverted=fixture({fail:true,recovery:{state:'reverted'}});
  await assert.rejects(reverted.sender.send(reverted.play),e=>e.code==='PACK_TRANSACTION_REVERTED');
  assert.equal(reverted.values.size,0);
});

test('the gift sender scopes one exact transfer and recovers a server-saved operation before signing again',async()=>{
  const fresh=fixture({kind:'gift'});assert.equal(await fresh.sender.send(fresh.play),txHash);
  for(const request of fresh.requests){assert.equal(request.body.item_gift_id,'play');assert.equal(request.body.box_play_id,undefined);}
  assert.equal(fresh.requests[0].body.calls.length,1);
  const recovered=fixture({kind:'gift',existingIntent:true,recovery:{state:'confirmed',transactionHash:txHash}});
  assert.equal(await recovered.sender.send(recovered.play),txHash);
  assert.equal(recovered.requests.filter(request=>request.action==='rpc').length,0,'recovering a prior gift never signs or sends another operation');
  const pending=fixture({kind:'gift',existingIntent:true});
  await assert.rejects(pending.sender.send(pending.play),error=>error.code==='GIFT_TRANSACTION_PENDING');
  await assert.rejects(pending.sender.send(pending.play),error=>error.code==='GIFT_TRANSACTION_PENDING');
  assert.equal(pending.requests.filter(request=>request.action==='intent').length,1);
  assert.equal(pending.requests.filter(request=>request.action==='rpc').length,0);
});
