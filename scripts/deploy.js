const hre = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function main() {
  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying contracts to", hre.network.name);
  console.log("📝 Deployer address:", deployer.address);

  // Use existing tokens on HashKey mainnet, or deploy MockERC20 for testnet/testing
  let tokenAddress;
  let tokenName;
  let tokenAbi;
  let mockTokenAddress = null;

  if (hre.network.name === "hashkey") {
    // HashKey Chain mainnet USDT (official)
    tokenAddress = "0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029";
    tokenName = "USDT";
    console.log("✅ Using USDT on HashKey Chain mainnet:", tokenAddress);
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

  // Deploy SecureFlow (PayFi build)
  console.log("\n🔒 Deploying SecureFlowPayFi...");
  const SecureFlow = await hre.ethers.getContractFactory("SecureFlowPayFi");

  // Constructor parameters: tokenAddress, feeCollector, platformFeeBP
  const feeCollector = deployer.address; // Use deployer as fee collector for now
  const platformFeeBP = 0; // 0% fees for hackathon demo

  const secureFlow = await SecureFlow.deploy(
    tokenAddress, // token address (USDT on HashKey mainnet or MockERC20 on testnets)
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

  const secureFlowAddress = await secureFlow.getAddress();

  // Get contract info
  const contractInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    contracts: {
      SecureFlow: secureFlowAddress,
      Token: tokenAddress,
      ...(mockTokenAddress ? { MockERC20: mockTokenAddress } : {}),
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
  console.log("📄 SecureFlowPayFi deployed to:", secureFlowAddress);
  console.log("💰 Token address:", tokenAddress, `(${tokenName})`);
  console.log("📊 Network:", hre.network.name);
  console.log("🔗 Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("📝 Deployment info saved to deployed.json");

  // Wait for block confirmations before verification
  console.log("\n⏳ Waiting for block confirmations before verification...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

  // Verify SecureFlowPayFi contract
  console.log("\n🔍 Verifying SecureFlowPayFi contract...");
  try {
    await hre.run("verify:verify", {
      address: secureFlowAddress,
      constructorArguments: [tokenAddress, feeCollector, platformFeeBP],
    });
    console.log("✅ SecureFlowPayFi contract verified!");
  } catch (error) {
    console.log("⚠️ SecureFlowPayFi verification failed:", error.message);
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
  if (chainId === 177) {
    explorerUrl = "https://hashkey.blockscout.com/address/";
  } else if (chainId === 133) {
    explorerUrl = "https://testnet-explorer.hsk.xyz/address/";
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
