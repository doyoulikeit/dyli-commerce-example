"use client";

import { PrivyProvider, usePrivy, useWallets, useSignMessage, useModalStatus, useSign7702Authorization, toViemAccount } from "@privy-io/react-auth";
import { createContext, useContext } from "react";
import { base, baseSepolia } from "viem/chains";
import type { CommerceRuntime } from "@/lib/commerce-runtime";
import { CommerceAuthContext } from "./commerce-auth";
import { usePartnerAuthAdapter } from "./partner-auth-adapter";
import { sendBaseTransaction } from "@/lib/base-wallet";
import { baseRpcUrl } from "@/lib/base-rpc.mjs";
import { createPublicClient, http } from "viem";
import { validateTransaction } from "@/lib/live-commerce";

const RuntimeContext = createContext<CommerceRuntime | null>(null);
export const useCommerceRuntime = () => useContext(RuntimeContext);
const WalletPromptContext = createContext(false);
export const useWalletPrompt = () => useContext(WalletPromptContext);

function PrivyAdapter({ children }: { children: React.ReactNode }) {
  const auth = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { isOpen: walletPrompt } = useModalStatus();
  const { signAuthorization } = useSign7702Authorization();
  const runtime = useCommerceRuntime();
  const wallet = wallets.find(wallet => wallet.walletClientType === "privy");
  return <WalletPromptContext.Provider value={walletPrompt}><CommerceAuthContext.Provider value={{
    ready: auth.ready, authenticated: auth.authenticated,
    login: auth.login, logout: auth.logout, getAccessToken: auth.getAccessToken,
    wallet,
    sendTransaction: async (transaction, options) => {
      if (!options.pack || !runtime?.packSponsorship) {
        const approval = options.pack?.approval_transaction;
        if (approval) {
          validateTransaction(approval, options.address, transaction.chainId);
          try {
            const approved = await sendBaseTransaction(wallet, {
              chainId: transaction.chainId, to: approval.to, data: approval.data, value: BigInt(0),
            }, options);
            const client = createPublicClient({ chain: transaction.chainId === 8453 ? base : baseSepolia,
              transport: http(baseRpcUrl(transaction.chainId, { url: process.env.NEXT_PUBLIC_BASE_RPC_URL, alchemyKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY })) });
            const receipt = await client.waitForTransactionReceipt({ hash: approved.hash });
            if (receipt.status !== "success") throw Error("Wallet approval did not complete");
          } catch {
            // An approval hash is never a pack buy/finalize hash.
            throw Object.assign(Error("Wallet approval is not confirmed. Check wallet activity before continuing."), { broadcastAttempted: false });
          }
        }
        return sendBaseTransaction(wallet, transaction, options);
      }
      if (!wallet || wallet.address.toLowerCase() !== options.address.toLowerCase() || !options.externalCustomerId)
        throw Object.assign(Error("Sign in with the registered customer wallet"), { broadcastAttempted: false });
      const pack = options.pack;
      if (pack.transaction?.to !== transaction.to || pack.transaction.data !== transaction.data ||
          pack.transaction.chain_id !== transaction.chainId || transaction.value !== BigInt(0))
        throw Object.assign(Error("Use the current pack transaction"), { broadcastAttempted: false });
      await wallet.switchChain(transaction.chainId);
      const { commercePrivyOwner, createCommercePackSender } = await import("@/lib/commerce-base-pack-wallet.mjs");
      const owner = commercePrivyOwner(await toViemAccount({ wallet }), signAuthorization, transaction.chainId);
      const sender = createCommercePackSender({
        owner, externalCustomerId: options.externalCustomerId,
        chain: transaction.chainId === 8453 ? base : baseSepolia,
        rpcUrl: baseRpcUrl(transaction.chainId, { url: process.env.NEXT_PUBLIC_BASE_RPC_URL, alchemyKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY }),
        request: async (action: string, body: Record<string, unknown>) => {
          const token = await auth.getAccessToken();
          if (!token) throw Error("Sign in again to continue");
          const response = await fetch("/api/wallet/sponsorship", {
            method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...body, walletAddress: wallet.address }),
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.message || result.error || "Wallet request failed");
          return result;
        },
      });
      return { hash: await sender.send(pack) };
    },
    // Keep the signed authorization after the customer's Pay/Confirm action.
    // Only the redundant confirmation popup is hidden; MFA/recovery remains.
    signMessage: (message, options) => signMessage(message, { ...options, uiOptions: { showWalletUIs: options.uiOptions?.showWalletUIs ?? false } })
  }}>
    {children}
  </CommerceAuthContext.Provider></WalletPromptContext.Provider>;
}
function PartnerAdapter({ children }: { children: React.ReactNode }) {
  const auth = usePartnerAuthAdapter();
  return <CommerceAuthContext.Provider value={auth}>{children}</CommerceAuthContext.Provider>;
}

export function Providers({ runtime, children }: { runtime: CommerceRuntime; children: React.ReactNode }) {
  if (runtime.authMode === "existing") return <RuntimeContext.Provider value={runtime}><PartnerAdapter>{children}</PartnerAdapter></RuntimeContext.Provider>;
  return (
    <RuntimeContext.Provider value={runtime}>
      <PrivyProvider
        appId={runtime.appId}
        clientId={runtime.clientId}
        config={{
          loginMethods: ["email", "sms"],
          appearance: {
            theme: "light",
            accentColor: "#15151a",
            landingHeader: "Your collection, all in one place",
            loginMessage: "Sign in to continue.",
            walletChainType: "ethereum-only",
          },
          embeddedWallets: {
            ethereum: { createOnLogin: "all-users" },
            showWalletUIs: false,
          },
          externalWallets: {
            disableAllExternalWallets: true,
          },
          supportedChains: [base, baseSepolia],
          defaultChain: runtime.chainId === 84532 ? baseSepolia : base,
        }}
      >
        <PrivyAdapter>{children}</PrivyAdapter>
      </PrivyProvider>
    </RuntimeContext.Provider>
  );
}
