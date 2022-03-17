import { connect, disconnect } from './connect';

export const wallet = {
  address: null,
  connect: null,
  disconnect: null,
  balanceOf: null,
  switchNetwork: null,
  listener: null,
  addEventListener: null,
  removeEventListener: null,
  _provider: null,
};

function initWallet() {
  if (!window.ethereum) {
    console.warn(
      "No ethereum object found, user may haven't installed wallet."
    );
  }

  wallet.connect = connect.bind(this, wallet);
  wallet.disconnect = disconnect.bind(this, wallet);
}

initWallet();
