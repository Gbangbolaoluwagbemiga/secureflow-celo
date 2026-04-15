const hre = require("hardhat");
const fs = require("fs");
require("dotenv").config();

async function main() {
  console.log("🔍 Verifying contracts on", hre.network.name);

  // Read deployment info
  let deploymentInfo;
  try {
    const deploymentData = fs.readFileSync("deployed.json", "utf8");
    deploymentInfo = JSON.parse(deploymentData);
  } catch (error) {
    console.error("❌ Error reading deployed.json:", error.message);
    console.log(
      "💡 Make sure you have deployed contracts first using deploy.js"
    );
    process.exit(1);
  }

  const network = deploymentInfo.network;
  const chainId = deploymentInfo.chainId;

  if (
    network !== hre.network.name &&
    String(chainId) !== String((await hre.ethers.provider.getNetwork()).chainId)
  ) {
    console.error(`❌ Network mismatch!`);
    console.error(`   Expected: ${network} (chainId: ${chainId})`);
    console.error(
      `   Current: ${hre.network.name} (chainId: ${
        (await hre.ethers.provider.getNetwork()).chainId
      })`
    );
    process.exit(1);
  }

  const secureFlowAddress = deploymentInfo.contracts.SecureFlow;
  const tokenAddress = deploymentInfo.contracts.Token;

  console.log("📄 SecureFlow address:", secureFlowAddress);
  console.log("💰 Token address:", tokenAddress);

  // Get constructor arguments from deployment info or use defaults
  const feeCollector = deploymentInfo.deployer || process.env.DEPLOYER_ADDRESS;
  const platformFeeBP = 0;

  // Verify SecureFlow contract
  console.log("\n🔍 Verifying SecureFlow contract...");
  try {
    await hre.run("verify:verify", {
      address: secureFlowAddress,
      constructorArguments: [tokenAddress, feeCollector, platformFeeBP],
    });
    console.log("✅ SecureFlow contract verified!");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("ℹ️ SecureFlow contract is already verified");
    } else {
      console.log("❌ SecureFlow verification failed:", error.message);
      console.log("💡 Try running verification manually:");
      console.log(
        `   npx hardhat verify --network ${hre.network.name} ${secureFlowAddress} "${tokenAddress}" "${feeCollector}" ${platformFeeBP}`
      );
    }
  }

  // Check if MockERC20 was deployed (has tokenAbi in deployment info)
  if (deploymentInfo.tokenAbi) {
    console.log("\n🔍 Verifying MockERC20 contract...");
    try {
      await hre.run("verify:verify", {
        address: tokenAddress,
        constructorArguments: [
          "Mock Token",
          "MTK",
          hre.ethers.parseEther("1000000").toString(),
        ],
      });
      console.log("✅ MockERC20 contract verified!");
    } catch (error) {
      if (error.message.includes("Already Verified")) {
        console.log("ℹ️ MockERC20 contract is already verified");
      } else {
        console.log("❌ MockERC20 verification failed:", error.message);
        console.log("💡 Try running verification manually:");
        console.log(
          `   npx hardhat verify --network ${
            hre.network.name
          } ${tokenAddress} "Mock Token" "MTK" "${hre.ethers
            .parseEther("1000000")
            .toString()}"`
        );
      }
    }
  } else {
    console.log(
      "\nℹ️ Token is not a deployed contract (using an existing token)"
    );
    console.log("   Skipping token verification");
  }

  // Display explorer links
  const chainIdNum = Number(chainId);
  let explorerUrl = "";
  if (chainIdNum === 177) {
    explorerUrl = "https://hashkey.blockscout.com/address/";
  } else if (chainIdNum === 133) {
    explorerUrl = "https://testnet-explorer.hsk.xyz/address/";
  }

  if (explorerUrl) {
    console.log("\n🔗 Explorer Links:");
    console.log(`   SecureFlow: ${explorerUrl}${secureFlowAddress}`);
    if (deploymentInfo.tokenAbi) {
      console.log(`   MockERC20: ${explorerUrl}${tokenAddress}`);
    }
  }

  console.log("\n✅ Verification process completed!");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  });


