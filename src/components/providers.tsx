"use client";

import { PrivyProvider, usePrivy, useWallets, useSignMessage, useModalStatus } from "@privy-io/react-auth";
import { createContext, useContext } from "react";
import { abstract, abstractTestnet } from "viem/chains";
import type { CommerceRuntime } from "@/lib/commerce-runtime";
import { CommerceAuthContext } from "./commerce-auth";
import { usePartnerAuthAdapter } from "./partner-auth-adapter";
import { sendSponsoredAbstractTransaction } from "@/lib/abstract-wallet";

const RuntimeContext = createContext<CommerceRuntime | null>(null);
export const useCommerceRuntime = () => useContext(RuntimeContext);
const WalletPromptContext = createContext(false);
export const useWalletPrompt = () => useContext(WalletPromptContext);

function PrivyAdapter({ children }: { children: React.ReactNode }) {
  const auth = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { isOpen: walletPrompt } = useModalStatus();
  const wallet = wallets.find(wallet => wallet.walletClientType === "privy");
  return <WalletPromptContext.Provider value={walletPrompt}><CommerceAuthContext.Provider value={{
    ready: auth.ready, authenticated: auth.authenticated,
    login: auth.login, logout: auth.logout, getAccessToken: auth.getAccessToken,
    wallet,
    sendTransaction: (transaction, options) => sendSponsoredAbstractTransaction(wallet, transaction, options),
    // Keep the signed authorization after the customer's Pay/Confirm action.
    // Only the redundant confirmation popup is hidden; MFA/recovery remains.
    signMessage: (message, options) => signMessage(message, { ...options, uiOptions: { showWalletUIs: false } })
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
          supportedChains: [abstract, abstractTestnet],
          defaultChain: runtime.chainId === 11124 ? abstractTestnet : abstract,
        }}
      >
        <PrivyAdapter>{children}</PrivyAdapter>
      </PrivyProvider>
    </RuntimeContext.Provider>
  );
}
