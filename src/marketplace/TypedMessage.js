export const typedMessage = {
  domain: {
      name: "NetputeMarketplace",
      version: "1",
  },
  types: {
      EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
      ],
      SellOrder: [
          { name: "seller", type: "address" },
          { name: "validBefore", type: "uint256" },
          { name: "collection", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "minReceive", type: "uint256" },
          { name: "nonce", type: "uint256" },
      ],
      BuyOrder: [
          { name: "buyer", type: "address" },
          { name: "validBefore", type: "uint256" },
          { name: "collection", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "maxPayment", type: "uint256" },
          { name: "nonce", type: "uint256" },
      ],
  },
};