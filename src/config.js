import { ethers } from "ethers";

class Config {
  _provider = null;
  _deployer = null;

  init({ rpc, deployerAddress }) {
    if (rpc.startsWith("wss://"))
      this._provider = new ethers.providers.WebSocketProvider(rpc);
    else if (rpc.startsWith("https://"))
      this._provider = new ethers.providers.JsonRpcProvider(rpc);
    else throw new Error("Unknown protocol");

    this._deployer = deployerAddress;
  }

  getProvider() {
    return this._provider;
  }

  getDeployerAddress() {
    return this._deployer;
  }
}

export const config = new Config();
