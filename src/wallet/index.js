import { WalletError } from "./error";
import { ethers } from "ethers";

/**
 * Wallet
 * @namespace Wallet
 * @example
 * netpute.wallet.connect().then(console.log)
 */
export const wallet = {
  /**
   * @memberof Wallet
   * @var {string | null} address - Address of connected wallet, null when not connected
   */
  address: null,

  /**
   * Ask user to connect its wallet
   * @memberof Wallet
   * @returns {string} Address of connected wallet
   */
  async connect() {
    if (!window.ethereum) {
      throw new WalletError("No wallet detected", 404);
    }
    this._provider = new ethers.providers.Web3Provider(window.ethereum);

    try {
      await this._provider.send("eth_requestAccounts", []);
    } catch (err) {
      if (err.code === 4001)
        throw new WalletError("User denied to enable wallet", 401);
      else throw new WalletError("Uknown error", 400);
    }
    const signer = this._provider.getSigner();
    this.address = await signer.getAddress();
    return this.address;
  },

  /**
   * Clear provider (note: we disconnects from wallet but can't promise wallet disconnect from us)
   * @memberof Wallet
   */
  async disconnect() {
    this._provider = null;
    this.address = null;
  },

  /**
   * Get balance of an address
   * @memberof Wallet
   * @param {string} address - Target wallet address
   * @param {boolean} [skipCheck=false] - Skip checksum of address
   * @returns {Promise<external:BigNumber>} - Balance of target wallet address
   */
  async balanceOf(address, skipCheck = true) {
    if (!this._provider) {
      throw new WalletError("Wallet not connected", 404);
    }
    if (skipCheck) address = address.toLowerCase();
    return this._provider.getBalance(address).catch((err) => {
      if (err.code === "INVALID_ARGUMENT") {
        throw new WalletError("Address invalid", 401);
      }
      throw new WalletError("Unknown error", 500);
    });
  },

  /**
   * Ask user to switch to a chain
   * @memberof Wallet
   * @param {number | string} chainId - Target chain id
   * @param {NetworkConfig} [chainConfig] - Chain config is used to ask user to add when network doesn't exist
   */
  async switchNetwork(chainId, chainConfig) {
    if (!this._provider) {
      throw new WalletError("Wallet not connected", 404);
    }
    switch (typeof chainId) {
      case "number":
        if (Number.isInteger(chainId) && chainId > 0)
          chainId = "0x" + chainId.toString(16);
        else throw new WalletError("Bad chain id", 400);
        break;
      case "string": {
        const matched = chainId.match(/0x[1-9a-fA-F][0-9a-fA-F]*/);
        if (!matched || matched[0] !== chainId)
          throw new WalletError("Bad chain id", 400);
        break;
      }
      default:
        throw new WalletError("Bad chain id", 400);
    }
    try {
      await this._provider.send("wallet_switchEthereumChain", [{ chainId }]);
      return;
    } catch (switchError) {
      // This error code indicates that the chain has not been added to MetaMask.
      if (switchError.code === 4902) {
        if (!chainConfig) throw new WalletError("Network not added", 404);

        try {
          await this._provider.send("wallet_addEthereumChain", [chainConfig]);
          await this._provider.send("wallet_switchEthereumChain", [
            { chainId },
          ]);
          return;
        } catch (addError) {
          throw new WalletError("User refused to add the network", 401);
        }
      } else if (switchError.code === 4001) {
        throw new WalletError("User refused to switch to the network", 401);
      }
      throw new WalletError("Unknown error", 500);
    }
  },
  addEventListener: null,
  removeEventListener: null,
  _provider: null,
  _listeners: [],
};

if (!window.ethereum) {
  console.warn("No ethereum object found, user may haven't installed wallet.");
}

/**
 * Network Config according to EIP-3085
 * @typedef {Object} NetworkConfig
 * @property {string} chainId - Chain ID
 * @property {string[]} [blockExplorerUrls] - Blockchain explorer url (e.g. Etherscan)
 * @property {string} [chainName] - Chain Name
 * @property {NetworkConfigNativeCurrency} [nativeCurrency] - Chain Name
 * @property {string[]} [iconUrls] - Icon urls
 * @property {string[]} [rpcUrls] - Chain RPC urls
 */

/**
 * Currency Config to a network config
 * @typedef {Object} NetworkConfigNativeCurrency
 * @property {string} name - Chain currency name
 * @property {string} symbol - Chain currency symbol
 * @property {number} decimals - Chain currency decimals
 */

/**
 * @external BigNumber
 * @see https://docs.ethers.io/v5/api/utils/bignumber/
 */
