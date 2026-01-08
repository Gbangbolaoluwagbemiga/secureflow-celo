const hre = require("hardhat");

async function main() {
  const address = "0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465";
  console.log(`Checking address: ${address} on Celo Mainnet...`);

  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") {
    console.log("❌ Address is NOT a contract (EOA or empty).");
    return;
  }
  console.log("✅ Address IS a contract.");

  // Check for appClaim function selector
  // function appClaim(address user, address inviter, uint256 validUntilBlock, bytes memory signature) external returns (bool);
  // Selector: 0x...
  
  // We can just try to attach the interface and see if it doesn't revert on a call (or just trust it's the one based on the JS bundle).
  // But strictly, let's just output the code length.
  console.log(`Code length: ${code.length}`);
  
  console.log("\nTrying to check if it's the correct contract...");
  // IEngagementRewards interface
  const abi = [
    "function appClaim(address user, address inviter, uint256 validUntilBlock, bytes memory signature) external returns (bool)"
  ];
  
  // We can't easily read state without knowing what to read, but we can check if it's a proxy.
  // The JS bundle said "EngagementRewardsProxy#ERC1967Proxy".
  // Let's check the implementation slot.
  const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implementation = await hre.ethers.provider.getStorageAt(address, IMPLEMENTATION_SLOT);
  console.log(`Implementation address (ERC1967): ${implementation}`);
  
  // If implementation is non-zero, it is indeed a proxy.
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
