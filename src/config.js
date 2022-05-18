import { ethers } from "ethers";

/**
 * @class
 * Config class. It's a singleton class, an instance is inited as `netpute.config` when loading.
 */
class Config {
  _provider = null;
  _deployer = null;

  /**
   * Init config for other components. Re-init is possible when network was changed
   * @param {Object} Obj
   * @param {string} Obj.rpc Read-only RPC url, websocket (wss) or https is acceptable
   * @param {string} Obj.deployerAddress Address of deployer
   */
  init({ rpc, deployerAddress }) {
    if (rpc.startsWith("wss://"))
      this._provider = new ethers.providers.WebSocketProvider(rpc);
    else if (rpc.startsWith("https://"))
      this._provider = new ethers.providers.JsonRpcProvider(rpc);
    else throw new Error("Unknown protocol");

    this._deployer = deployerAddress;
  }

  /**
   * Ethers.js provider object, cannot be used to send transaction
   */
  get provider() {
    return this._provider;
  }

  /**
   * Deployer address
   */
  get deployerAddress() {
    return this._deployer;
  }
}

export const config = new Config();
