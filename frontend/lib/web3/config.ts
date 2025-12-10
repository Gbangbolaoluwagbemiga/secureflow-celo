export const CELO_MAINNET = {
  chainId: "0xA4EC", // 42220 in hex (Celo Mainnet)
  chainName: "Celo",
  nativeCurrency: {
    name: "CELO",
    symbol: "CELO",
    decimals: 18,
  },
  rpcUrls: [
    "https://forno.celo.org",
    "https://rpc.ankr.com/celo",
    "https://1rpc.io/celo",
    "https://celo.publicnode.com",
  ],
  blockExplorerUrls: ["https://celoscan.io"],
};

export const CELO_TESTNET = {
  chainId: "0xAEF3", // 44787 in hex (Celo Alfajores Testnet)
  chainName: "Celo Alfajores",
  nativeCurrency: {
    name: "CELO",
    symbol: "CELO",
    decimals: 18,
  },
  rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
  blockExplorerUrls: ["https://alfajores.celoscan.io"],
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Prefer env overrides for deploys; fall back to known defaults
const SECUREFLOW_ADDR =
  process.env.NEXT_PUBLIC_SECUREFLOW_ESCROW ||
  "0x067FDA1ED957BB352679cbc840Ce6329E470fd07";

export const CONTRACTS = {
  // Celo Mainnet
  SECUREFLOW_ESCROW_MAINNET: SECUREFLOW_ADDR,
  CUSD_MAINNET: "0x765DE816845861e75A25fCA122bb6898B8B1282a",

  // Default contracts (used by frontend) - Celo Mainnet
  SECUREFLOW_ESCROW: SECUREFLOW_ADDR,
  USDC: "0x765DE816845861e75A25fCA122bb6898B8B1282a", // cUSD on Celo
  MOCK_ERC20: "0x765DE816845861e75A25fCA122bb6898B8B1282a", // cUSD on Celo

  // GoodDollar (G$) on Celo Mainnet
  // Official address: https://docs.gooddollar.org/
  GDOLLAR_CELO: 
    process.env.NEXT_PUBLIC_GDOLLAR_CELO || 
    "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A", // G$ on Celo (official)

  CELOSCAN_API_KEY:
    process.env.NEXT_PUBLIC_CELOSCAN_API_KEY ||
    process.env.CELOSCAN_API_KEY ||
    "AZE1AGQSIEDRMAYGKUXFPNRHMU5YSTV4HS",
};
