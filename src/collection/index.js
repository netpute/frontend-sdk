import { CollectionError } from "./error";
import { config } from "../config";
import { ethers } from "ethers";
import ERC721 from "./abi/CollectionERC721.json";
import ERC1155 from "./abi/CollectionERC1155.json";
import Deployer from "./abi/Deployer.json";
import { wallet } from "../wallet";

/**
 * @class
 * @classdesc
 * Collection class.
 * Before using the class, config is required to be initied
 */
export class Collection {
  _contract = null;
  _type = null;

  /**
   *
   * @param {Object} Obj
   * @param {string} Obj.salt Salt for the contract
   * @param {string} Obj.signature Signature from server for the deployment
   * @param {'ERC-721' | 'ERC-1155'} Obj.type Type of the contract
   * @param {string} Obj.name Name of the collection, only used for ERC-721
   * @param {string} Obj.symbol Symbol of the collection, only used for ERC-721
   * @param {number} Obj.royalty Royalty for the collection in basis point (1/10000)
   * @param {string} [Obj.expectedAddress] Expected address to be deploy, reject when different
   * @return {external:TransactionResponse}
   */
  static async deploy({
    salt,
    signature,
    type,
    name,
    symbol,
    royalty,
    expectedAddress,
  }) {
    if (!config.deployerAddress)
      throw new CollectionError("No deployer address", 400);
    if (!wallet.signer) throw new CollectionError("No wallet connected", 404);
    const deployer = new ethers.Contract(
      config.deployerAddress,
      Deployer.abi,
      wallet.signer
    );

    if (type === "ERC-721") {
      try {
        // dry run to get address
        const contractAddress = await deployer.callStatic.createERC721(
          salt,
          name,
          symbol,
          royalty,
          signature,
          { value: ethers.utils.parseEther("0.0006") }
        );
        if (
          expectedAddress &&
          contractAddress.toLowerCase() !== expectedAddress.toLowerCase()
        )
          throw new CollectionError("Not expected address", 403);

        const newInstance = new Collection(contractAddress, "ERC-721");
        newInstance.tx = await deployer.createERC721(
          salt,
          name,
          symbol,
          royalty,
          signature,
          { value: ethers.utils.parseEther("0.0006") }
        );
        newInstance._inited = newInstance.tx.wait();
        return newInstance;
      } catch (err) {
        if (err.code === "INVALID_ARGUMENT")
          throw new CollectionError("Input invalid", 400);
        else if (err.code === "UNPREDICTABLE_GAS_LIMIT") {
          if (err.error && err.error.message) {
            throw new CollectionError(err.error.message, 400);
          } else {
            throw new CollectionError(err.error.message, 500);
          }
        } else if (err.code === 4001) {
          // user denied transaction
          throw new CollectionError(err.message, 400);
        } else {
          throw new CollectionError(err.message, 501);
        }
      }
    } else if (type === "ERC-1155") {
      try {
        // dry run to get address
        const contractAddress = await deployer.callStatic.createERC1155(
          salt,
          royalty,
          signature,
          { value: ethers.utils.parseEther("0.0006") }
        );
        if (
          expectedAddress &&
          contractAddress.toLowerCase() !== expectedAddress.toLowerCase()
        )
          throw new CollectionError("Not expected address", 403);

        const newInstance = new Collection(contractAddress, "ERC-1155");
        newInstance.tx = await deployer.createERC1155(
          salt,
          royalty,
          signature,
          { value: ethers.utils.parseEther("0.0006") }
        );
        newInstance._inited = newInstance.tx.wait();
        return newInstance;
      } catch (err) {
        this._errorHandler(err);
      }
    } else {
      throw new CollectionError("Unknown collection type", 400);
    }
  }

  /**
   * Create collection instance
   * @param {string} address - Target contract address
   * @param {string} [type] - Contract type, empty for auto-detect, manual set to avoid api call
   */
  constructor(address, type) {
    // config.init has to be called before creating a collection instance
    if (!config.provider) throw new CollectionError("No provider inited", 400);
    this._inited = this._init(address, type);
  }

  /**
   * Mint tokens
   * @param {Collection.MintConfigERC721 | Collection.MintConfigERC1155} obj - Mint Object
   * @return {external:TransactionResponse}
   */
  mint(obj) {
    if (this.type === "ERC-721") return this._mintERC721(obj);
    else if (this.type === "ERC-1155") return this._mintERC1155(obj);
    else throw new CollectionError("Contract not inited", 400);
  }

  async _mintERC721({
    start,
    amount,
    expire,
    target,
    feeReceivers,
    fees,
    signature,
  }) {
    if (!wallet.signer) throw new CollectionError("Signer not found", 404);

    const contract = this._contract.connect(wallet.signer);
    try {
      const tx = await contract.mint(
        start,
        amount,
        expire,
        target,
        feeReceivers || [],
        fees || [],
        signature,
        {
          value: fees ? fees.reduce((a, b) => a + parseInt(b), 0) : 0,
        }
      );
      return tx;
    } catch (err) {
      this._errorHandler(err);
    }
  }

  async _mintERC1155({
    id,
    ids,
    amount,
    amounts,
    expire,
    target,
    feeReceivers,
    fees,
    nonce,
    signature,
  }) {
    if (!wallet.signer) throw new CollectionError("Signer not found", 404);
    const [single, batch] = [!!(id && amount), !!(ids && amounts)];
    if (!(single ^ batch))
      throw new CollectionError(
        "ID + Amount and IDs + Amounts cannot be both provided",
        400
      );

    const contract = this._contract.connect(wallet.signer);
    try {
      const tx = single
        ? await contract.mint(
            id,
            amount,
            expire,
            target,
            feeReceivers || [],
            fees || [],
            nonce,
            signature,
            {
              value: fees ? fees.reduce((a, b) => a + parseInt(b), 0) : 0,
            }
          )
        : await contract.mintBatch(
            ids,
            amounts,
            expire,
            target,
            feeReceivers || [],
            fees || [],
            nonce,
            signature,
            {
              value: fees ? fees.reduce((a, b) => a + parseInt(b), 0) : 0,
            }
          );
      return tx;
    } catch (err) {
      this._errorHandler(err);
    }
  }

  async _init(address, type) {
    if (this._inited === true) return;

    const provider = config.provider;
    if (!type) {
      const [isERC721, isERC1155] = await Promise.all([
        provider.call({
          to: address,
          data: "0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000",
        }),
        provider.call({
          to: address,
          data: "0x01ffc9a7d9b67a2600000000000000000000000000000000000000000000000000000000",
        }),
      ]);

      if (isERC721.endsWith("1")) type = "ERC-721";
      else if (isERC1155.endsWith("1")) type = "ERC-1155";
      else throw new CollectionError("Not a NFT contract", 500);
    }

    if (type === "ERC-721") {
      this._contract = new ethers.Contract(
        address,
        ERC721.abi,
        config.provider
      );
    } else if (type === "ERC-1155") {
      this._contract = new ethers.Contract(
        address,
        ERC1155.abi,
        config.provider
      );
    } else {
      throw new CollectionError("Invalid contract type", 500);
    }
    this._type = type;
    this._inited = true;
  }

  _errorHandler(err) {
    if (err.code === "INVALID_ARGUMENT")
      throw new CollectionError("Input invalid", 400);
    else if (err.code === "UNPREDICTABLE_GAS_LIMIT") {
      if (err.error && err.error.message) {
        throw new CollectionError(err.error.message, 400);
      } else {
        throw new CollectionError(err.error.message, 500);
      }
    } else if (err.code === 4001) {
      // user denied transaction
      throw new CollectionError(err.message, 400);
    } else {
      throw new CollectionError(err.message, 501);
    }
  }

  /**
   * Get a promise if is initing, or boolean
   */
  get inited() {
    return this._inited;
  }

  /**
   * Get collection type, ERC-1155 or ERC-721
   */
  get type() {
    return this._type;
  }

  /**
   * Get collection address
   */
  get address() {
    return this._contract.address;
  }

  /**
   * Get ethers.js Contract instance
   */
  get contract() {
    return this._contract;
  }
}

/**
 * Object to mint an ERC721 token
 * @typedef {Object} MintConfigERC721
 * @memberof Collection
 * @property {number} start - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number} amount - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number} expire - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {string} target - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {string[]} [feeReceivers] - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number[]} [fees] - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {string} signature - Contract type, empty for auto-detect, manual set to avoid api call
 */

/**
 * Object to mint ERC1155 tokens
 * @typedef {Object} MintConfigERC1155
 * @memberof Collection
 * @property {number} id - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number} ids - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number} amount - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number} amounts - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number} expire - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {string} target - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {string[]} [feeReceivers] - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number[]} [fees] - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {number} nonce - Contract type, empty for auto-detect, manual set to avoid api call
 * @property {string} signature - Contract type, empty for auto-detect, manual set to avoid api call
 */

/**
 * @external TransactionResponse 
 * @see https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse
 */