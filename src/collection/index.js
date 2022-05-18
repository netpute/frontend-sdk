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
   */
  static async deploy({ salt, signature, type, name, symbol, royalty }) {
    if (!config.deployerAddress)
      throw new CollectionError("No deployer address", 500);
    if (!wallet.signer) throw new CollectionError("No wallet connected", 401);
    const deployer = new ethers.Contract(config.deployerAddress, Deployer, wallet.signer);

    if (type === "ERC-721") {
    } else if (type === "ERC-1155") {
    } else {
      throw new CollectionError("Unknown collection type", 500);
    }
  }

  /**
   * Create collection instance
   * @param {string} address - Target contract address
   * @param {string} [type] - Contract type, empty for auto-detect, manual set to avoid api call
   */
  constructor(address, type) {
    if (!config.provider) throw new Error("No provider inited");
    this._inited = this._init(address, type);
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
}
