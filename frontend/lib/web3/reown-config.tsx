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

// Define networks - Celo is first (primary network)
const networks = [
  {
    id: 42220,
    name: "Celo",
    currency: "CELO",
    explorerUrl: "https://celoscan.io",
    rpcUrl: "https://forno.celo.org",
  },
  {
    id: 122,
    name: "Fuse Network",
    currency: "FUSE",
    explorerUrl: "https://explorer.fuse.io",
    rpcUrl: "https://rpc.fuse.io",
  },
  {
    id: 84532,
    name: "Base Sepolia Testnet",
    currency: "ETH",
    explorerUrl: "https://sepolia.basescan.org",
    rpcUrl: "https://sepolia.base.org",
  },
  {
    id: 8453,
    name: "Base",
    currency: "ETH",
    explorerUrl: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
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
