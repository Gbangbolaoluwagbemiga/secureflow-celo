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

export const CONTRACTS = {
  // Celo Mainnet - DEPLOYED ✅ (Updated with Rating & Arbiter Features)
  SECUREFLOW_ESCROW_MAINNET: "0x1173Bcc9183f29aFbB6f4C7E3c0b25476D3daF0F",
  CUSD_MAINNET: "0x765DE816845861e75A25fCA122bb6898B8B1282a",

  // Default contracts (used by frontend) - Celo Mainnet
  SECUREFLOW_ESCROW: "0x1173Bcc9183f29aFbB6f4C7E3c0b25476D3daF0F",
  USDC: "0x765DE816845861e75A25fCA122bb6898B8B1282a", // cUSD on Celo
  MOCK_ERC20: "0x765DE816845861e75A25fCA122bb6898B8B1282a", // cUSD on Celo

  CELOSCAN_API_KEY: "AZE1AGQSIEDRMAYGKUXFPNRHMU5YSTV4HS",
};
