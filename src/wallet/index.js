import { WalletError } from "./error";
import { ethers } from "ethers";

/**
 * @class
 * Wallet class. It's a singleton class, an instance is inited as `netpute.wallet` when loading.
 */
class Wallet extends EventTarget {
  _address = null;
  _network = null;
  _signer = null;
  static _events = ["disconnected", "walletchanged", "networkchanged"];

  constructor() {
    super();
    if (!window.ethereum) {
      console.warn(
        "No ethereum object found, user may haven't installed wallet."
      );
    }
  }

  /**
   * Address of connected wallet, null when not connected
   */
  get address() {
    return this._address;
  }

  /**
   * Network ID of using network, null when no wallet
   */
  get network() {
    return this._network;
  }

  /**
   * Ether.js signer object, null when no wallet
   */
  get signer() {
    return this._signer;
  }

  /**
   * Ask user to connect its wallet
   * @returns {string} Address of connected wallet
   */
  async connect() {
    if (!window.ethereum) {
      throw new WalletError("No wallet detected", 404);
    }
    this._provider = new ethers.providers.Web3Provider(window.ethereum, "any");

    try {
      await this._provider.send("eth_requestAccounts", []);
    } catch (err) {
      if (err.code === 4001)
        throw new WalletError("User denied to enable wallet", 401);
      else throw new WalletError("Uknown error", 400);
    }
    this._signer = this._provider.getSigner();
    this._address = await this._signer.getAddress();
    this._network = (await this._provider.getNetwork()).chainId;
    this._eventTarget = new EventTarget();

    this._provider.on("network", (newNetwork, oldNetwork) => {
      if (newNetwork.chainId !== oldNetwork.chainId) {
        this._eventTarget.dispatchEvent(new Event("networkchanged"));
        this._network = newNetwork.chainId;
      }
    });
    this._provider.provider.on("accountsChanged", (accs) => {
      if (accs.length) {
        this._eventTarget.dispatchEvent(new Event("walletchanged"));
        this._address = accs[0];
        this._signer = this._provider.getSigner(accs[0]);
      } else {
        this._eventTarget.dispatchEvent(new Event("disconnected"));
      }
    });
    return this.address;
  }

  /**
   * Clear provider (note: we disconnects from wallet but can't promise wallet disconnect from us)
   */
  async disconnect() {
    this._provider = null;
    this._address = null;
    this._network = null;
    this._eventTarget = null;
  }

  /**
   * Get balance of an address
   * @param {string} address - Target wallet address
   * @param {boolean} [skipCheck=false] - Skip checksum of address
   * @returns {external:BigNumber} - Balance of target wallet address
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
  }

  /**
   * Ask user to switch to a chain
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
      if (switchError.code === 4902) {
        // This error code indicates that the chain has not been added to MetaMask.
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
        // This error code indicates that user rejected the switch.
        throw new WalletError("User refused to switch to the network", 401);
      }
      throw new WalletError("Unknown error", 500);
    }
  }

  /**
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  addEventListener(event, listener) {
    if (!this._eventTarget) throw new WalletError("Not inited", 400);
    if (!Wallet._events.includes(event))
      throw new WalletError("No such event", 400);
    return this._eventTarget.addEventListener(event, listener);
  }

  /**
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  removeEventListener(event, listener) {
    if (!this._eventTarget) throw new WalletError("Not inited", 400);
    if (!Wallet._events.includes(event))
      throw new WalletError("No such event", 400);
    return this._eventTarget.removeEventListener(event, listener);
  }

  _provider = null;
  _eventTarget = null;
}

export const wallet = new Wallet();

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

/**
 * Wallet changed
 * @event Wallet#walletchanged
 */

/**
 * Network changed, there might be a delay
 * @event Wallet#networkchanged
 */

/**
 * Wallet disconnected by user (note: disconnect function won't trigger this event)
 * @event Wallet#disconnected
 */
