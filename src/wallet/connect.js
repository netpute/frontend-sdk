import { ethers } from "ethers";
import { WalletError } from "./error";

export async function connect(wallet) {
  if (!window.ethereum) {
    throw new WalletError("No wallet detected", 404);
  }
  wallet._provider = new ethers.providers.Web3Provider(window.ethereum);

  try {
    await wallet._provider.send("eth_requestAccounts", []);
  } catch (err) {
    if (err.code === 4001)
      throw new WalletError("User denied to enable wallet", 401);
    else throw new WalletError("Uknown error", 400);
  }
  const signer = wallet._provider.getSigner();
  wallet.address = await signer.getAddress();
  return wallet.address;
}

export async function disconnect(wallet) {
  wallet._provider = null;
  wallet.address = null;
}
