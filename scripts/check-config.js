const hre = require("hardhat");

async function main() {
  const deployedInfo = require("../deployed.json");
  const secureFlowAddress = deployedInfo.networks?.celo?.SecureFlow || deployedInfo.contracts?.SecureFlow;

  if (!secureFlowAddress) {
    console.error("❌ Error: SecureFlow contract address not found in deployed.json");
    process.exit(1);
  }

  console.log("Checking SecureFlow Contract:", secureFlowAddress);

  const SecureFlow = await hre.ethers.getContractFactory("SecureFlow");
  const secureFlow = SecureFlow.attach(secureFlowAddress);

  const currentAddress = await secureFlow.engagementRewards();
  console.log("\nCurrent Configured Engagement Rewards Address:", currentAddress);
  
  const EXPECTED = "0x25db74CF4E7BA120526fd87e159CF656d94bAE43";
  if (currentAddress.toLowerCase() === EXPECTED.toLowerCase()) {
      console.log("✅ Configuration matches expected address!");
  } else {
      console.log("⚠️ Configuration DOES NOT match. It is currently set to:", currentAddress);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
