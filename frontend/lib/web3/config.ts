export const HASHKEY_MAINNET = {
  chainId: "0xB1", // 177 in hex (HashKey Chain Mainnet)
  chainName: "HashKey Chain",
  nativeCurrency: {
    name: "HSK",
    symbol: "HSK",
    decimals: 18,
  },
  rpcUrls: ["https://mainnet.hsk.xyz"],
  blockExplorerUrls: ["https://hashkey.blockscout.com"],
};

export const HASHKEY_TESTNET = {
  chainId: "0x85", // 133 in hex (HashKey Chain Testnet)
  chainName: "HashKey Chain Testnet",
  nativeCurrency: {
    name: "HSK",
    symbol: "HSK",
    decimals: 18,
  },
  rpcUrls: ["https://testnet.hsk.xyz"],
  blockExplorerUrls: ["https://testnet-explorer.hsk.xyz"],
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Prefer env overrides for deploys; fall back to latest testnet deploy
const SECUREFLOW_ADDR =
  process.env.NEXT_PUBLIC_SECUREFLOW_ESCROW ||
  "0x2b8Cb611f8EADcfBbfDa69e4d481A597e7b9dF9a";

export const CONTRACTS = {
  // HashKey Chain (PayFi default)
  SECUREFLOW_ESCROW: SECUREFLOW_ADDR,
  // Official token contracts on HashKey Chain mainnet
  // Source: https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Token-Contracts
  USDT: "0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029",
  USDC: "0x054ed45810DbBAb8B27668922D110669c9D88D0a",
  WETH: "0xefd4bC9afD210517803f293ABABd701CaeeCdfd0",
  WHSK: "0xB210D2120d57b758EE163cFfb43e73728c471Cf1",

  // Back-compat for older UI assumptions
  MOCK_ERC20:
    process.env.NEXT_PUBLIC_MOCK_ERC20 ||
    "0x54290C255108E547877C630cC55b23a2A62a2dAF",
};
