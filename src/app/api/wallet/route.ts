import { decodeFunctionData, erc20Abi, formatUnits, parseEventLogs, TransactionReceiptNotFoundError } from "viem";
import { apiErrorResponse } from "@/lib/dyli";
import { AuthError, authErrorResponse } from "@/lib/privy-server";
import { requireLiveContext } from "@/lib/live-server";
import { readWalletBalance, walletReadContext } from "@/lib/wallet-server";
import type { WalletSnapshot } from "@/lib/wallet-transfer";

// Read-only: deposits are direct USDC transfers and withdrawals are signed by
// the customer's own wallet. This route cannot move money or accept a balance.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { identity, readiness } = await requireLiveContext(request, url.searchParams.get("wallet") || undefined);
    const hash = url.searchParams.get("hash");
    if (hash !== null && !/^0x[a-f\d]{64}$/i.test(hash)) throw new AuthError(400, "Enter a valid transfer reference.");
    const context = walletReadContext(readiness);
    const snapshot: WalletSnapshot = { wallet: identity.walletAddress.toLowerCase(), balance: await readWalletBalance(context, identity.walletAddress as `0x${string}`) };
    if (hash) {
      const typedHash = hash as `0x${string}`;
      try {
        const receipt = await context.client.getTransactionReceipt({ hash: typedHash });
        const transaction = await context.client.getTransaction({ hash: typedHash });
        if (transaction.from.toLowerCase() !== snapshot.wallet || transaction.to?.toLowerCase() !== context.token.toLowerCase())
          throw new AuthError(400, "This is not a USDC transfer from your wallet.");
        const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.input });
        if (decoded.functionName !== "transfer") throw new AuthError(400, "This is not a USDC transfer.");
        const [recipient, units] = decoded.args;
        const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs });
        if (receipt.status === "success" && !transfers.some(log => log.address.toLowerCase() === context.token.toLowerCase() &&
            log.args.from.toLowerCase() === snapshot.wallet && log.args.to.toLowerCase() === recipient.toLowerCase() && log.args.value === units))
          throw new AuthError(400, "The USDC transfer has not been verified.");
        const block = await context.client.getBlock({ blockNumber: receipt.blockNumber });
        snapshot.transfer = { hash: typedHash, status: receipt.status === "success" ? "confirmed" : "failed", recipient,
          amount: formatUnits(units, 6), timestamp: Number(block.timestamp) };
      } catch (error) {
        if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
        snapshot.transfer = { hash: typedHash, status: "pending" };
      }
    }
    return Response.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error) || apiErrorResponse(error); }
}
