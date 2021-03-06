import { Contract, ethers, BigNumber } from "ethers";
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
  _weth = null;

  /**
   * Sign a buy order for a token under a collection
   * @param {Marketplace.BuyOrder}
   * @return {Marketplace.SignedBuyOrder}
   */
  async signBuyOrder(obj) {
    const { validBefore, tokenId, amount, maxPayment, nonce } = obj;
    const collection =
      typeof obj.collection === 'string' ? obj.collection : (obj.collection && obj.collection.address);

    if (
      !collection ||
      !validBefore ||
      !tokenId ||
      !amount ||
      !maxPayment ||
      !nonce
    )
      throw new MarketplaceError("Invalid Input", 401);
    await this._initMarketplace();

    const [wethBalance, ethBalance] = await Promise.all([
      this._weth.balanceOf(wallet.address),
      config.provider.getBalance(wallet.address),
    ]);
    if (!obj.skipCheck && wethBalance.add(ethBalance).lt(maxPayment)) {
      throw new MarketplaceError("Insufficient balance", 402);
    }
    if (wethBalance.lt(maxPayment)) {
      try {
        const tx = await this._weth.deposit({
          value: maxPayment.sub(wethBalance),
        });
        await tx.wait();
      } catch (err) {
        this._errorHandler(err);
      }
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
      collection,
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
   * @param {Marketplace.SellOrder}
   * @return {Marketplace.SignedSellOrder}
   */
  async signSellOrder(obj) {
    const { validBefore, tokenId, amount, minReceive, nonce } = obj;
    const collection = typeof obj.collection === 'string' ? new Collection(obj.collection) : obj.collection;
    await collection.inited;

    if (!collection || !validBefore || !tokenId || !amount || !minReceive || !nonce)
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

  /**
   * Execute an order from any one
   * @param {Object} obj - Order match info
   * @param {Marketplace.BuyOrder | Marketplace.SignedBuyOrder} [obj.buyOrder] - The object obtained from signBuyOrder function, implicitly use the sell order when not provide
   * @param {Marketplace.SellOrder | Marketplace.SignedSellOrder} [obj.sellOrder] - The object obtained from signSellOrder function, implicitly use the buy order when not provide
   * @param {boolean} obj.isERC721 - If the trading NFT using ERC-721
   * @param {boolean} obj.isWETH - If the match using WETH (should always be true when the match is executed by seller)
   * @param {string[]} obj.receivers - Receivers' addresses of the match, including platform and royalty
   * @param {Array<string | BigNumber>} obj.shares - The amount of fee for each receiver in the order of receivers
   * @param {string} obj.serverSignature - The match signature from server
   * @return {external:TransactionResponse}
   */
  async executeOrder(props) {
    const {
      buyOrder,
      sellOrder,
      isERC721,
      isWETH,
      receivers,
      shares,
      serverSignature,
    } = props;
    if (!buyOrder && !sellOrder)
      throw new MarketplaceError("Missing order", 401);
    if (!buyOrder) {
      buyOrder = {
        buyer: wallet.address,
        maxPayment: ethers.constants.MaxUint256,
        ...sellOrder,
      };
      delete buyOrder.seller;
      delete buyOrder.minReceive;
      delete buyOrder.signature;
    }
    if (!sellOrder) {
      isWETH = true;
      sellOrder = {
        seller: wallet.address,
        minReceive: ethers.constants.Zero,
        ...buyOrder,
      };
      delete sellOrder.buyer;
      delete sellOrder.maxPayment;
      delete sellOrder.signature;
    }

    const signatures = [
      sellOrder.signature || "0x00",
      buyOrder.signature || "0x00",
      serverSignature,
    ];
    delete buyOrder.signature;
    delete sellOrder.signature;

    const marketplace = new Contract(
      config.marketplaceAddress,
      MarketplaceABI.abi,
      wallet.signer
    );
    try {
      const tx = await marketplace.matchOrder(
        sellOrder,
        buyOrder,
        isERC721,
        isWETH,
        receivers,
        shares,
        signatures,
        {
          value: isWETH
            ? undefined
            : shares.reduce((a, b) =>
                a.add(BigNumber.from(b), BigNumber.from(0))
              ),
        }
      );
      return tx;
    } catch (err) {
      this._errorHandler(err);
    }
  }

  /**
   * Invalid an order on chain to prevent being executed
   * @param {Object} obj - Order match info
   * @param {Marketplace.BuyOrder | Marketplace.SignedBuyOrder} [obj.buyOrder] - The buy order object
   * @param {Marketplace.SellOrder | Marketplace.SignedSellOrder} [obj.sellOrder] - The sell order object
   * @return {external:TransactionResponse}
   */
  async markAsInvalid({ buyOrder, sellOrder }) {
    if (!!buyOrder === !!sellOrder)
      throw new MarketplaceError(
        "Can mark exact one order invalid at the same time",
        401
      );
    const marketplace = new Contract(
      config.marketplaceAddress,
      MarketplaceABI.abi,
      wallet.signer
    );
    const orderHash = buyOrder
      ? await marketplace.getBuyOrderHash(buyOrder)
      : await marketplace.getSellOrderHash(sellOrder);
    try {
      const tx = await marketplace.markAsInvalid(orderHash);
      return tx;
    } catch (err) {
      this._errorHandler(err);
    }
  }

  get domain() {
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

/**
 * BuyOrder object
 * @typedef {Object} BuyOrder
 * @memberof Marketplace
 * @property {string | Collection} collection - Target collection address or instance that constructed with `netpute.Contract`
 * @property {number} tokenId - Target token ID
 * @property {number} validBefore - The time (timstamp in second) the order will expired
 * @property {number} amount - Required but only work for ERC-1155, the amount of tokens
 * @property {string | BigNumber} maxPayment - The maxmium WETH the buyer will pay
 * @property {number} nonce - Nonce
 * @property {boolean} [skipCheck] - Force to sign even if the user doesn't have much money
 */

/**
 * SignedBuyOrder object
 * @typedef {Object} SignedBuyOrder
 * @memberof Marketplace
 * @property {string} buyer - The buyer of the order
 * @property {string} collection - Target collection address
 * @property {number} tokenId - Target token ID
 * @property {number} validBefore - The time the order will expire
 * @property {number} amount - The amount of tokens
 * @property {string | BigNumber} maxPayment - The maxmium WETH the buyer will pay
 * @property {number} nonce - Nonce
 * @property {string} signature - The signature
 */

/**
 * SellOrder object
 * @typedef {Object} SellOrder
 * @memberof Marketplace
 * @property {string | Collection} collection - Target collection address or instance that constructed with `netpute.Contract`
 * @property {number} tokenId - Target token ID
 * @property {number} validBefore - The time (timstamp in second) the order will expired
 * @property {number} amount - Required but only work for ERC-1155, the amount of tokens
 * @property {string | BigNumber} minReceive - The minimum WETH the seller will receive
 * @property {number} nonce - Nonce
 * @property {boolean} [skipCheck] - Force to sign even if the user doesn't have much money
 */

/**
 * SignedBuyOrder object
 * @typedef {Object} SignedSellOrder
 * @memberof Marketplace
 * @property {string} seller - The seller of the order
 * @property {string} collection - Target collection address
 * @property {number} tokenId - Target token ID
 * @property {number} validBefore - The time the order will expire
 * @property {number} amount - The amount of tokens
 * @property {string | BigNumber} minReceive - The minimum WETH the seller will receive
 * @property {number} nonce - Nonce
 * @property {string} signature - The signature
 */

/**
 * @external TransactionResponse 
 * @see https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse
 */