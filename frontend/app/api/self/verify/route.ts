import { NextRequest, NextResponse } from "next/server";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import { ethers } from "ethers";

// Lazy-load Self Protocol Verifier to avoid build-time issues
let verifier: any = null;
let verifierError: Error | null = null;

async function getVerifier() {
  if (verifier) return verifier;
  if (verifierError) throw verifierError;
  
  try {
    const { SelfBackendVerifier, AllIds, DefaultConfigStore } = await import("@selfxyz/core");
    const endpointType = process.env.NEXT_PUBLIC_SELF_ENDPOINT_TYPE || '';
    const mockPassport = (
      (typeof endpointType === 'string' && endpointType.includes('staging')) ||
      process.env.SELF_DEV_MODE === 'true'
    );
    const scopeEnv = process.env.SELF_SCOPE_ID || process.env.NEXT_PUBLIC_SELF_SCOPE || "secureflow-identity";
    verifier = new SelfBackendVerifier(
      scopeEnv,
      "",
      mockPassport,
      AllIds,
      new DefaultConfigStore({ minimumAge: 18, excludedCountries: [], ofac: false }),
      "hex"
    );
    
    return verifier;
  } catch (error: any) {
    verifierError = error;
    throw error;
  }
}

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

    // Verify the proof using Self Protocol
    try {
      const selfVerifier = await getVerifier();
      
      // Determine attestation ID - Self Protocol uses numeric IDs
      // 1 = Electronic Passport (NFC-enabled), 2 = EU ID Card (NFC-enabled)
      // For minimumAge disclosure, use the attestation ID from the payload
      // The verifier expects the numeric ID directly
      let verificationAttestationId: number = 1; // Default to passport (ID: 1)
      
      if (finalAttestationId !== undefined && finalAttestationId !== null) {
        // Use the attestation ID directly (should be a number)
        if (typeof finalAttestationId === 'number') {
          verificationAttestationId = finalAttestationId;
        } else {
          // Try to parse string numbers
          const parsed = parseInt(String(finalAttestationId), 10);
          verificationAttestationId = isNaN(parsed) ? 1 : parsed;
        }
      } else if (finalProof?.attestationId) {
        const proofAttestationId = finalProof.attestationId;
        if (typeof proofAttestationId === 'number') {
          verificationAttestationId = proofAttestationId;
        } else {
          const parsed = parseInt(String(proofAttestationId), 10);
          verificationAttestationId = isNaN(parsed) ? 1 : parsed;
        }
      }
      
      // For minimumAge disclosures, the attestation type might need special handling
      // But we'll use the numeric ID from the payload
      
      console.log("🔍 Verifying with:", {
        attestationId: verificationAttestationId,
        rawAttestationId: finalAttestationId,
        hasProof: !!finalProof,
        hasPubSignals: !!finalPubSignals,
        pubSignalsLength: finalPubSignals?.length,
        userAddress: finalUserAddress || "NOT PROVIDED - will extract from verification"
      });
      
      // Verify the proof - Self Protocol verifier handles the proof validation
      const verificationResult = await selfVerifier.verify(
        verificationAttestationId,
        finalProof,
        finalPubSignals,
        finalUserContextData
      );
      
      console.log("✅ Verification result:", verificationResult);

      if (!verificationResult.valid) {
        return NextResponse.json(
          { error: "Verification failed", details: verificationResult },
          { status: 400 }
        );
      }

      // Extract userAddress from verification result if not provided
      let verifiedUserAddress = finalUserAddress;
      if (!verifiedUserAddress && verificationResult.userId) {
        verifiedUserAddress = verificationResult.userId;
      }
      if (!verifiedUserAddress && verificationResult.address) {
        verifiedUserAddress = verificationResult.address;
      }

      // If still no address, try to get it from publicSignals more aggressively
      if (!verifiedUserAddress && finalPubSignals && Array.isArray(finalPubSignals)) {
        // The address might be in publicSignals - check all elements
        for (const signal of finalPubSignals) {
          if (typeof signal === 'string') {
            if (signal.startsWith('0x') && signal.length === 42 && ethers.isAddress(signal)) {
              verifiedUserAddress = signal.toLowerCase();
              break;
            }
          }
        }
      }

      if (!verifiedUserAddress) {
        return NextResponse.json(
          { 
            error: "Verification successful but unable to determine user address",
            details: "Please ensure the Self app is configured with the correct userId (wallet address)",
            verificationResult
          },
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
        userAddress: verifiedUserAddress.toLowerCase(),
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
