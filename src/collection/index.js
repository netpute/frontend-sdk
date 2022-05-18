import { CollectionError } from "./error";
import { config } from "../config";
import { Contract, ethers } from "ethers";
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

  /**
   * Get collection address
   */
  get address() {
    return this._contract.address;
  }
}
