"use client";

import { PrivyProvider, usePrivy, useWallets, useSignMessage, useModalStatus, useSubscribeToJwtAuthWithFlag } from "@privy-io/react-auth";
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

export type ExistingLogin = {
  ready: boolean;
  authenticated: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  login: () => void;
  logout: () => Promise<void>;
};

function PrivyAdapter({ children, existingLogin }: { children: React.ReactNode; existingLogin?: ExistingLogin }) {
  const auth = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { isOpen: walletPrompt } = useModalStatus();
  const wallet = wallets.find(wallet => wallet.walletClientType === "privy");
  const matchesLogin = !existingLogin || auth.user?.linkedAccounts.some(account =>
    account.type === "custom_auth" && account.customUserId === existingLogin.userId);
  const authenticated = auth.authenticated && (!existingLogin || existingLogin.authenticated) && Boolean(matchesLogin);
  return <WalletPromptContext.Provider value={walletPrompt}><CommerceAuthContext.Provider value={{
    ready: auth.ready && (!existingLogin || existingLogin.ready),
    authenticated,
    login: existingLogin?.login || auth.login,
    logout: async () => { await auth.logout(); await existingLogin?.logout(); },
    getAccessToken: async () => authenticated ? auth.getAccessToken() : null,
    wallet: authenticated ? wallet : undefined,
    sendTransaction: (transaction, options) => {
      if (!authenticated) throw Error("Sign in to connect your wallet");
      return sendSponsoredAbstractTransaction(wallet, transaction, options);
    },
    // Keep the signed authorization after the customer's Pay/Confirm action.
    // Only the redundant confirmation popup is hidden; MFA/recovery remains.
    signMessage: (message, options) => {
      if (!authenticated) throw Error("Sign in to connect your wallet");
      return signMessage(message, { ...options, uiOptions: { showWalletUIs: false } });
    }
  }}>
    {children}
  </CommerceAuthContext.Provider></WalletPromptContext.Provider>;
}
function PartnerAdapter({ children }: { children: React.ReactNode }) {
  const auth = usePartnerAuthAdapter();
  return <CommerceAuthContext.Provider value={auth}>{children}</CommerceAuthContext.Provider>;
}

function ExistingLoginBridge({ existingLogin, children }: { existingLogin: ExistingLogin; children: React.ReactNode }) {
  useSubscribeToJwtAuthWithFlag({
    isAuthenticated: existingLogin.authenticated,
    isLoading: !existingLogin.ready,
    getExternalJwt: async () => existingLogin.ready && existingLogin.authenticated ? (await existingLogin.getToken()) || undefined : undefined,
  });
  return <PrivyAdapter existingLogin={existingLogin}>{children}</PrivyAdapter>;
}

export function Providers({ runtime, children, existingLogin }: { runtime: CommerceRuntime; children: React.ReactNode; existingLogin?: ExistingLogin }) {
  const managed = runtime.authMode === "existing" ? runtime.managedWalletAuth : undefined;
  if (runtime.authMode === "existing" && (!managed || !existingLogin)) return <RuntimeContext.Provider value={runtime}><PartnerAdapter>{children}</PartnerAdapter></RuntimeContext.Provider>;
  return (
    <RuntimeContext.Provider value={runtime}>
      <PrivyProvider
        key={`${managed?.appId || runtime.appId}:${managed?.clientId || runtime.clientId || ''}:${managed ? existingLogin?.userId || 'guest' : ''}`}
        appId={managed?.appId || runtime.appId}
        clientId={managed?.clientId || runtime.clientId || undefined}
        config={{
          loginMethods: managed || runtime.identityScope === "dyli" ? undefined : ["email", "sms"],
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
        {managed && existingLogin
          ? <ExistingLoginBridge existingLogin={existingLogin}>{children}</ExistingLoginBridge>
          : <PrivyAdapter>{children}</PrivyAdapter>}
      </PrivyProvider>
    </RuntimeContext.Provider>
  );
}
