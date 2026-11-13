import { decodeEventLog, decodeFunctionData, erc20Abi, toEventSelector } from 'viem';
import { entryPoint07Abi, entryPoint07Address } from 'viem/account-abstraction';
import { decodeCallsMAv2 } from '@alchemy/smart-accounts';

const lower = value => String(value || '').toLowerCase();
const operationTopic = toEventSelector('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)');
const beforeTopic = toEventSelector('BeforeExecution()');
const fail = () => { throw Error('This receipt does not prove a USDC transfer from your wallet.'); };

// A bundler is the outer sender. Prove this wallet's operation and isolate its
// logs before applying the same transfer checks used for an ordinary receipt.
export function sponsoredTransferReceipt({ transaction, receipt, wallet, token }) {
  if (lower(transaction.to) !== lower(entryPoint07Address)) return { transaction, receipt };
  if (lower(receipt.to) !== lower(entryPoint07Address) || receipt.status !== 'success') fail();
  const execution = decodeFunctionData({ abi: entryPoint07Abi, data: transaction.input });
  const operations = execution.functionName === 'handleOps' ? execution.args[0]
    : execution.functionName === 'handleAggregatedOps' ? execution.args[0].flatMap(group => group.userOps) : [];
  const own = operations.filter(op => lower(op.sender) === lower(wallet));
  if (own.length !== 1) fail();
  const calls = decodeCallsMAv2(own[0].callData, wallet);
  if (calls.length !== 1 || lower(calls[0].to) !== lower(token) || BigInt(calls[0].value || 0) !== 0n
    || decodeFunctionData({ abi: erc20Abi, data: calls[0].data }).functionName !== 'transfer') fail();
  let begin = -1, proof;
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    if (lower(log.address) !== lower(entryPoint07Address)) continue;
    if (lower(log.topics?.[0]) === lower(beforeTopic)) { begin = i; continue; }
    if (lower(log.topics?.[0]) !== lower(operationTopic)) continue;
    const event = decodeEventLog({ abi: entryPoint07Abi, data: log.data, topics: log.topics });
    if (lower(event.args.sender) === lower(wallet) && String(event.args.nonce) === String(own[0].nonce)) {
      if (begin < 0 || proof) fail();
      proof = { logs: receipt.logs.slice(begin + 1, i), success: event.args.success };
    }
    begin = i;
  }
  if (!proof) fail();
  return { transaction: { ...transaction, from: wallet, to: token, input: calls[0].data },
    receipt: { ...receipt, logs: proof.logs, status: proof.success ? 'success' : 'reverted' } };
}
