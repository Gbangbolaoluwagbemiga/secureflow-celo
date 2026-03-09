const hre = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function main() {
  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying contracts to", hre.network.name);
  console.log("📝 Deployer address:", deployer.address);

  // Use native tokens on mainnets or deploy MockERC20 for testing
  let tokenAddress;
  let tokenName;
  let tokenAbi;
  let mockTokenAddress = null;

  if (hre.network.name === "celo") {
    // cUSD on Celo mainnet: 0x765DE816845861e75A25fCA122bb6898B8B1282a
    tokenAddress = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
    tokenName = "cUSD";
    console.log("✅ Using cUSD on Celo mainnet:", tokenAddress);
  } else if (hre.network.name === "base") {
    // USDC on Base mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    tokenName = "USDC";
    console.log("✅ Using USDC on Base mainnet:", tokenAddress);
  } else {
    // Deploy MockERC20 token for testing on other networks
    console.log("\n📦 Deploying MockERC20 token...");
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy(
      "Mock Token",
      "MTK",
      hre.ethers.parseEther("1000000")
    );
    await mockToken.waitForDeployment();
    tokenAddress = await mockToken.getAddress();
    mockTokenAddress = tokenAddress;
    tokenName = "MockERC20";
    tokenAbi = mockToken.interface.format("json");
    console.log("✅ MockERC20 deployed to:", tokenAddress);
  }

  // Deploy SecureFlow
  console.log("\n🔒 Deploying SecureFlow...");
  const SecureFlow = await hre.ethers.getContractFactory("SecureFlow");

  // Constructor parameters: tokenAddress, feeCollector, platformFeeBP
  const feeCollector = deployer.address; // Use deployer as fee collector for now
  const platformFeeBP = 0; // 0% fees for hackathon demo

  const secureFlow = await SecureFlow.deploy(
    tokenAddress, // token address (USDC on Base or MockERC20 on testnets)
    feeCollector, // feeCollector
    platformFeeBP // platformFeeBP
  );
  await secureFlow.waitForDeployment();

  // Authorize some arbiters for testing
  const arbiters = [
    "0x3be7fbbdbc73fc4731d60ef09c4ba1a94dc58e41", // Your arbiter address
    "0xF1E430aa48c3110B2f223f278863A4c8E2548d8C", // Another arbiter address
  ];

  for (const arbiterAddress of arbiters) {
    await secureFlow.authorizeArbiter(arbiterAddress);
  }

  // Whitelist the token
  await secureFlow.whitelistToken(tokenAddress);

  // Set GoodDollar Identity address on Celo mainnet
  if (hre.network.name === "celo") {
    const GDOLLAR_IDENTITY = "0xFC325BBfBA3f9547d792900eeCf69542a188846C";
    console.log("\n🆔 Setting GoodDollar Identity address...");
    await secureFlow.setIdentity(GDOLLAR_IDENTITY);
    console.log("✅ Identity address set to:", GDOLLAR_IDENTITY);
  }

  const secureFlowAddress = await secureFlow.getAddress();

  // Get contract info
  const contractInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    contracts: {
      SecureFlow: secureFlowAddress,
      Token: tokenAddress,
    },
    features: [
      "🚀 MODULAR ARCHITECTURE - Clean separation of concerns",
      "⚖️ MULTI-ARBITER CONSENSUS - Quorum-based voting",
      "🏆 REPUTATION SYSTEM - Anti-gaming guards",
      "📊 JOB APPLICATIONS - Pagination support",
      "🔒 ENTERPRISE SECURITY - Modular design",
      "💰 NATIVE & ERC20 SUPPORT - Permit integration",
      "⏰ AUTO-APPROVAL - Dispute window management",
      "🛡️ ANTI-GAMING - Minimum value thresholds",
      "📈 SCALABLE - Gas optimized modular design",
    ],
    deploymentTime: new Date().toISOString(),
  };

  // Save deployment info
  const deploymentInfo = {
    ...contractInfo,
    abi: secureFlow.interface.format("json"),
    tokenAbi: tokenAbi || null, // Only for MockERC20 deployments
  };

  fs.writeFileSync(
    "deployed.json",
    JSON.stringify(
      deploymentInfo,
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );

  console.log("\n🎉 Deployment completed successfully!");
  console.log("📄 SecureFlow deployed to:", secureFlowAddress);
  console.log("💰 Token address:", tokenAddress, `(${tokenName})`);
  console.log("📊 Network:", hre.network.name);
  console.log("🔗 Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("📝 Deployment info saved to deployed.json");

  // Wait for block confirmations before verification
  console.log("\n⏳ Waiting for block confirmations before verification...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

  // Verify SecureFlow contract
  console.log("\n🔍 Verifying SecureFlow contract...");
  try {
    await hre.run("verify:verify", {
      address: secureFlowAddress,
      constructorArguments: [tokenAddress, feeCollector, platformFeeBP],
    });
    console.log("✅ SecureFlow contract verified!");
  } catch (error) {
    console.log("⚠️ SecureFlow verification failed:", error.message);
    if (error.message.includes("Already Verified")) {
      console.log("ℹ️ Contract is already verified");
    }
  }

  // Verify MockERC20 if deployed
  if (mockTokenAddress) {
    console.log("\n🔍 Verifying MockERC20 contract...");
    try {
      await hre.run("verify:verify", {
        address: mockTokenAddress,
        constructorArguments: [
          "Mock Token",
          "MTK",
          hre.ethers.parseEther("1000000").toString(),
        ],
      });
      console.log("✅ MockERC20 contract verified!");
    } catch (error) {
      console.log("⚠️ MockERC20 verification failed:", error.message);
      if (error.message.includes("Already Verified")) {
        console.log("ℹ️ Contract is already verified");
      }
    }
  }

  // Display explorer links
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  let explorerUrl = "";
  if (chainId === 42220) {
    explorerUrl = "https://celoscan.io/address/";
  } else if (chainId === 44787) {
    explorerUrl = "https://alfajores.celoscan.io/address/";
  } else if (chainId === 8453) {
    explorerUrl = "https://basescan.org/address/";
  } else if (chainId === 84532) {
    explorerUrl = "https://sepolia.basescan.org/address/";
  }

  if (explorerUrl) {
    console.log("\n🔗 Explorer Links:");
    console.log(`   SecureFlow: ${explorerUrl}${secureFlowAddress}`);
    if (mockTokenAddress) {
      console.log(`   MockERC20: ${explorerUrl}${mockTokenAddress}`);
    }
  }
}

main()
  .then(() => {
    console.log("✅ Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    console.error("Error details:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  });
