export class CollectionError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "WalletError";
  }
}
