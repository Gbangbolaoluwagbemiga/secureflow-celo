require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.26",
        settings: {
          optimizer: {
            enabled: true,
            // Higher runs typically reduces deployed bytecode size
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    hashkey: {
      url: process.env.HASHKEY_RPC_URL || "https://mainnet.hsk.xyz",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 177, // HashKey Chain mainnet chain ID
      gas: 8000000,
      // Let ethers automatically determine gas price
    },
    hashkeyTestnet: {
      url: process.env.HASHKEY_TESTNET_RPC_URL || "https://testnet.hsk.xyz",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 133, // HashKey Chain testnet chain ID
      gas: 8000000,
      // Let ethers automatically determine gas price
    },
    celo: {
      url: process.env.CELO_RPC_URL || "https://celo.drpc.org",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 42220, // Celo mainnet chain ID
      gas: 8000000,
      // Let ethers automatically determine gas price for Celo
    },
    celoTestnet: {
      url:
        process.env.CELO_TESTNET_RPC_URL ||
        "https://alfajores-forno.celo-testnet.org",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 44787, // Celo Alfajores testnet chain ID
      gas: 8000000,
      // Let ethers automatically determine gas price for Celo
    },
    base: {
      url: "https://mainnet.base.org",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453, // Base mainnet chain ID
      gas: 2000000, // Further reduced gas limit
      gasPrice: 1000000, // 0.001 gwei (minimum gas price)
    },
    baseTestnet: {
      url: process.env.BASE_TESTNET_RPC_URL || "https://sepolia.base.org",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532, // Base testnet chain ID
      gas: 8000000, // Higher gas limit
      gasPrice: 1000000000, // 1 gwei
    },
    monad: {
      url: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      chainId: 10143, // Monad testnet chain ID
      gas: 3000000, // Gas limit
      maxFeePerGas: 10000000000, // 10 gwei
      maxPriorityFeePerGas: 1000000000, // 1 gwei
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  etherscan: {
    apiKey: {
      celo: process.env.CELOSCAN_API_KEY || "",
      celoTestnet: process.env.CELOSCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      // Blockscout is typically API-keyless, but the plugin requires a non-empty string.
      hashkey: process.env.HASHKEYSCAN_API_KEY || "hashkey",
      hashkeyTestnet: process.env.HASHKEYSCAN_API_KEY || "hashkey",
    },
    customChains: [
      {
        network: "hashkey",
        chainId: 177,
        urls: {
          apiURL: "https://hashkey.blockscout.com/api",
          browserURL: "https://hashkey.blockscout.com",
        },
      },
      {
        network: "hashkeyTestnet",
        chainId: 133,
        urls: {
          apiURL: "https://testnet-explorer.hsk.xyz/api",
          browserURL: "https://testnet-explorer.hsk.xyz",
        },
      },
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
      {
        network: "celoTestnet",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/v2/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/v2/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
};
