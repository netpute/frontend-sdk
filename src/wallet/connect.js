import { ethers } from "ethers";
import { WalletError } from "./error";

/**
 * Ask user to connect its wallet
 * @memberof Wallet
 * @returns {string} Address of connected wallet
 */
async function connect() {
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
}

/**
 * Clear provider (note: we disconnects from wallet but can't promise wallet disconnect from us)
 * @memberof Wallet
 */
async function disconnect() {
  this._provider = null;
  this.address = null;
}

export { connect, disconnect };
