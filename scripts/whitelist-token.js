const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Whitelisting MockERC20 token...");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Get the contract addresses from deployed.json
  const deployedInfo = require("../deployed.json");
  const secureFlowAddress = deployedInfo.contracts.SecureFlow;
  const mockTokenAddress = deployedInfo.contracts.MockERC20 || deployedInfo.contracts.Token;

  console.log("SecureFlow Address:", secureFlowAddress);
  console.log("MockERC20 Address:", mockTokenAddress);

  // Get the SecureFlow contract
  const SecureFlow = await hre.ethers.getContractFactory("SecureFlow");
  const secureFlow = SecureFlow.attach(secureFlowAddress);

  try {
    // Check if token is already whitelisted
    const isWhitelisted = await secureFlow.whitelistedTokens(mockTokenAddress);
    console.log("Token already whitelisted:", isWhitelisted);

    if (!isWhitelisted) {
      // Whitelist the token
      console.log("Whitelisting token...");
      const tx = await secureFlow.whitelistToken(mockTokenAddress);
      console.log("Transaction hash:", tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log("Transaction confirmed in block:", receipt.blockNumber);
      console.log("Token whitelisted successfully!");
    } else {
      console.log("Token is already whitelisted.");
    }

    // Verify whitelist status
    const isWhitelistedAfter =
      await secureFlow.whitelistedTokens(mockTokenAddress);
    console.log("Token whitelisted after transaction:", isWhitelistedAfter);
  } catch (error) {
    console.error("Error whitelisting token:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
