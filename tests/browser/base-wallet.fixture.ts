// Only the isolated browser harness aliases the real transport to this file.
// It never connects a wallet, broadcasts a transaction or calls a chain RPC.
export async function sendBaseTransaction(_wallet: unknown, transaction: { data: string }) {
  const audit = (window as Window & { fixtureAudit?: unknown[] }).fixtureAudit;
  audit?.push({ type: 'wallet', transaction });
  return { hash: `0x${(transaction.data.startsWith('0xa9059cbb') ? '9' : transaction.data === '0x1234' ? 'b' : 'f').repeat(64)}` };
}
