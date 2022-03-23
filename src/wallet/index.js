import { connect, disconnect } from "./connect";

/**
 * Wallet
 * @namespace Wallet
 * @property {string | null} address - Connected wallet address or null
 */
export const wallet = {
  address: null,
  connect,
  disconnect,
  balanceOf: null,
  switchNetwork: null,
  listener: null,
  addEventListener: null,
  removeEventListener: null,
  _provider: null,
};

if (!window.ethereum) {
  console.warn("No ethereum object found, user may haven't installed wallet.");
}
