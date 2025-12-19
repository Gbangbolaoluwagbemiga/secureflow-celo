"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from "react";
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
      const hostname = window.location.hostname || "";
      const endpointOverride = (process.env.NEXT_PUBLIC_SELF_ENDPOINT as string) || `${window.location.origin}/api/self/verify`;
      const endpointIsPlayground = endpointOverride.includes("playground.self.xyz");
      const endpointTypeEnv = process.env.NEXT_PUBLIC_SELF_ENDPOINT_TYPE as any;
      // Default to 'https' (production) for Vercel deployments unless explicitly set to staging
      const autoEndpointType = endpointIsPlayground ? "https" : (endpointTypeEnv ?? "https");
      const devModeAuto = endpointIsPlayground ? false : (typeof autoEndpointType === "string" && autoEndpointType.includes("staging"));
      const scopeEnv = (process.env.NEXT_PUBLIC_SELF_SCOPE as string) || "secureflow-identity";
      const scopeAuto = endpointIsPlayground ? "self-playground" : (scopeEnv && scopeEnv !== "self-playground" ? scopeEnv : "secureflow-identity");

      // Warning for conflicting configuration
      if (endpointIsPlayground && scopeEnv && scopeEnv !== "self-playground") {
        console.error(`[Self] CONFIGURATION MISMATCH: You have set NEXT_PUBLIC_SELF_SCOPE to '${scopeEnv}' but NEXT_PUBLIC_SELF_ENDPOINT points to the Playground. This forces the app to use 'self-playground' scope. Please DELETE the NEXT_PUBLIC_SELF_ENDPOINT environment variable in Vercel to use your custom scope.`);
      }

      // Warning for common configuration issues
      if (scopeAuto.length > 30 && scopeAuto.includes("-") && !scopeAuto.includes(" ")) {
        console.warn("[Self] The provided scope looks like a UUID/Project ID. Self Protocol scopes are typically short strings (e.g., 'secureflow-app'). Ensure you are using the Scope Name, not the Project ID.");
      }
      
      const disclosuresPayload = [
        { type: "minimumAge", value: 18 }
      ] as any;

      const app = new SelfAppBuilder({
        appName: "SecureFlow",
        logoBase64: `${window.location.origin}/secureflow-logo.svg`,
        endpointType: autoEndpointType,
        endpoint: endpointOverride,
        scope: scopeAuto,
        userId: wallet.address.toLowerCase(),
        userIdType: 'hex',
        devMode: devModeAuto,
        version: 2,
        chainID: 42220,
        userDefinedData: "secureflow|identity_verification|age>=18",
        disclosures: disclosuresPayload,
      }).build();

      console.log("[Self] Builder payload:", {
        endpointType: autoEndpointType,
        devMode: devModeAuto,
        endpoint: endpointOverride,
        scope: scopeAuto,
        userId: wallet.address.toLowerCase(),
        disclosures: disclosuresPayload,
      });

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
  const checkVerificationStatus = useCallback(async (skipStateUpdate = false) => {
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
  }, [wallet.isConnected, wallet.address, verificationAvailable, getContract]);

  // Stop polling function
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsVerifying(false);
    hasStartedVerificationRef.current = false;
  }, []);

  // Verify identity using Self Protocol
  const verifyIdentity = useCallback(async () => {
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
            if (typeof window !== "undefined" && wallet.address) {
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
  }, [wallet.isConnected, wallet.address, selfApp, toast, stopPolling, checkVerificationStatus, getContract]);

  // Cleanup polling on unmount or when wallet changes
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [wallet.address, stopPolling]);

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
  }, [wallet.isConnected, wallet.address, checkVerificationStatus, stopPolling]);

  // Memoize callbacks to prevent QR code component re-renders
  const handleQRSuccess = useCallback(() => {
    // Verification success is handled by polling mechanism
    console.log("Self Protocol QR: Success callback triggered");
  }, []);

  const handleQRError = useCallback((error: any) => {
    console.error("Self Protocol QR: Error callback triggered", error);
    const reason = error?.reason || error?.message || "Proof generation failed";
    const isStaging = typeof process !== "undefined" && (process.env.NEXT_PUBLIC_SELF_ENDPOINT_TYPE || "").includes("staging");
    const isPlayground = typeof process !== "undefined" && ((process.env.NEXT_PUBLIC_SELF_ENDPOINT || "").includes("playground.self.xyz"));
    const hint =
      typeof reason === "string" && reason.includes("Unsupported number of inputs")
        ? "This usually means the Self app has no document loaded for staging. Add a mock passport in the Self app settings and retry."
        : (typeof reason === "string" && reason.includes("Config not found"))
        ? "Ensure scope and endpoint type match. Use self-playground only with the Playground endpoint; use secureflow-identity with your own HTTPS endpoint."
        : (isStaging && (reason === "error" || (typeof reason === "string" && reason.toLowerCase() === "error")))
        ? "On staging, ensure you have a mock passport set up in the Self mobile app before scanning the QR."
        : (!isStaging && isPlayground && (reason === "error" || (typeof reason === "string" && reason.toLowerCase() === "error")))
        ? "On Playground (production), ensure you are using a real NFC passport in the Self mobile app."
        : undefined;
    toast({
      title: "Verification error",
        description:
        hint
          ? `${reason}. ${hint}`
          : typeof reason === "string"
          ? reason
          : "Verification failed. Ensure your Self app has a valid NFC passport (production) or a mock passport (staging) and try again.",
      variant: "destructive",
    });
  }, []);

  // Self Verification Component (QR Code Wrapper) - Stable component to prevent QR regeneration
  const SelfVerificationComponent = useMemo(() => {
    // Return a memoized component that only re-renders when selfApp changes
    const Component = () => {
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
          <SelfQRcodeWrapper 
            key={wallet.address || 'default'} // Stable key to prevent unnecessary remounts
            selfApp={selfApp}
            onSuccess={handleQRSuccess}
            onError={handleQRError}
          />
          <div className="text-sm text-muted-foreground text-center max-w-md space-y-2">
            <p>
              Scan this QR code with the Self mobile app to verify your identity.
            </p>
            <div className="text-xs space-y-1 mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
              <p className="font-semibold text-blue-900 dark:text-blue-100">Requirements:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                <li>Self mobile app installed</li>
                <li>Valid passport or government ID (NFC-enabled) added to Self app</li>
                <li>Must be at least 18 years old</li>
                <li>Stable internet connection</li>
              </ul>
              <p className="mt-2 text-blue-700 dark:text-blue-300">
                The verification will confirm your age and identity using your government-issued ID.
              </p>
            </div>
          </div>
        </div>
      );
    };
    return Component;
  }, [selfApp, handleQRSuccess, handleQRError]); // Only recreate if selfApp or callbacks change

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      isVerified,
      isVerifying,
      verificationTimestamp,
      verifyIdentity,
      checkVerificationStatus,
      SelfVerificationComponent,
    }),
    [isVerified, isVerifying, verificationTimestamp, verifyIdentity, checkVerificationStatus, SelfVerificationComponent]
  );

  return (
    <SelfVerificationContext.Provider value={contextValue}>
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
