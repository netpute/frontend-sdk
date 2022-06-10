import { Contract, ethers } from "ethers";
import { config } from "../config";
import { wallet } from "../wallet";
import { Collection } from "../collection";
import { MarketplaceError } from "./error";
import { typedMessage } from "./TypedMessage";
import MarketplaceABI from "./abi/Marketplace.json";
import ERC20ABI from "./abi/ERC20.json";

/**
 * @class
 * @classdesc
 * Marketplace class.
 * Before using the class, config is required to be initied
 */
export class Marketplace {
  _marketplace = null;
  _weth = null;

  /**
   * Sign a buy order for a token under a collection
   * @param {Object} obj - Buy order
   * @param {string} [obj.collectionAddress] - Target collection address, at least one of `collectionAddress` and `collection` should be provide
   * @param {Collection} [obj.collection] - Target collection that constructed with `netpute.Contract`, at least one of `collectionAddress` and `collection` should be provide
   * @param {number} obj.tokenId - Target token ID
   * @param {number} obj.validBefore - The time (timstamp in second) the order will expired
   * @param {number} obj.amount - ERC-1155 only, the amount of tokens
   * @param {number | string} obj.price - The maxmium WETH the buyer will pay
   * @param {number} obj.nonce - Nonce
   * @param {boolean} obj.skipCheck - Force to sign even if the user doesn't have much money
   */
  async signBuyOrder(obj) {
    const { validBefore, tokenId, amount, price, nonce } = obj;
    const collectionAddress =
      obj.collectionAddress || (obj.collection && obj.collection.address);

    if (
      !collectionAddress ||
      !validBefore ||
      !tokenId ||
      !amount ||
      !price ||
      !nonce
    )
      throw new MarketplaceError("Invalid Input", 401);
    await this._initMarketplace();

    const maxPayment = ethers.utils.parseUnits(price.toString(), 18);
    const balance = await this._weth.balanceOf(wallet.address);
    if (!obj.skipCheck && balance.lt(maxPayment)) {
      throw new MarketplaceError("Insufficient balance", 402);
    }
    const allowance = await this._weth.allowance(
      wallet.address,
      config.marketplaceAddress
    );
    if (allowance.lt(maxPayment)) {
      try {
        const tx = await this._weth.approve(
          config.marketplaceAddress,
          maxPayment
        );
        await tx.wait();
      } catch (err) {
        this._errorHandler(err);
      }
    }
    const buyOrder = {
      buyer: wallet.address,
      validBefore,
      collection: collectionAddress,
      tokenId,
      amount,
      maxPayment,
      nonce,
    };

    try {
      return {
        ...buyOrder,
        signature: await wallet.signer._signTypedData(
          this.domain,
          { BuyOrder: typedMessage.types.BuyOrder },
          buyOrder
        ),
      };
    } catch (err) {
      this._errorHandler(err);
    }
  }

  /**
   * Sign a sell order for a token under a collection
   * @param {Object} obj - Sell order
   * @param {string} [obj.collectionAddress] - Target collection address, at least one of `collectionAddress` and `collection` should be provide
   * @param {Collection} [obj.collection] - Target collection that constructed with `netpute.Contract`, at least one of `collectionAddress` and `collection` should be provide
   * @param {number} obj.tokenId - Target token ID
   * @param {number} obj.validBefore - The time (timstamp in second) the order will expired
   * @param {number} obj.amount - ERC-1155 only, the amount of tokens
   * @param {number | string} obj.price - The minmium WETH the seller will receive
   * @param {number} obj.nonce - Nonce
   * @param {boolean} obj.skipCheck - Force to sign even if the user doesn't have the token
   */
  async signSellOrder(obj) {
    const { validBefore, tokenId, amount, price, nonce } = obj;
    const collection = obj.collection || new Collection(obj.collectionAddress);

    if (!collection || !validBefore || !tokenId || !amount || !price || !nonce)
      throw new MarketplaceError("Invalid Input", 401);
    await this._initMarketplace();

    if (!obj.skipCheck) {
      if (collection.type === "ERC-721") {
        const owner = await collection.contract.ownerOf(tokenId);
        if (owner !== wallet.address)
          throw new MarketplaceError("Not own this token", 402);
      } else {
        const balance = await collection.contract.balanceOf(
          wallet.address,
          tokenId
        );
        if (balance.lt(amount))
          throw new MarketplaceError("Insufficient balance", 402);
      }
    }
    const approved = await collection.contract.isApprovedForAll(
      wallet.address,
      config.marketplaceAddress
    );
    if (!approved) {
      try {
        const tx = await collection.contract
          .connect(wallet.signer)
          .setApprovalForAll(config.marketplaceAddress, true);
        await tx.wait();
      } catch (err) {
        this._errorHandler(err);
      }
    }
    const minReceive = ethers.utils.parseUnits(price.toString(), 18);
    const sellOrder = {
      seller: wallet.address,
      validBefore,
      collection: collection.address,
      tokenId,
      amount,
      minReceive,
      nonce,
    };

    try {
      return {
        ...sellOrder,
        signature: await wallet.signer._signTypedData(
          this.domain,
          { SellOrder: typedMessage.types.SellOrder },
          sellOrder
        ),
      };
    } catch (err) {
      this._errorHandler(err);
    }
  }

  async executeOrder({
    buyOrder,
    sellOrder,
    isERC721,
    isWETH,
    receivers,
    shares,
    serverSignature,
  }) {
  }

  async markInvalided(hash) {}

  get signDomain() {
    return {
      ...typedMessage.domain,
      chainId: wallet.network,
      verifyingContract: config.marketplaceAddress,
    };
  }

  _check() {
    if (!config.marketplaceAddress)
      throw new MarketplaceError("Marketplace address not set", 400);
    if (!config.provider) throw new MarketplaceError("No provider inited", 400);
    if (!wallet.signer) throw new MarketplaceError("Signer not found", 404);
  }

  async _initMarketplace() {
    if (this._marketplace) return;
    this._check();
    this._marketplace = new Contract(
      config.marketplaceAddress,
      MarketplaceABI.abi,
      wallet.signer
    );
    this._weth = new Contract(
      await this._marketplace.WETH(),
      ERC20ABI.abi,
      wallet.signer
    );
  }

  _errorHandler(err) {
    if (err.code === "INVALID_ARGUMENT")
      throw new MarketplaceError("Input invalid", 400);
    else if (err.code === "UNPREDICTABLE_GAS_LIMIT") {
      if (err.error && err.error.message) {
        throw new MarketplaceError(err.error.message, 400);
      } else {
        throw new MarketplaceError(err.error.message, 500);
      }
    } else if (err.code === 4001) {
      // user denied transaction
      throw new MarketplaceError(err.message, 400);
    } else {
      throw new MarketplaceError(err.message, 501);
    }
  }
}

export const marketplace = new Marketplace();
