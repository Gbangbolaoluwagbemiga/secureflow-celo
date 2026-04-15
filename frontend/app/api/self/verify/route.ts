import { NextRequest, NextResponse } from "next/server";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import { ethers } from "ethers";

// Get HashKey Chain testnet RPC provider
function getProvider() {
  return new ethers.JsonRpcProvider(
    process.env.HASHKEY_TESTNET_RPC_URL || "https://testnet.hsk.xyz"
  );
}

// Get contract instance
function getContract() {
  const provider = getProvider();
  return new ethers.Contract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI, provider);
}

export async function POST(request: NextRequest) {
  try {
    // Self Protocol verifier is disabled in this build to keep installs reproducible.
    // Keep the endpoint so the frontend can degrade gracefully.
    return NextResponse.json(
      {
        success: false,
        verified: false,
        message:
          "Self Protocol verification is disabled in this build. Use admin verification on-chain instead.",
      },
      { status: 501 }
    );

    // Try to get raw body first to see what we're actually receiving
    const contentType = request.headers.get("content-type") || "";
    let body: any;
    
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch (parseError) {
        const text = await request.text();
        console.error("❌ Failed to parse JSON:", text.substring(0, 500));
        return NextResponse.json(
          { error: "Invalid JSON format", received: text.substring(0, 200) },
          { status: 400 }
        );
      }
    } else {
      // Try to read as text and parse
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Invalid request format", contentType, received: text.substring(0, 200) },
          { status: 400 }
        );
      }
    }
    
    // Log the received body for debugging
    console.log("📥 Self Protocol verification request:");
    console.log("Content-Type:", contentType);
    console.log("Body keys:", Object.keys(body || {}));
    console.log("Body preview:", JSON.stringify(body).substring(0, 1000));
    
    // Enhanced disclosures logging
    if (body.disclosures) {
      console.log("📋 Disclosures configuration:", {
        hasDisclosures: !!body.disclosures,
        disclosuresType: typeof body.disclosures,
        disclosuresLength: Array.isArray(body.disclosures) ? body.disclosures.length : 'not-array',
        disclosures: body.disclosures
      });
    }
    
    // Self Protocol SDK sends data in specific format according to docs
    // Based on error logs, the structure is: { attestationId, proof, publicSignals }
    const proof = body.proof || body.Proof || body.proofData || body.proof_data;
    let pubSignals: any = body.publicSignals || body.pubSignals || body.public_signals || body.pub_signals;
    const userContextData = body.userContextData || body.user_context_data || body.contextData || body.context;
    const attestationId = body.attestationId || body.attestation_id;
    
    // Check nested structures
    const nestedData = body.data || body.verification || body.result || body.payload;
    const nestedProof = nestedData?.proof;
    const nestedPubSignals = nestedData?.publicSignals || nestedData?.pubSignals || nestedData?.pub_signals;
    const nestedAttestationId = nestedData?.attestationId;

    const finalProof = proof || nestedProof;
    let finalPubSignals: any = pubSignals || nestedPubSignals;

    if (typeof finalPubSignals === 'string') {
      try {
        const parsed = JSON.parse(finalPubSignals);
        finalPubSignals = parsed;
      } catch {}
    }

    if (!Array.isArray(finalPubSignals) && finalProof && (finalProof.publicSignals || finalProof.pubSignals)) {
      finalPubSignals = finalProof.publicSignals || finalProof.pubSignals;
    }

    if (finalPubSignals && typeof finalPubSignals === 'object' && !Array.isArray(finalPubSignals)) {
      if (Array.isArray(finalPubSignals.data)) {
        finalPubSignals = finalPubSignals.data;
      } else if (Array.isArray(finalPubSignals.result)) {
        finalPubSignals = finalPubSignals.result;
      }
    }
    const finalAttestationId = attestationId || nestedAttestationId;

    // Extract userAddress from publicSignals - it's typically the first element
    // Or derive from the proof structure according to Self Protocol docs
    let finalUserAddress: string | null = null;
    
    // Try direct field first
    const userAddress = body.userAddress || body.user_address || body.address || body.userId || body.user_id || body.identifier;
    if (userAddress) {
      finalUserAddress = userAddress;
    } else if (finalPubSignals && Array.isArray(finalPubSignals) && finalPubSignals.length > 0) {
      // userAddress might be in publicSignals - convert the first element
      // Public signals are typically BigInt strings, so we need to convert
      try {
        // The user address might be the first public signal as a hex string
        const firstSignal = finalPubSignals[0];
        if (typeof firstSignal === 'string') {
          // Try to convert - might need to handle different formats
          // If it's a hex address, it should start with 0x and be 42 chars
          if (firstSignal.startsWith('0x') && firstSignal.length === 42) {
            finalUserAddress = firstSignal.toLowerCase();
          } else {
            // Might be a BigInt that needs conversion
            // Try converting from BigInt string to address
            const bigIntValue = BigInt(firstSignal);
            // Address is 20 bytes = 160 bits, so we take the lower 160 bits
            const addressHex = '0x' + bigIntValue.toString(16).padStart(40, '0').slice(-40);
            if (ethers.isAddress(addressHex)) {
              finalUserAddress = addressHex.toLowerCase();
            }
          }
        }
      } catch (e) {
        console.warn("Failed to extract address from publicSignals:", e);
      }
    }

    // If still no address, try to extract from userContextData
    if (!finalUserAddress && userContextData) {
      finalUserAddress = userContextData.userAddress || userContextData.address || userContextData.userId;
    }

    const finalUserContextData = userContextData || nestedData?.context || {};

    if (!finalProof || !finalPubSignals || (Array.isArray(finalPubSignals) && finalPubSignals.length === 0)) {
      console.error("❌ Missing required fields:");
      console.error("Body structure:", JSON.stringify(body, null, 2));
      return NextResponse.json(
        { 
          error: "Missing or empty fields: proof, publicSignals",
          debug: {
            hasProof: !!finalProof,
            hasPubSignals: !!finalPubSignals,
            hasUserAddress: !!finalUserAddress,
            bodyKeys: Object.keys(body || {}),
            contentType,
            bodySample: JSON.stringify(body).substring(0, 500),
            publicSignalsLength: Array.isArray(finalPubSignals) ? finalPubSignals.length : undefined,
            publicSignalsSample: finalPubSignals ? JSON.stringify(finalPubSignals.slice(0, 3)) : null
          }
        },
        { status: 400 }
      );
    }

    // If userAddress is still missing, we can't proceed - but let's try verification anyway
    // and see if Self Protocol can validate without it, then extract it from the verification result
    if (!finalUserAddress) {
      console.warn("⚠️ userAddress not found in payload, attempting verification without it");
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
  const endpointType = process.env.NEXT_PUBLIC_SELF_ENDPOINT_TYPE || 'https';
  const mode = (typeof endpointType === 'string' && endpointType.includes('staging')) ? 'staging' : 'production';
  return NextResponse.json({
    status: "active",
    mode,
    service: "Self Protocol Verification",
    endpoint: "/api/self/verify",
    contract: CONTRACTS.SECUREFLOW_ESCROW,
  });
}
