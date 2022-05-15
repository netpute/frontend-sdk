export class WalletError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "WalletError";
  }
}
