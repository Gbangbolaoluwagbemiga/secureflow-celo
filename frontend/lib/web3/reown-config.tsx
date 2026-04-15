"use client";

import React from "react";
import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { ethers } from "ethers";

// Get projectId from environment
export const projectId =
  process.env.NEXT_PUBLIC_REOWN_ID || "1db88bda17adf26df9ab7799871788c4";

// Create metadata
// In development, use localhost; in production, use the production URL
export const metadata = {
  name: "SecureFlow",
  description: "Secure Escrow Platform for Freelancers",
  url: typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || "https://secureflow.app",
  icons: ["/secureflow-logo.svg"],
};

// Define networks - HashKey Chain is primary
const networks = [
  {
    id: 177,
    name: "HashKey Chain",
    currency: "HSK",
    explorerUrl: "https://hashkey.blockscout.com",
    rpcUrl: "https://mainnet.hsk.xyz",
  },
  {
    id: 133,
    name: "HashKey Chain Testnet",
    currency: "HSK",
    explorerUrl: "https://testnet-explorer.hsk.xyz",
    rpcUrl: "https://testnet.hsk.xyz",
  },
];

// Create the AppKit instance
createAppKit({
  adapters: [new EthersAdapter()],
  metadata,
  networks: networks as any,
  projectId,
  features: {
    analytics: true,
  },
});

export function AppKit({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
