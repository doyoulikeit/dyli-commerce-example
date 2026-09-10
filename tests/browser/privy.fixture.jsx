// Bundler alias in the isolated browser harness ONLY. Never imported by the app.
export const address = `0x${"a".repeat(40)}`;
export const PrivyProvider = ({ children }) => children;
const getAccessToken = async () => "offline-fixture-token";
const login = () => {};
const logout = async () => {};
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
  authenticated: true,
  login,
  logout,
  getAccessToken,
});
export const useWallets = () => ({ wallets: [wallet] });
export const useSendTransaction = () => ({ sendTransaction });
export const useSignMessage = () => ({ signMessage });
export const useModalStatus = () => ({ isOpen: false });
