// Bundler alias in the isolated browser harness ONLY. Never imported by the app.
import { useSyncExternalStore } from "react";

export const address = `0x${"a".repeat(40)}`;
export const PrivyProvider = ({ children }) => children;
const getAccessToken = async () => "offline-fixture-token";
let authenticated = !new URLSearchParams(location.search).has("signedout");
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const setAuthenticated = value => { authenticated = value; listeners.forEach(listener => listener()); };
const login = () => setAuthenticated(true);
const logout = async () => setAuthenticated(false);
const wallet = {
  address,
  walletClientType: "privy",
  switchChain: async () => {},
};
const sendTransaction = async (tx) => {
  window.fixtureAudit.push({ type: "wallet", tx });
  return {
    hash: `0x${(tx.data.startsWith("0xa9059cbb") ? "9" : tx.data === "0x1234" ? "b" : "f").repeat(64)}`,
  };
};
const signMessage = async () => ({ signature: `0x${"1".repeat(130)}` });
export const usePrivy = () => ({
  ready: true,
  authenticated: useSyncExternalStore(subscribe, () => authenticated, () => false),
  login,
  logout,
  getAccessToken,
});
export const useWallets = () => ({ wallets: [wallet] });
export const useSendTransaction = () => ({ sendTransaction });
export const useSignMessage = () => ({ signMessage });
export const useModalStatus = () => ({ isOpen: false });

export const useSign7702Authorization = () => ({ signAuthorization: async () => { throw Error("No live authorization in fixtures"); } });
export const toViemAccount = async () => { throw Error("No live signer in fixtures"); };
