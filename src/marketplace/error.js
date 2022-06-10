export class MarketplaceError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "MarketplaceError";
  }
}
