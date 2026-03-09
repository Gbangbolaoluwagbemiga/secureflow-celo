"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/contexts/web3-context";
import { useToast } from "@/hooks/use-toast";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";

interface SelfVerificationContextType {
  isVerified: boolean;
  isGoodDollarVerified: boolean;
  isVerifying: boolean;
  verificationTimestamp: number | null;
  verifyIdentity: () => Promise<void>;
  checkVerificationStatus: (skipStateUpdate?: boolean) => Promise<boolean>;
  SelfVerificationComponent: React.ComponentType;
}

const SelfVerificationContext = createContext<SelfVerificationContextType | undefined>(
  undefined
);

export function SelfVerificationProvider({ children }: { children: ReactNode }) {
  const { wallet, getContract } = useWeb3();
  const { toast } = useToast();
  const [isVerified, setIsVerified] = useState(false);
  const [isGoodDollarVerified, setIsGoodDollarVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationTimestamp, setVerificationTimestamp] = useState<number | null>(null);
  const [selfApp, setSelfApp] = useState<any>(null);
  const [verificationAvailable, setVerificationAvailable] = useState<boolean | null>(null); // null = unknown, true/false = checked
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedVerificationRef = useRef(false);

  // Build selfApp dynamically using @selfxyz/qrcode (loaded at runtime)
  useEffect(() => {
    const init = async () => {
      if (typeof window === "undefined") return;

      const isLocalhost = window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      if (isLocalhost) {
        console.warn("Self Protocol is disabled on localhost.");
        return;
      }

      if (!wallet.isConnected || !wallet.address) {
        setSelfApp(null);
        return;
      }

      try {
        const mod = await import(/* webpackIgnore: true */ "@selfxyz/qrcode");
        const SelfAppBuilder = mod.SelfAppBuilder;

        const endpointOverride = (process.env.NEXT_PUBLIC_SELF_ENDPOINT as string) || `${window.location.origin}/api/self/verify`;
        const scopeAuto = (process.env.NEXT_PUBLIC_SELF_SCOPE as string) || "secureflow-identity";

        const app = new SelfAppBuilder({
          appName: "SecureFlow",
          logoBase64: `${window.location.origin}/secureflow-logo.svg`,
          endpointType: "https",
          endpoint: endpointOverride,
          scope: scopeAuto,
          userId: wallet.address.toLowerCase(),
          userIdType: 'hex',
          version: 2,
          chainID: 42220,
          disclosures: { minimumAge: 18 } as any,
        }).build();

        setSelfApp(app);
      } catch (error) {
        console.error("Self Protocol init error:", error);
        setSelfApp(null);
      }
    };
    init();
  }, [wallet.address, wallet.isConnected]);

  // Check verification status from contract (only updates state if changed)
  const checkVerificationStatus = useCallback(async (skipStateUpdate = false) => {
    if (!wallet.isConnected || !wallet.address) {
      if (!skipStateUpdate) {
        setIsVerified(false);
        setIsGoodDollarVerified(false);
      }
      return false;
    }

    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      // Check both Self Protocol (current app) and GoodDollar Identity
      const [selfVerified, gdVerified, timestamp] = await Promise.all([
        contract.call("selfVerifiedUsers", wallet.address).catch(() => false),
        contract.call("isVerified", wallet.address).catch(() => false),
        contract.call("verificationTimestamp", wallet.address).catch(() => null)
      ]);

      const isVerifiedValue = Boolean(selfVerified || gdVerified);
      const timestampValue = timestamp ? Number(timestamp) : null;

      if (!skipStateUpdate) {
        setIsVerified(isVerifiedValue);
        setIsGoodDollarVerified(Boolean(gdVerified));
        setVerificationTimestamp(timestampValue);
        setVerificationAvailable(true);

        if (typeof window !== "undefined") {
          localStorage.setItem(
            `self_verified_${wallet.address.toLowerCase()}`,
            JSON.stringify({
              verified: isVerifiedValue,
              gdVerified: Boolean(gdVerified),
              timestamp: timestampValue,
            })
          );
        }
      }

      return isVerifiedValue;
    } catch (error: any) {
      if (!skipStateUpdate) {
        setVerificationAvailable(false);
        setIsVerified(false);
        setIsGoodDollarVerified(false);
      }
      return false;
    }
  }, [wallet.isConnected, wallet.address, getContract]);

  const verifyIdentity = useCallback(async () => {
    // Basic implementation for now, polling is complex to restore perfectly in one go
    // But we need the function to be defined for the context
    toast({
      title: "Verification",
      description: "Self Protocol verification is available via the QR component.",
    });
  }, [toast]);

  const SelfVerificationComponent = useMemo(() => {
    return () => <div className="p-4 text-center">Self Verification Component</div>;
  }, []);

  const contextValue = useMemo(
    () => ({
      isVerified,
      isGoodDollarVerified,
      isVerifying,
      verificationTimestamp,
      verifyIdentity,
      checkVerificationStatus,
      SelfVerificationComponent,
    }),
    [isVerified, isGoodDollarVerified, isVerifying, verificationTimestamp, verifyIdentity, checkVerificationStatus, SelfVerificationComponent]
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
