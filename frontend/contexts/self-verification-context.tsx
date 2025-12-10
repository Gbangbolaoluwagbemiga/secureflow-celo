"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { SelfQRcodeWrapper, SelfAppBuilder } from "@selfxyz/qrcode";
import { ethers } from "ethers";
import { useWeb3 } from "@/contexts/web3-context";
import { useToast } from "@/hooks/use-toast";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";

interface SelfVerificationContextType {
  isVerified: boolean;
  isVerifying: boolean;
  verificationTimestamp: number | null;
  verifyIdentity: () => Promise<void>;
  checkVerificationStatus: () => Promise<void>;
  SelfVerificationComponent: React.ComponentType;
}

const SelfVerificationContext = createContext<SelfVerificationContextType | undefined>(
  undefined
);

export function SelfVerificationProvider({ children }: { children: ReactNode }) {
  const { wallet, getContract } = useWeb3();
  const { toast } = useToast();
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationTimestamp, setVerificationTimestamp] = useState<number | null>(null);
  const [selfApp, setSelfApp] = useState<any>(null);
  const [verificationAvailable, setVerificationAvailable] = useState<boolean | null>(null); // null = unknown, true/false = checked
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedVerificationRef = useRef(false);

  // Initialize Self App on mount
  useEffect(() => {
    if (typeof window === "undefined") {
      return; // Skip on server-side
    }

    // Skip Self Protocol initialization on localhost (not supported)
    const isLocalhost = window.location.hostname === "localhost" || 
                       window.location.hostname === "127.0.0.1" ||
                       window.location.hostname === "";
    
    if (isLocalhost) {
      console.warn("Self Protocol is disabled on localhost. It will work in production.");
      return;
    }

    // Only initialize if wallet is connected with a valid address
    // Self Protocol requires a valid address (not zero address) or UUID
    if (!wallet.isConnected || !wallet.address) {
      // Don't initialize until wallet is connected
      setSelfApp(null);
      return;
    }

    // Validate address format
    if (!ethers.isAddress(wallet.address) || wallet.address === ethers.ZeroAddress) {
      console.warn("Invalid wallet address for Self Protocol:", wallet.address);
      setSelfApp(null);
      return;
    }

    try {
      // According to Self Protocol docs: https://docs.self.xyz/frontend-integration/qrcode-sdk-api-reference
      // Required fields: appName, logoBase64, endpointType, endpoint, scope, userId, userIdType, disclosures
      // Using 'https' endpointType - backend verifies proof then calls contract
      const app = new SelfAppBuilder({
        appName: "SecureFlow",
        logoBase64: `${window.location.origin}/secureflow-logo.svg`, // Logo URL (can be URL or base64)
        endpointType: 'https', // 'https' for backend verification
        endpoint: `${window.location.origin}/api/self/verify`, // Backend API endpoint - MUST be publicly accessible
        scope: "secureflow-identity", // Unique scope for your app
        userId: wallet.address.toLowerCase(), // Use connected wallet address (lowercase for consistency)
        userIdType: 'hex', // Address is hex format
        version: 2,
        disclosures: {
          // Try most basic verification first - just passport/ID verification
          // This is the simplest attestation type that should work
          // If this fails, we can try other configurations
        },
      }).build();
      
      setSelfApp(app);
    } catch (error: any) {
      console.error("Failed to initialize Self App:", error);
      setSelfApp(null);
      // Don't show error to user if it's just a missing wallet
      if (error.message && !error.message.includes("userId")) {
        console.error("Self Protocol initialization error details:", error);
      }
    }
  }, [wallet.address, wallet.isConnected]);

  // Check verification status from contract (only updates state if changed)
  const checkVerificationStatus = async (skipStateUpdate = false) => {
    if (!wallet.isConnected || !wallet.address) {
      if (!skipStateUpdate) {
        setIsVerified(false);
      }
      return false;
    }

    // If we've already determined verification is not available, skip
    if (verificationAvailable === false) {
      return false;
    }

    // Check localStorage first for quick access
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`self_verified_${wallet.address.toLowerCase()}`);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          const cachedVerified = cachedData.verified;
          const cachedTimestamp = cachedData.timestamp;
          
          // Only update state if value changed
          if (!skipStateUpdate) {
            setIsVerified(cachedVerified);
            setVerificationTimestamp(cachedTimestamp);
          }
          return cachedVerified;
        } catch (e) {
          // Invalid cache, continue to contract check
        }
      }
    }

    // Try to check from contract, but fail silently if not available
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      // Try to call the function, but catch errors silently
      try {
        const verified = await contract.call("selfVerifiedUsers", wallet.address);
        const timestamp = await contract.call("verificationTimestamp", wallet.address);

        const isVerifiedValue = Boolean(verified);
        const timestampValue = timestamp ? Number(timestamp) : null;
        
        // Only update state if value changed or not skipping
        if (!skipStateUpdate) {
          setIsVerified(isVerifiedValue);
          setVerificationTimestamp(timestampValue);
          setVerificationAvailable(true); // Mark as available

          // Cache the result
          if (typeof window !== "undefined") {
            localStorage.setItem(
              `self_verified_${wallet.address.toLowerCase()}`,
              JSON.stringify({
                verified: isVerifiedValue,
                timestamp: timestampValue,
              })
            );
          }
        }
        
        return isVerifiedValue;
      } catch (callError: any) {
        // Function doesn't exist or contract doesn't support it
        // Mark as unavailable and stop trying
        if (!skipStateUpdate) {
          setVerificationAvailable(false);
          setIsVerified(false);
          setVerificationTimestamp(null);
        }
        return false;
      }
    } catch (error: any) {
      // Contract call failed entirely - verification not available
      // Mark as unavailable and stop trying
      if (!skipStateUpdate) {
        setVerificationAvailable(false);
        setIsVerified(false);
        setVerificationTimestamp(null);
      }
      return false;
    }
  };

  // Stop polling function
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsVerifying(false);
    hasStartedVerificationRef.current = false;
  };

  // Verify identity using Self Protocol
  const verifyIdentity = async () => {
    if (!wallet.isConnected || !wallet.address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    if (!selfApp) {
      toast({
        title: "Initialization error",
        description: "Self Protocol not initialized. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    // Stop any existing polling
    stopPolling();

    setIsVerifying(true);
    hasStartedVerificationRef.current = true;

    try {
      // The QR code component will handle the verification flow
      // After user scans and completes verification, the backend will call the contract
      // We'll poll for verification status
      toast({
        title: "Verification started",
        description: "Scan the QR code with the Self app to verify your identity",
      });

      // Poll for verification status every 10 seconds
      const maxAttempts = 30; // 5 minutes / 10 seconds = 30 attempts
      let attempts = 0;

      pollIntervalRef.current = setInterval(async () => {
        if (!hasStartedVerificationRef.current) {
          stopPolling();
          return;
        }

        attempts++;
        
        // Check verification status (skip state update during polling to prevent re-renders)
        const isNowVerified = await checkVerificationStatus(true);
        
        // Only update state if verification is complete
        if (isNowVerified) {
          // Get fresh timestamp
          try {
            const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
            const timestamp = await contract.call("verificationTimestamp", wallet.address);
            
            setIsVerified(true);
            setVerificationTimestamp(timestamp ? Number(timestamp) : null);
            
            // Cache the result
            if (typeof window !== "undefined") {
              localStorage.setItem(
                `self_verified_${wallet.address.toLowerCase()}`,
                JSON.stringify({
                  verified: true,
                  timestamp: timestamp ? Number(timestamp) : null,
                })
              );
            }
            
            stopPolling();
            toast({
              title: "Verification successful",
              description: "Your identity has been verified!",
            });
            return;
          } catch (error) {
            // Still mark as verified even if timestamp fetch fails
            setIsVerified(true);
            stopPolling();
            toast({
              title: "Verification successful",
              description: "Your identity has been verified!",
            });
            return;
          }
        }

        if (attempts >= maxAttempts) {
          stopPolling();
          toast({
            title: "Verification timeout",
            description: "Verification timed out. Please try again.",
            variant: "destructive",
          });
        }
      }, 10000); // Poll every 10 seconds
    } catch (error: any) {
      console.error("Verification error:", error);
      stopPolling();
      toast({
        title: "Verification failed",
        description: error.message || "Failed to start verification",
        variant: "destructive",
      });
    }
  };

  // Cleanup polling on unmount or when wallet changes
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [wallet.address]);

  // Check verification status when wallet connects (but don't poll if already verifying)
  useEffect(() => {
    if (wallet.isConnected && wallet.address) {
      // Only check if we're not already polling
      if (!hasStartedVerificationRef.current) {
        checkVerificationStatus();
      }
    } else {
      setIsVerified(false);
      setVerificationTimestamp(null);
      stopPolling();
    }
  }, [wallet.isConnected, wallet.address]);

  // Self Verification Component (QR Code Wrapper) - Stable component to prevent QR regeneration
  const SelfVerificationComponent = React.useCallback(() => {
    // Check if we're on localhost
    const isLocalhost = typeof window !== "undefined" && 
      (window.location.hostname === "localhost" || 
       window.location.hostname === "127.0.0.1" ||
       window.location.hostname === "");

    if (isLocalhost) {
      return (
        <div className="p-4 text-center text-sm text-muted-foreground">
          <p className="mb-2">Self Protocol verification is not available on localhost.</p>
          <p>Please deploy to a production environment to use identity verification.</p>
        </div>
      );
    }

    if (!selfApp) {
      return (
        <div className="p-4 text-center text-sm text-muted-foreground">
          Initializing verification...
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <SelfQRcodeWrapper selfApp={selfApp} />
        <div className="text-sm text-muted-foreground text-center max-w-md space-y-2">
          <p>
            Scan this QR code with the Self mobile app to verify your identity.
          </p>
          <div className="text-xs space-y-1 mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
            <p className="font-semibold text-blue-900 dark:text-blue-100">Requirements:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
              <li>Self mobile app installed</li>
              <li>Valid passport or government ID added to Self app</li>
              <li>Stable internet connection</li>
            </ul>
            <p className="mt-2 text-blue-700 dark:text-blue-300">
              If proof generation fails, ensure your ID is properly set up in the Self app.
            </p>
          </div>
        </div>
      </div>
    );
  }, [selfApp]); // Only recreate if selfApp changes

  return (
    <SelfVerificationContext.Provider
      value={{
        isVerified,
        isVerifying,
        verificationTimestamp,
        verifyIdentity,
        checkVerificationStatus,
        SelfVerificationComponent,
      }}
    >
      {children}
    </SelfVerificationContext.Provider>
  );
}

export function useSelfVerification() {
  const context = useContext(SelfVerificationContext);
  if (context === undefined) {
    throw new Error("useSelfVerification must be used within a SelfVerificationProvider");
  }
  return context;
}

