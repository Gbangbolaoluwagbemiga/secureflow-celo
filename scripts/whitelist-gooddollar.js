/**
 * Script to whitelist GoodDollar (G$) token on SecureFlow
 * 
 * Usage:
 *   npx hardhat run scripts/whitelist-gooddollar.js --network celo
 * 
 * Make sure to set GDOLLAR_CELO_ADDRESS environment variable or update this file
 */

const hre = require("hardhat");

// Official G$ token address on Celo (from GoodDollar documentation)
// Source: https://docs.gooddollar.org/frequently-asked-questions/gooddollar-protocol-and-gusd-token
const GDOLLAR_CELO_ADDRESS = 
  process.env.GDOLLAR_CELO_ADDRESS || 
  "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A"; // Official G$ on Celo

async function main() {
  console.log("🌍 Whitelisting GoodDollar (G$) on SecureFlow\n");
  console.log("Network:", hre.network.name);
  console.log("─".repeat(50));

  if (GDOLLAR_CELO_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("\n❌ ERROR: G$ token address not set!");
    console.log("\nPlease:");
    console.log("1. Find G$ token address on Celo:");
    console.log("   - Run: node scripts/find-gooddollar-celo.js");
    console.log("   - Check: https://celoscan.io (search 'GoodDollar')");
    console.log("   - Check: GoodWallet GitHub/Documentation");
    console.log("\n2. Set the address:");
    console.log("   GDOLLAR_CELO_ADDRESS=0x... npx hardhat run scripts/whitelist-gooddollar.js --network celo");
    console.log("\n   OR update the GDOLLAR_CELO_ADDRESS in this file");
    process.exit(1);
  }

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "CELO");

  // Load deployed contract
  const deployedInfo = require("../deployed.json");
  
  // Try different possible structures
  let secureFlowAddress = null;
  
  if (deployedInfo.contracts && deployedInfo.contracts.SecureFlow) {
    // Structure: { contracts: { SecureFlow: "0x..." } }
    secureFlowAddress = deployedInfo.contracts.SecureFlow;
  } else if (deployedInfo.networks && deployedInfo.networks[hre.network.name]) {
    secureFlowAddress = deployedInfo.networks[hre.network.name]?.SecureFlow;
  } else if (deployedInfo.networks && deployedInfo.networks.celo) {
    secureFlowAddress = deployedInfo.networks.celo?.SecureFlow;
  } else if (deployedInfo.SecureFlow) {
    secureFlowAddress = deployedInfo.SecureFlow;
  }

  if (!secureFlowAddress) {
    // Use known deployed address (from frontend config)
    const knownAddress = "0x067FDA1ED957BB352679cbc840Ce6329E470fd07";
    console.log(`\n💡 Using known deployed address: ${knownAddress}`);
    secureFlowAddress = knownAddress;
  }

  console.log("\nSecureFlow Contract:", secureFlowAddress);

  // Get contract instance
  const SecureFlow = await hre.ethers.getContractFactory("SecureFlow");
  const secureFlow = SecureFlow.attach(secureFlowAddress);

  // Verify token address
  console.log("\n🔍 Verifying G$ token address:", GDOLLAR_CELO_ADDRESS);

  try {
    // Check if it's already whitelisted
    const isWhitelisted = await secureFlow.whitelistedTokens(GDOLLAR_CELO_ADDRESS);
    if (isWhitelisted) {
      console.log("✅ G$ token is already whitelisted!");
      return;
    }

    // Try to verify it's a valid ERC20 token
    const ERC20_ABI = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ];

    const token = new hre.ethers.Contract(GDOLLAR_CELO_ADDRESS, ERC20_ABI, deployer);
    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);

    console.log("✅ Token verified:");
    console.log("   Name:", name);
    console.log("   Symbol:", symbol);
    console.log("   Decimals:", decimals.toString());

    if (!symbol.toUpperCase().includes("G$") && 
        symbol.toUpperCase() !== "GDOLLAR" &&
        !name.toLowerCase().includes("gooddollar")) {
      console.warn("\n⚠️  WARNING: Token doesn't seem to be GoodDollar!");
      console.warn("   Expected: G$ or GoodDollar");
      console.warn("   Got:", symbol, "(", name, ")");
      console.warn("   Proceeding anyway...");
    }
  } catch (error) {
    console.error("\n❌ ERROR: Failed to verify token:", error.message);
    console.log("   The address might be invalid or not an ERC20 token");
    process.exit(1);
  }

  // Whitelist the token
  console.log("\n📝 Whitelisting G$ token...");
  let txHash = null;
  try {
    const tx = await secureFlow.whitelistToken(GDOLLAR_CELO_ADDRESS);
    txHash = tx.hash;
    console.log("   Transaction hash:", txHash);
    console.log("   Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("   ✅ Transaction confirmed in block:", receipt.blockNumber);

    // Verify it's whitelisted
    const nowWhitelisted = await secureFlow.whitelistedTokens(GDOLLAR_CELO_ADDRESS);
    if (nowWhitelisted) {
      console.log("\n✅ SUCCESS: G$ token whitelisted!");
      console.log("\n📋 Next steps:");
      console.log("1. ✅ Config already updated (frontend/lib/web3/config.ts)");
      console.log("2. ✅ Token info already added (frontend/app/create/page.tsx)");
      console.log("3. Test creating escrow with G$ token");
    } else {
      console.error("\n❌ ERROR: Token whitelisting may have failed");
      console.log("   Please check the transaction and verify manually");
    }
  } catch (error) {
    console.error("\n❌ ERROR: Failed to whitelist token:", error.message);
    
    if (error.message.includes("Not owner or arbiter")) {
      console.log("\n💡 Make sure you're using the owner/arbiter account");
    } else if (error.message.includes("Invalid token")) {
      console.log("\n💡 Token address might be invalid (zero address)");
    }
    
    process.exit(1);
  }

  // Get explorer URL
  const explorerUrl = hre.network.config.explorerUrl || "https://celoscan.io";
  console.log("\n🔗 Links:");
  console.log(`   SecureFlow: ${explorerUrl}/address/${secureFlowAddress}`);
  console.log(`   G$ Token: ${explorerUrl}/address/${GDOLLAR_CELO_ADDRESS}`);
  if (txHash) {
    console.log(`   Transaction: ${explorerUrl}/tx/${txHash}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

