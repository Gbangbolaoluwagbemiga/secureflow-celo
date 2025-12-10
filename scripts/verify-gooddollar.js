/**
 * Script to verify GoodDollar (G$) token details on Celo
 * 
 * Usage:
 *   node scripts/verify-gooddollar.js
 * 
 * This script verifies the G$ token address and displays its metadata
 */

const { ethers } = require("ethers");

const GDOLLAR_CELO_ADDRESS = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
const CELO_RPC = "https://forno.celo.org";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

async function verifyToken() {
  console.log("🔍 Verifying GoodDollar (G$) Token on Celo\n");
  console.log("Address:", GDOLLAR_CELO_ADDRESS);
  console.log("Network: Celo Mainnet");
  console.log("RPC:", CELO_RPC);
  console.log("─".repeat(60));

  const provider = new ethers.JsonRpcProvider(CELO_RPC);

  try {
    const token = new ethers.Contract(GDOLLAR_CELO_ADDRESS, ERC20_ABI, provider);
    
    console.log("\n📊 Fetching token information...\n");

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.totalSupply(),
    ]);

    console.log("✅ Token Verified!");
    console.log("─".repeat(60));
    console.log("Name:", name);
    console.log("Symbol:", symbol);
    console.log("Decimals:", decimals.toString());
    console.log("Total Supply:", ethers.formatEther(totalSupply), symbol);
    console.log("─".repeat(60));

    // Verify it's GoodDollar
    const isGoodDollar = 
      symbol.toUpperCase().includes("G$") || 
      symbol.toUpperCase() === "GDOLLAR" ||
      name.toLowerCase().includes("gooddollar");

    if (isGoodDollar) {
      console.log("\n✅ This is the official GoodDollar token!");
    } else {
      console.warn("\n⚠️  WARNING: Token might not be GoodDollar!");
      console.warn("   Expected: G$ or GoodDollar");
      console.warn("   Got:", symbol, "(", name, ")");
    }

    // Check CeloScan link
    console.log("\n🔗 Links:");
    console.log(`   CeloScan: https://celoscan.io/address/${GDOLLAR_CELO_ADDRESS}`);
    console.log(`   Token: https://celoscan.io/token/${GDOLLAR_CELO_ADDRESS}`);

    // Check if whitelisted (if contract deployed)
    try {
      const deployedInfo = require("../deployed.json");
      const secureFlowAddress = deployedInfo.networks?.celo?.SecureFlow;
      
      if (secureFlowAddress) {
        console.log("\n💡 To whitelist this token:");
        console.log(`   npx hardhat run scripts/whitelist-gooddollar.js --network celo`);
      }
    } catch (e) {
      // Contract not deployed yet, skip
    }

    return true;
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    
    if (error.message.includes("network")) {
      console.error("   Check your internet connection or RPC endpoint");
    } else if (error.message.includes("revert") || error.message.includes("invalid")) {
      console.error("   Address might be invalid or not a token contract");
    }
    
    return false;
  }
}

verifyToken()
  .then((success) => {
    if (success) {
      console.log("\n✅ Verification complete!");
    } else {
      console.log("\n❌ Verification failed!");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

