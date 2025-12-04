import { NextRequest, NextResponse } from "next/server";
import { SelfBackendVerifier } from "@selfxyz/core";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import { ethers } from "ethers";

// Initialize Self Protocol Backend Verifier
// Note: You'll need to configure this with your actual app scope and config storage
const verifier = new SelfBackendVerifier(
  "secureflow-identity", // Your app scope
  process.env.SELF_ENDPOINT || "https://api.self.xyz", // Self Protocol API endpoint
  process.env.NODE_ENV === "development", // devMode
  new Map(), // allowedIds - configure based on your needs
  null as any, // configStorage - implement based on Self Protocol docs
  "uuid" // identifier type
);

// Get Celo RPC provider
function getProvider() {
  return new ethers.JsonRpcProvider(
    process.env.CELO_RPC_URL || "https://forno.celo.org"
  );
}

// Get contract instance
function getContract() {
  const provider = getProvider();
  return new ethers.Contract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI, provider);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { proof, pubSignals, userContextData, userAddress } = body;

    if (!proof || !pubSignals || !userAddress) {
      return NextResponse.json(
        { error: "Missing required fields: proof, pubSignals, userAddress" },
        { status: 400 }
      );
    }

    // Verify the proof using Self Protocol
    try {
      const verificationResult = await verifier.verify(
        proof.attestationId || "humanity", // Default to humanity verification
        proof,
        pubSignals,
        userContextData || {}
      );

      if (!verificationResult.valid) {
        return NextResponse.json(
          { error: "Verification failed", details: verificationResult },
          { status: 400 }
        );
      }

      // If verification is valid, update the smart contract
      // Note: In production, you should use a backend signer or admin account
      // For now, we'll return success and let the frontend handle the contract call
      // In production, implement server-side contract interaction here

      return NextResponse.json({
        success: true,
        verified: true,
        userAddress: userAddress.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
        message: "Verification successful. Please confirm the transaction to update your status on-chain.",
      });
    } catch (verifyError: any) {
      console.error("Self Protocol verification error:", verifyError);
      return NextResponse.json(
        {
          error: "Verification failed",
          details: verifyError.message || "Unknown verification error",
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message || "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Self Protocol Verification",
    endpoint: "/api/self/verify",
    contract: CONTRACTS.SECUREFLOW_ESCROW,
  });
}

