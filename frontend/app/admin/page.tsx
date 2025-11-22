"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useWeb3 } from "@/contexts/web3-context";
import { useAdminStatus } from "@/hooks/use-admin-status";
import { useToast } from "@/hooks/use-toast";
import { CONTRACTS, CELO_MAINNET } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import { DisputeResolution } from "@/components/admin/dispute-resolution";
import {
  Lock,
  Shield,
  Play,
  Pause,
  Download,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function AdminPage() {
  const { wallet, getContract } = useWeb3();
  const {
    isAdmin,
    isOwner,
    isArbiter,
    loading: adminLoading,
  } = useAdminStatus();
  const { toast } = useToast();
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contractOwner, setContractOwner] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<
    "pause" | "unpause" | "withdraw" | null
  >(null);
  const [withdrawData, setWithdrawData] = useState({
    token: CONTRACTS.MOCK_ERC20,
    amount: "",
  });
  const [testMode, setTestMode] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [arbiterAddress, setArbiterAddress] = useState("");
  const [isWhitelisting, setIsWhitelisting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Load from localStorage on mount
  const [knownWhitelistedTokens, setKnownWhitelistedTokens] = useState<
    string[]
  >(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("secureflow_whitelisted_tokens");
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });
  const [knownAuthorizedArbiters, setKnownAuthorizedArbiters] = useState<
    string[]
  >(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("secureflow_authorized_arbiters");
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });

  // Save to localStorage whenever lists change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "secureflow_whitelisted_tokens",
        JSON.stringify(knownWhitelistedTokens)
      );
    }
  }, [knownWhitelistedTokens]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "secureflow_authorized_arbiters",
        JSON.stringify(knownAuthorizedArbiters)
      );
    }
  }, [knownAuthorizedArbiters]);
  const [contractStats, setContractStats] = useState({
    platformFeeBP: 0,
    totalEscrows: 0,
    totalVolume: "0",
    authorizedArbiters: 0,
    whitelistedTokens: 0,
  });

  useEffect(() => {
    if (wallet.isConnected) {
      checkPausedStatus();
      fetchContractOwner();
      fetchContractStats();
    }
  }, [wallet.isConnected]);

  // Debug: Log when contractStats changes
  useEffect(() => {
    console.log("📈 contractStats state updated:", contractStats);
  }, [contractStats]);

  // Refresh stats when known lists change (after whitelisting/authorizing)
  useEffect(() => {
    if (
      wallet.isConnected &&
      (knownWhitelistedTokens.length > 0 || knownAuthorizedArbiters.length > 0)
    ) {
      fetchContractStats();
    }
  }, [knownWhitelistedTokens.length, knownAuthorizedArbiters.length]);

  const fetchContractOwner = async () => {
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      if (!contract) return;
      const owner = await contract.call("owner");
      setContractOwner(owner?.toLowerCase() || null);
      console.log("Contract owner:", owner);
    } catch (error) {
      console.error("Error fetching contract owner:", error);
    }
  };

  const fetchContractStats = async () => {
    setIsRefreshing(true);
    console.log("🔄 Starting fetchContractStats...");
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      if (!contract) {
        console.error("❌ No contract instance available");
        setIsRefreshing(false);
        return;
      }
      console.log("✅ Contract instance created");

      // Fetch platform fee
      const platformFeeBP = await contract.call("platformFeeBP");
      console.log("✅ Platform fee fetched:", platformFeeBP);

      // Fetch total escrows count
      const totalEscrows = await contract.call("nextEscrowId");
      console.log("✅ Total escrows fetched:", totalEscrows);

      // Fetch contract owner (needed for arbiter checks)
      const contractOwner = await contract.call("owner");
      console.log("✅ Contract owner fetched:", contractOwner);

      // SIMPLE DIRECT CHECKS FIRST (more reliable than events)
      console.log("🔍 Starting direct token/arbiter checks...");
      const directWhitelistedTokens: string[] = [];
      const directAuthorizedArbiters: string[] = [];

      // Check known tokens directly (normalize to lowercase to avoid duplicates)
      const tokensToCheck = [
        CONTRACTS.CUSD_MAINNET,
        CONTRACTS.MOCK_ERC20,
        ...knownWhitelistedTokens,
      ]
        .filter((t) => t && t !== "0x0000000000000000000000000000000000000000")
        .map((t) => t.toLowerCase());

      console.log("📋 Tokens to check (unique):", [...new Set(tokensToCheck)]);
      for (const token of new Set(tokensToCheck)) {
        try {
          console.log(`🔎 Checking token: ${token}`);
          const result = await contract.call("whitelistedTokens", token);
          console.log(`   Raw result:`, result, `Type:`, typeof result);

          let isWhitelisted = false;
          if (typeof result === "boolean") {
            isWhitelisted = result;
          } else if (typeof result === "string") {
            isWhitelisted = result.toLowerCase() === "true" || result === "1";
          } else if (typeof result === "number") {
            isWhitelisted = result !== 0;
          } else if (result && typeof result.toString === "function") {
            const str = result.toString();
            isWhitelisted = str !== "0" && str.toLowerCase() !== "false";
          } else {
            isWhitelisted = Boolean(result);
          }

          console.log(`   ✅ Token ${token} whitelisted: ${isWhitelisted}`);
          if (isWhitelisted) {
            directWhitelistedTokens.push(token.toLowerCase());
          }
        } catch (error) {
          console.error(`   ❌ Error checking token ${token}:`, error);
        }
      }

      // Check known arbiters directly (including owner) - normalize to lowercase
      const contractOwnerLower = contractOwner?.toLowerCase();
      const walletAddressLower = wallet.address?.toLowerCase();
      const arbitersToCheck = [
        contractOwnerLower,
        walletAddressLower,
        ...knownAuthorizedArbiters.map((a) => a.toLowerCase()),
      ]
        .filter((a) => a && a !== "0x0000000000000000000000000000000000000000")
        .filter((a, index, arr) => arr.indexOf(a) === index); // Remove duplicates

      console.log("📋 Arbiters to check (unique):", [
        ...new Set(arbitersToCheck),
      ]);
      for (const arbiter of new Set(arbitersToCheck)) {
        try {
          console.log(`🔎 Checking arbiter: ${arbiter}`);
          const result = await contract.call("authorizedArbiters", arbiter);
          console.log(`   Raw result:`, result, `Type:`, typeof result);

          let isAuthorized = false;
          if (typeof result === "boolean") {
            isAuthorized = result;
          } else if (typeof result === "string") {
            isAuthorized = result.toLowerCase() === "true" || result === "1";
          } else if (typeof result === "number") {
            isAuthorized = result !== 0;
          } else if (result && typeof result.toString === "function") {
            const str = result.toString();
            isAuthorized = str !== "0" && str.toLowerCase() !== "false";
          } else {
            isAuthorized = Boolean(result);
          }

          // Owner is always authorized
          if (arbiter === contractOwnerLower) {
            isAuthorized = true;
            console.log(`   ✅ Owner is always authorized`);
          }

          console.log(`   ✅ Arbiter ${arbiter} authorized: ${isAuthorized}`);
          if (isAuthorized && !directAuthorizedArbiters.includes(arbiter)) {
            directAuthorizedArbiters.push(arbiter);
          }
        } catch (error) {
          console.error(`   ❌ Error checking arbiter ${arbiter}:`, error);
        }
      }

      console.log("📊 Direct check results:", {
        whitelistedTokens: directWhitelistedTokens,
        authorizedArbiters: directAuthorizedArbiters,
      });

      // Remove duplicates from direct check results (they're already lowercase)
      const uniqueWhitelistedTokens = [...new Set(directWhitelistedTokens)];
      const uniqueAuthorizedArbiters = [...new Set(directAuthorizedArbiters)];

      console.log("📊 Direct check results (deduplicated):", {
        whitelistedTokens: uniqueWhitelistedTokens,
        authorizedArbiters: uniqueAuthorizedArbiters,
        counts: {
          tokens: uniqueWhitelistedTokens.length,
          arbiters: uniqueAuthorizedArbiters.length,
        },
      });

      // Update known lists with direct check results
      if (uniqueWhitelistedTokens.length > 0) {
        setKnownWhitelistedTokens((prev) => {
          const merged = [
            ...new Set([
              ...prev.map((t) => t.toLowerCase()),
              ...uniqueWhitelistedTokens,
            ]),
          ];
          console.log("📝 Updated knownWhitelistedTokens:", merged);
          return merged;
        });
      }
      if (uniqueAuthorizedArbiters.length > 0) {
        setKnownAuthorizedArbiters((prev) => {
          const merged = [
            ...new Set([
              ...prev.map((a) => a.toLowerCase()),
              ...uniqueAuthorizedArbiters,
            ]),
          ];
          console.log("📝 Updated knownAuthorizedArbiters:", merged);
          return merged;
        });
      }

      // Query TokenWhitelisted events to get ALL whitelisted tokens
      // Then verify each one directly with the contract
      let allWhitelistedTokensFromEvents: string[] = [];
      let allAuthorizedArbitersFromEvents: string[] = [];
      let verifiedTokens: string[] = [];
      let verifiedArbiters: string[] = [];

      try {
        const { ethers } = await import("ethers");

        // Try multiple RPC endpoints with fallback
        let provider: any = null;
        let events: any[] = [];
        let lastError: any = null;

        for (const rpcUrl of CELO_MAINNET.rpcUrls) {
          try {
            provider = new ethers.JsonRpcProvider(rpcUrl);
            const contractWithProvider = new ethers.Contract(
              CONTRACTS.SECUREFLOW_ESCROW,
              SECUREFLOW_ABI,
              provider
            );

            // Query all TokenWhitelisted events - query in chunks to avoid RPC limits
            const currentBlock = await provider.getBlockNumber();
            // Query from block 0 to get all events (contract might be older than 200k blocks)
            const chunkSize = 10000;
            events = [];
            // Start from block 0 to ensure we get all events
            let fromBlock = 0;

            // Query events in chunks of 10,000 blocks
            for (
              let startBlock = fromBlock;
              startBlock <= currentBlock;
              startBlock += chunkSize
            ) {
              const endBlock = Math.min(
                startBlock + chunkSize - 1,
                currentBlock
              );
              try {
                const filter = contractWithProvider.filters.TokenWhitelisted();
                const chunkEvents = await contractWithProvider.queryFilter(
                  filter,
                  startBlock,
                  endBlock
                );
                events.push(...chunkEvents);
              } catch (chunkError: any) {
                // If chunk fails, try smaller chunks or skip
                console.warn(
                  `Failed to query token events from block ${startBlock} to ${endBlock}:`,
                  chunkError.message
                );
                // Try smaller chunk if "too large" error
                if (
                  chunkError.message?.includes("too large") ||
                  chunkError.message?.includes("limit")
                ) {
                  // Try half the chunk size
                  const halfChunk = Math.floor(chunkSize / 2);
                  for (
                    let smallStart = startBlock;
                    smallStart <= endBlock;
                    smallStart += halfChunk
                  ) {
                    const smallEnd = Math.min(
                      smallStart + halfChunk - 1,
                      endBlock
                    );
                    try {
                      const filter =
                        contractWithProvider.filters.TokenWhitelisted();
                      const smallChunkEvents =
                        await contractWithProvider.queryFilter(
                          filter,
                          smallStart,
                          smallEnd
                        );
                      events.push(...smallChunkEvents);
                    } catch (smallError) {
                      console.warn(
                        `Failed to query token events from block ${smallStart} to ${smallEnd}:`,
                        smallError
                      );
                    }
                  }
                } else {
                  continue; // Skip this chunk if other error
                }
              }
            }
            console.log(`✅ Successfully queried events using RPC: ${rpcUrl}`);
            break; // Success, exit loop
          } catch (rpcError: any) {
            console.warn(`⚠️ RPC ${rpcUrl} failed:`, rpcError.message);
            lastError = rpcError;
            continue; // Try next RPC
          }
        }

        // Don't throw error if events are empty - might just mean no events yet
        // We'll fall back to direct verification
        if (!provider) {
          throw lastError || new Error("All RPC endpoints failed");
        }

        const contractWithProvider = new ethers.Contract(
          CONTRACTS.SECUREFLOW_ESCROW,
          SECUREFLOW_ABI,
          provider!
        );

        // Extract unique token addresses from events
        const tokenAddresses = new Set<string>();
        events.forEach((event: any) => {
          if (event.args && event.args.token) {
            tokenAddresses.add(event.args.token.toLowerCase());
          }
        });

        // Also check TokenBlacklisted events to remove blacklisted tokens
        const currentBlock = await provider!.getBlockNumber();
        const chunkSize = 10000;
        let blacklistEvents: any[] = [];
        const blacklistFromBlock = 0; // Query from block 0 to get all events

        // Query in chunks from the same starting block
        for (
          let startBlock = blacklistFromBlock;
          startBlock <= currentBlock;
          startBlock += chunkSize
        ) {
          const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
          try {
            const blacklistFilter =
              contractWithProvider.filters.TokenBlacklisted();
            const chunkEvents = await contractWithProvider.queryFilter(
              blacklistFilter,
              startBlock,
              endBlock
            );
            blacklistEvents.push(...chunkEvents);
          } catch (chunkError: any) {
            console.warn(
              `Failed to query blacklist events from block ${startBlock} to ${endBlock}:`,
              chunkError.message
            );
            // Try smaller chunk if "too large" error
            if (
              chunkError.message?.includes("too large") ||
              chunkError.message?.includes("limit")
            ) {
              const halfChunk = Math.floor(chunkSize / 2);
              for (
                let smallStart = startBlock;
                smallStart <= endBlock;
                smallStart += halfChunk
              ) {
                const smallEnd = Math.min(smallStart + halfChunk - 1, endBlock);
                try {
                  const blacklistFilter =
                    contractWithProvider.filters.TokenBlacklisted();
                  const smallChunkEvents =
                    await contractWithProvider.queryFilter(
                      blacklistFilter,
                      smallStart,
                      smallEnd
                    );
                  blacklistEvents.push(...smallChunkEvents);
                } catch (smallError) {
                  console.warn(
                    `Failed to query blacklist events from block ${smallStart} to ${smallEnd}:`,
                    smallError
                  );
                }
              }
            } else {
              continue;
            }
          }
        }
        blacklistEvents.forEach((event: any) => {
          if (event.args && event.args.token) {
            tokenAddresses.delete(event.args.token.toLowerCase());
          }
        });

        allWhitelistedTokensFromEvents = Array.from(tokenAddresses).map((t) =>
          t.toLowerCase()
        );
        console.log(
          "📋 Found whitelisted tokens from events:",
          allWhitelistedTokensFromEvents.length,
          allWhitelistedTokensFromEvents
        );
      } catch (eventError) {
        console.warn(
          "Error querying token events (will use direct checks):",
          eventError
        );
        // Continue with direct checks below
      }

      // Verify ALL tokens from events directly with the contract
      // Combine addresses from events and initial direct checks
      const allTokensToVerify = [
        ...new Set([
          ...uniqueWhitelistedTokens, // From initial direct checks
          ...allWhitelistedTokensFromEvents, // From event queries
          CONTRACTS.CUSD_MAINNET?.toLowerCase(),
          CONTRACTS.MOCK_ERC20?.toLowerCase(),
          ...knownWhitelistedTokens.map((t) => t.toLowerCase()),
        ]),
      ].filter(
        (token) =>
          token && token !== "0x0000000000000000000000000000000000000000"
      );

      console.log(
        "🔍 Verifying all tokens from events:",
        allTokensToVerify.length,
        allTokensToVerify
      );

      verifiedTokens = [];
      for (const token of allTokensToVerify) {
        if (!token) continue;
        try {
          const result = await contract.call("whitelistedTokens", token);
          // Handle different response types
          let isWhitelisted = false;
          if (typeof result === "boolean") {
            isWhitelisted = result;
          } else if (typeof result === "string") {
            isWhitelisted = result.toLowerCase() === "true" || result === "1";
          } else if (typeof result === "number") {
            isWhitelisted = result !== 0;
          } else if (result && typeof result.toString === "function") {
            const str = result.toString();
            isWhitelisted = str !== "0" && str.toLowerCase() !== "false";
          } else {
            isWhitelisted = Boolean(result);
          }
          if (isWhitelisted && !verifiedTokens.includes(token.toLowerCase())) {
            verifiedTokens.push(token.toLowerCase());
            console.log(`✅ Verified whitelisted token: ${token}`);
          }
        } catch (error) {
          console.warn(`❌ Error verifying token ${token}:`, error);
        }
      }

      console.log(
        "✅ Final verified whitelisted tokens:",
        verifiedTokens.length,
        verifiedTokens
      );

      // Update known list
      if (verifiedTokens.length > 0) {
        setKnownWhitelistedTokens(verifiedTokens);
      }

      // Query ArbiterAuthorized events to get all authorized arbiters

      try {
        const { ethers } = await import("ethers");

        // Try multiple RPC endpoints with fallback
        let provider: any = null;
        let arbiterEvents: any[] = [];
        let lastError: any = null;

        for (const rpcUrl of CELO_MAINNET.rpcUrls) {
          try {
            provider = new ethers.JsonRpcProvider(rpcUrl);
            const contractWithProvider = new ethers.Contract(
              CONTRACTS.SECUREFLOW_ESCROW,
              SECUREFLOW_ABI,
              provider
            );

            // Query all ArbiterAuthorized events - query in chunks to avoid RPC limits
            const currentBlock = await provider.getBlockNumber();
            const chunkSize = 10000;
            arbiterEvents = [];
            // Start from block 0 to get all events
            const arbiterFromBlock = 0;

            // Query events in chunks of 10,000 blocks
            for (
              let startBlock = arbiterFromBlock;
              startBlock <= currentBlock;
              startBlock += chunkSize
            ) {
              const endBlock = Math.min(
                startBlock + chunkSize - 1,
                currentBlock
              );
              try {
                const arbiterFilter =
                  contractWithProvider.filters.ArbiterAuthorized();
                const chunkEvents = await contractWithProvider.queryFilter(
                  arbiterFilter,
                  startBlock,
                  endBlock
                );
                arbiterEvents.push(...chunkEvents);
              } catch (chunkError: any) {
                console.warn(
                  `Failed to query arbiter events from block ${startBlock} to ${endBlock}:`,
                  chunkError.message
                );
                // Try smaller chunk if "too large" error
                if (
                  chunkError.message?.includes("too large") ||
                  chunkError.message?.includes("limit")
                ) {
                  const halfChunk = Math.floor(chunkSize / 2);
                  for (
                    let smallStart = startBlock;
                    smallStart <= endBlock;
                    smallStart += halfChunk
                  ) {
                    const smallEnd = Math.min(
                      smallStart + halfChunk - 1,
                      endBlock
                    );
                    try {
                      const arbiterFilter =
                        contractWithProvider.filters.ArbiterAuthorized();
                      const smallChunkEvents =
                        await contractWithProvider.queryFilter(
                          arbiterFilter,
                          smallStart,
                          smallEnd
                        );
                      arbiterEvents.push(...smallChunkEvents);
                    } catch (smallError) {
                      console.warn(
                        `Failed to query arbiter events from block ${smallStart} to ${smallEnd}:`,
                        smallError
                      );
                    }
                  }
                } else {
                  continue;
                }
              }
            }
            console.log(
              `✅ Successfully queried arbiter events using RPC: ${rpcUrl}`
            );
            break; // Success, exit loop
          } catch (rpcError: any) {
            console.warn(
              `⚠️ RPC ${rpcUrl} failed for arbiters:`,
              rpcError.message
            );
            lastError = rpcError;
            continue; // Try next RPC
          }
        }

        // Don't throw error if events are empty - might just mean no events yet
        // We'll fall back to direct verification
        if (!provider) {
          throw lastError || new Error("All RPC endpoints failed");
        }

        const contractWithProvider = new ethers.Contract(
          CONTRACTS.SECUREFLOW_ESCROW,
          SECUREFLOW_ABI,
          provider!
        );

        // Extract unique arbiter addresses from events
        const arbiterAddresses = new Set<string>();
        arbiterEvents.forEach((event: any) => {
          if (event.args && event.args.arbiter) {
            arbiterAddresses.add(event.args.arbiter.toLowerCase());
          }
        });

        // Also check ArbiterRevoked events to remove revoked arbiters
        const currentBlock = await provider!.getBlockNumber();
        const chunkSize = 10000;
        let revokeEvents: any[] = [];
        const revokeFromBlock = 0; // Query from block 0 to get all events

        // Query in chunks from the same starting block
        for (
          let startBlock = revokeFromBlock;
          startBlock <= currentBlock;
          startBlock += chunkSize
        ) {
          const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
          try {
            const revokeFilter = contractWithProvider.filters.ArbiterRevoked();
            const chunkEvents = await contractWithProvider.queryFilter(
              revokeFilter,
              startBlock,
              endBlock
            );
            revokeEvents.push(...chunkEvents);
          } catch (chunkError: any) {
            console.warn(
              `Failed to query revoke events from block ${startBlock} to ${endBlock}:`,
              chunkError.message
            );
            // Try smaller chunk if "too large" error
            if (
              chunkError.message?.includes("too large") ||
              chunkError.message?.includes("limit")
            ) {
              const halfChunk = Math.floor(chunkSize / 2);
              for (
                let smallStart = startBlock;
                smallStart <= endBlock;
                smallStart += halfChunk
              ) {
                const smallEnd = Math.min(smallStart + halfChunk - 1, endBlock);
                try {
                  const revokeFilter =
                    contractWithProvider.filters.ArbiterRevoked();
                  const smallChunkEvents =
                    await contractWithProvider.queryFilter(
                      revokeFilter,
                      smallStart,
                      smallEnd
                    );
                  revokeEvents.push(...smallChunkEvents);
                } catch (smallError) {
                  console.warn(
                    `Failed to query revoke events from block ${smallStart} to ${smallEnd}:`,
                    smallError
                  );
                }
              }
            } else {
              continue;
            }
          }
        }
        revokeEvents.forEach((event: any) => {
          if (event.args && event.args.arbiter) {
            arbiterAddresses.delete(event.args.arbiter.toLowerCase());
          }
        });

        allAuthorizedArbitersFromEvents = Array.from(arbiterAddresses).map(
          (a) => a.toLowerCase()
        );
        console.log(
          "📋 Found authorized arbiters from events:",
          allAuthorizedArbitersFromEvents.length,
          allAuthorizedArbitersFromEvents
        );
      } catch (eventError) {
        console.warn(
          "Error querying arbiter events (will use direct checks):",
          eventError
        );
        // Continue with direct checks below
      }

      // Verify ALL arbiters from events directly with the contract
      // Combine addresses from events and initial direct checks
      const allArbitersToVerify = [
        ...new Set([
          ...uniqueAuthorizedArbiters, // From initial direct checks
          ...allAuthorizedArbitersFromEvents, // From event queries
          contractOwnerLower, // Owner is always authorized
          walletAddressLower,
          ...knownAuthorizedArbiters.map((a) => a.toLowerCase()),
        ]),
      ].filter((a) => a && a !== "0x0000000000000000000000000000000000000000");

      console.log(
        "🔍 Verifying all arbiters from events:",
        allArbitersToVerify.length,
        allArbitersToVerify
      );

      verifiedArbiters = [];
      for (const arbiter of allArbitersToVerify) {
        if (!arbiter) continue;
        try {
          const result = await contract.call("authorizedArbiters", arbiter);
          // Handle different response types
          let isAuthorized = false;
          if (typeof result === "boolean") {
            isAuthorized = result;
          } else if (typeof result === "string") {
            isAuthorized = result.toLowerCase() === "true" || result === "1";
          } else if (typeof result === "number") {
            isAuthorized = result !== 0;
          } else if (result && typeof result.toString === "function") {
            const str = result.toString();
            isAuthorized = str !== "0" && str.toLowerCase() !== "false";
          } else {
            isAuthorized = Boolean(result);
          }

          // Owner is always authorized
          if (arbiter === contractOwnerLower) {
            isAuthorized = true;
          }

          if (
            isAuthorized &&
            !verifiedArbiters.includes(arbiter.toLowerCase())
          ) {
            verifiedArbiters.push(arbiter.toLowerCase());
            console.log(`✅ Verified authorized arbiter: ${arbiter}`);
          }
        } catch (error) {
          console.warn(`❌ Error verifying arbiter ${arbiter}:`, error);
        }
      }

      console.log(
        "✅ Final verified authorized arbiters:",
        verifiedArbiters.length,
        verifiedArbiters
      );

      // Update known list
      if (verifiedArbiters.length > 0) {
        setKnownAuthorizedArbiters(verifiedArbiters);
      }

      // Use verified results from event queries + direct checks
      // These are the actual verified counts from contract calls
      const finalWhitelistedCount = verifiedTokens.length;
      const finalArbiterCount = verifiedArbiters.length;

      console.log("🔢 Final count calculation (using verified results):", {
        whitelisted: {
          verifiedTokens: verifiedTokens.length,
          final: finalWhitelistedCount,
          tokens: verifiedTokens,
        },
        arbiters: {
          verifiedArbiters: verifiedArbiters.length,
          final: finalArbiterCount,
          arbiters: verifiedArbiters,
        },
      });

      console.log("📊 FINAL STATS:", {
        whitelistedTokens: {
          count: verifiedTokens.length,
          final: finalWhitelistedCount,
          tokens: verifiedTokens,
        },
        authorizedArbiters: {
          count: verifiedArbiters.length,
          final: finalArbiterCount,
          arbiters: verifiedArbiters,
        },
      });

      // Convert BigInt values to numbers
      const platformFeeBPNum =
        typeof platformFeeBP === "bigint"
          ? Number(platformFeeBP)
          : Number(platformFeeBP || 0);
      const totalEscrowsNum =
        typeof totalEscrows === "bigint"
          ? Number(totalEscrows)
          : Number(totalEscrows || 0);

      const statsToSet = {
        platformFeeBP: platformFeeBPNum,
        totalEscrows: totalEscrowsNum,
        totalVolume: "0", // Would need to be tracked in contract
        authorizedArbiters: finalArbiterCount,
        whitelistedTokens: finalWhitelistedCount,
      };

      console.log("💾 Setting contract stats:", statsToSet);
      console.log("💾 Stats values breakdown:", {
        platformFeeBP: { raw: platformFeeBP, converted: platformFeeBPNum },
        totalEscrows: { raw: totalEscrows, converted: totalEscrowsNum },
        authorizedArbiters: finalArbiterCount,
        whitelistedTokens: finalWhitelistedCount,
      });

      // Use functional update to ensure we're setting the latest state
      setContractStats((prev) => {
        const newStats = {
          platformFeeBP: platformFeeBPNum,
          totalEscrows: totalEscrowsNum,
          totalVolume: "0",
          authorizedArbiters: finalArbiterCount,
          whitelistedTokens: finalWhitelistedCount,
        };
        console.log(
          "🔄 setContractStats callback - prev:",
          prev,
          "new:",
          newStats
        );
        return newStats;
      });

      console.log("✅ Contract stats update called! Expected values:", {
        platformFeeBP: platformFeeBPNum,
        totalEscrows: totalEscrowsNum,
        authorizedArbiters: finalArbiterCount,
        whitelistedTokens: finalWhitelistedCount,
      });
    } catch (error) {
      console.error("❌ Error fetching contract stats:", error);
      console.error("Error details:", error);
      // Set empty stats if contract calls fail
      setContractStats({
        platformFeeBP: 0,
        totalEscrows: 0,
        totalVolume: "0",
        authorizedArbiters: 0,
        whitelistedTokens: 0,
      });
    } finally {
      setIsRefreshing(false);
      console.log("🏁 fetchContractStats completed");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchContractStats(),
        fetchContractOwner(),
        checkPausedStatus(),
      ]);
      toast({
        title: "Stats refreshed",
        description: "Contract statistics have been updated",
      });
    } catch (error: any) {
      toast({
        title: "Refresh failed",
        description: error.message || "Failed to refresh stats",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleWhitelistToken = async () => {
    if (!wallet.isConnected || !isAdmin) {
      toast({
        title: "Access denied",
        description: "Only the contract owner can whitelist tokens",
        variant: "destructive",
      });
      return;
    }

    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/i.test(tokenAddress)) {
      toast({
        title: "Invalid address",
        description: "Please enter a valid token address",
        variant: "destructive",
      });
      return;
    }

    setIsWhitelisting(true);
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      // Check if already whitelisted
      const isWhitelistedRaw = await contract.call(
        "whitelistedTokens",
        tokenAddress
      );
      // Handle different response types
      let isWhitelisted = false;
      if (typeof isWhitelistedRaw === "boolean") {
        isWhitelisted = isWhitelistedRaw;
      } else if (typeof isWhitelistedRaw === "string") {
        isWhitelisted =
          isWhitelistedRaw.toLowerCase() === "true" || isWhitelistedRaw === "1";
      } else if (typeof isWhitelistedRaw === "number") {
        isWhitelisted = isWhitelistedRaw !== 0;
      } else if (
        isWhitelistedRaw &&
        typeof isWhitelistedRaw.toString === "function"
      ) {
        const str = isWhitelistedRaw.toString();
        isWhitelisted = str !== "0" && str.toLowerCase() !== "false";
      } else {
        isWhitelisted = Boolean(isWhitelistedRaw);
      }
      if (isWhitelisted) {
        toast({
          title: "Already whitelisted",
          description: "This token is already whitelisted",
          variant: "default",
        });
        setIsWhitelisting(false);
        return;
      }

      await contract.send("whitelistToken", "no-value", tokenAddress);

      // Add to known whitelisted tokens
      const normalizedTokenAddress = tokenAddress.toLowerCase();
      setKnownWhitelistedTokens((prev) => {
        const updated = [...prev, normalizedTokenAddress];
        console.log("Updated known whitelisted tokens:", updated);
        return updated;
      });

      toast({
        title: "Token whitelisted",
        description: "Token has been successfully whitelisted",
      });

      setTokenAddress("");
      // Wait a moment for blockchain state to update
      await new Promise((resolve) => setTimeout(resolve, 2000));
      fetchContractStats();
    } catch (error: any) {
      toast({
        title: "Whitelist failed",
        description: error.message || "Failed to whitelist token",
        variant: "destructive",
      });
    } finally {
      setIsWhitelisting(false);
    }
  };

  const handleAuthorizeArbiter = async () => {
    if (!wallet.isConnected || !isAdmin) {
      toast({
        title: "Access denied",
        description: "Only the contract owner can authorize arbiters",
        variant: "destructive",
      });
      return;
    }

    if (!arbiterAddress || !/^0x[a-fA-F0-9]{40}$/i.test(arbiterAddress)) {
      toast({
        title: "Invalid address",
        description: "Please enter a valid arbiter address",
        variant: "destructive",
      });
      return;
    }

    setIsAuthorizing(true);
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      // Check if already authorized
      const isAuthorizedRaw = await contract.call(
        "authorizedArbiters",
        arbiterAddress
      );
      // Handle different response types
      let isAuthorized = false;
      if (typeof isAuthorizedRaw === "boolean") {
        isAuthorized = isAuthorizedRaw;
      } else if (typeof isAuthorizedRaw === "string") {
        isAuthorized =
          isAuthorizedRaw.toLowerCase() === "true" || isAuthorizedRaw === "1";
      } else if (typeof isAuthorizedRaw === "number") {
        isAuthorized = isAuthorizedRaw !== 0;
      } else if (
        isAuthorizedRaw &&
        typeof isAuthorizedRaw.toString === "function"
      ) {
        const str = isAuthorizedRaw.toString();
        isAuthorized = str !== "0" && str.toLowerCase() !== "false";
      } else {
        isAuthorized = Boolean(isAuthorizedRaw);
      }
      if (isAuthorized) {
        toast({
          title: "Already authorized",
          description: "This arbiter is already authorized",
          variant: "default",
        });
        setIsAuthorizing(false);
        return;
      }

      await contract.send("authorizeArbiter", "no-value", arbiterAddress);

      // Add to known authorized arbiters
      const normalizedArbiterAddress = arbiterAddress.toLowerCase();
      setKnownAuthorizedArbiters((prev) => {
        const updated = [...prev, normalizedArbiterAddress];
        console.log("Updated known authorized arbiters:", updated);
        return updated;
      });

      toast({
        title: "Arbiter authorized",
        description: "Arbiter has been successfully authorized",
      });

      setArbiterAddress("");
      // Wait a moment for blockchain state to update
      await new Promise((resolve) => setTimeout(resolve, 2000));
      fetchContractStats();
    } catch (error: any) {
      toast({
        title: "Authorization failed",
        description: error.message || "Failed to authorize arbiter",
        variant: "destructive",
      });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const checkPausedStatus = async () => {
    setLoading(true);
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      const paused = await contract.call("paused");

      // Handle different possible return types - including Proxy objects
      let isPaused = false;

      if (paused === true || paused === "true" || paused === 1) {
        isPaused = true;
      } else if (paused === false || paused === "false" || paused === 0) {
        isPaused = false;
      } else if (paused && typeof paused === "object") {
        // Handle Proxy objects - try to extract the actual value
        try {
          const pausedValue = paused.toString();
          isPaused = pausedValue === "true" || pausedValue === "1";
        } catch (e) {
          isPaused = false; // Default to not paused
        }
      }

      setIsPaused(isPaused);
    } catch (error) {
      // Fallback to false if contract call fails
      setIsPaused(false);
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (type: typeof actionType) => {
    setActionType(type);
    setDialogOpen(true);
  };

  const handleAction = async () => {
    try {
      // If in test mode, simulate the action without calling the contract
      if (testMode) {
        switch (actionType) {
          case "pause":
            setIsPaused(true);
            toast({
              title: "🧪 Test Mode: Contract paused",
              description: "Simulated: All escrow operations are now paused",
            });
            break;
          case "unpause":
            setIsPaused(false);
            toast({
              title: "🧪 Test Mode: Contract unpaused",
              description: "Simulated: Escrow operations have been resumed",
            });
            break;
          case "withdraw":
            toast({
              title: "🧪 Test Mode: Tokens withdrawn",
              description: `Simulated: Withdrew ${withdrawData.amount} tokens from ${withdrawData.token}`,
            });
            break;
        }
        setDialogOpen(false);
        return;
      }

      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      switch (actionType) {
        case "pause":
          // Check if contract is already paused
          const currentPausedStatusForPause = await contract.call("paused");

          // Handle different possible return types - including Proxy objects
          let isPausedForPause = false;

          if (
            currentPausedStatusForPause === true ||
            currentPausedStatusForPause === "true" ||
            currentPausedStatusForPause === 1
          ) {
            isPausedForPause = true;
          } else if (
            currentPausedStatusForPause === false ||
            currentPausedStatusForPause === "false" ||
            currentPausedStatusForPause === 0
          ) {
            isPausedForPause = false;
          } else if (
            currentPausedStatusForPause &&
            typeof currentPausedStatusForPause === "object"
          ) {
            try {
              const pausedValue = currentPausedStatusForPause.toString();
              isPausedForPause = pausedValue === "true" || pausedValue === "1";
            } catch (e) {
              isPausedForPause = false;
            }
          }

          if (isPausedForPause) {
            toast({
              title: "Contract Already Paused",
              description: "The contract is already in a paused state",
              variant: "default",
            });
            return;
          }

          await contract.send("pause", "no-value");
          setIsPaused(true);
          toast({
            title: "Contract paused",
            description: "All escrow operations are now paused",
          });
          break;
        case "unpause":
          // Check if contract is already unpaused
          const currentPausedStatus = await contract.call("paused");

          // Handle different possible return types - including Proxy objects
          let isPaused = false;

          if (
            currentPausedStatus === true ||
            currentPausedStatus === "true" ||
            currentPausedStatus === 1
          ) {
            isPaused = true;
          } else if (
            currentPausedStatus === false ||
            currentPausedStatus === "false" ||
            currentPausedStatus === 0
          ) {
            isPaused = false;
          } else if (
            currentPausedStatus &&
            typeof currentPausedStatus === "object"
          ) {
            try {
              const pausedValue = currentPausedStatus.toString();
              isPaused = pausedValue === "true" || pausedValue === "1";
            } catch (e) {
              isPaused = false;
            }
          }

          if (!isPaused) {
            toast({
              title: "Contract Already Unpaused",
              description: "The contract is already in an active state",
              variant: "default",
            });
            return;
          }

          await contract.send("unpause", "no-value");
          setIsPaused(false);
          toast({
            title: "Contract unpaused",
            description: "Escrow operations have been resumed",
          });
          break;
        case "withdraw":
          await contract.send(
            "withdrawStuckTokens",
            "no-value",
            withdrawData.token,
            withdrawData.amount
          );
          toast({
            title: "Tokens withdrawn",
            description: `Successfully withdrew ${withdrawData.amount} tokens`,
          });
          setWithdrawData({ token: CONTRACTS.MOCK_ERC20, amount: "" });
          break;
      }

      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error.message || "Failed to perform admin action",
        variant: "destructive",
      });
    }
  };

  const getDialogContent = () => {
    const testModePrefix = testMode ? "🧪 Test Mode: " : "";
    const testModeSuffix = testMode ? " (Simulated)" : "";

    switch (actionType) {
      case "pause":
        return {
          title: `${testModePrefix}Pause Contract${testModeSuffix}`,
          description: testMode
            ? "This will simulate pausing all escrow operations. No real transaction will be sent."
            : "This will pause all escrow operations. Users will not be able to create new escrows or interact with existing ones until the contract is unpaused.",
          icon: Pause,
          confirmText: testMode ? "Simulate Pause" : "Pause Contract",
          variant: "destructive" as const,
        };
      case "unpause":
        return {
          title: `${testModePrefix}Unpause Contract${testModeSuffix}`,
          description: testMode
            ? "This will simulate resuming all escrow operations. No real transaction will be sent."
            : "This will resume all escrow operations. Users will be able to interact with escrows again.",
          icon: Play,
          confirmText: testMode ? "Simulate Unpause" : "Unpause Contract",
          variant: "default" as const,
        };
      case "withdraw":
        return {
          title: `${testModePrefix}Withdraw Stuck Tokens${testModeSuffix}`,
          description: testMode
            ? "This will simulate withdrawing tokens. No real transaction will be sent."
            : "Withdraw tokens that may be stuck in the contract. This should only be used in emergency situations.",
          icon: Download,
          confirmText: testMode ? "Simulate Withdraw" : "Withdraw Tokens",
          variant: "destructive" as const,
        };
      default:
        return {
          title: "",
          description: "",
          icon: Shield,
          confirmText: "Confirm",
          variant: "default" as const,
        };
    }
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <Card className="glass border-primary/20 p-12 text-center max-w-md">
          <Lock className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Wallet Not Connected</h2>
          <p className="text-muted-foreground mb-6">
            Please connect your wallet to access admin controls
          </p>
        </Card>
      </div>
    );
  }

  // Show loading state while checking admin status
  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <Card className="glass border-primary/20 p-12 text-center max-w-md">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4" />
          <h2 className="text-2xl font-bold mb-2">Checking Access...</h2>
          <p className="text-muted-foreground">Verifying admin permissions</p>
        </Card>
      </div>
    );
  }

  // Only show access denied after loading is complete
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <Card className="glass border-destructive/20 p-12 text-center max-w-md">
          <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            You do not have permission to access this page. Only the contract
            owner can access admin controls.
          </p>
          <div className="mt-6 p-4 bg-muted/50 rounded-lg text-left space-y-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Your wallet:</span>
              <br />
              <span className="font-mono">{wallet.address}</span>
            </p>
            {contractOwner && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Contract owner:</span>
                <br />
                <span className="font-mono">{contractOwner}</span>
              </p>
            )}
            <p className="text-xs text-amber-600 mt-4">
              💡 <span className="font-semibold">Tip:</span> Make sure you're
              connected with the wallet that deployed the SecureFlow contract.
              {/* Update the owner address in{" "} */}
              {/* <code className="bg-muted px-1 rounded">
                contexts/web3-context.tsx
              </code> */}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4" />
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  const dialogContent = getDialogContent();
  const Icon = dialogContent.icon;

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              {isOwner && (
                <Badge variant="default" className="gap-1">
                  <Shield className="h-3 w-3" />
                  Owner
                </Badge>
              )}
              {isArbiter && !isOwner && (
                <Badge variant="secondary" className="gap-1">
                  <Shield className="h-3 w-3" />
                  Arbiter
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isOwner
                ? "Full admin access - All functions available"
                : isArbiter
                ? "Arbiter access - Token management and dispute resolution"
                : ""}
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? "Refreshing..." : "Refresh Stats"}
          </Button>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-xl text-muted-foreground mb-8">
            Manage the SecureFlow escrow contract
          </p>

          {isPaused && (
            <Alert variant="destructive" className="mb-8">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Contract Paused</AlertTitle>
              <AlertDescription>
                All escrow operations are currently paused. Users cannot create
                or interact with escrows.
              </AlertDescription>
            </Alert>
          )}

          <Card className="glass border-primary/20 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold">Contract Status</h2>
                  {testMode && (
                    <Badge variant="secondary" className="gap-1">
                      🧪 Test Mode
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">Current State:</span>
                  {isPaused ? (
                    <Badge variant="destructive" className="gap-2">
                      <Pause className="h-3 w-3" />
                      Paused
                    </Badge>
                  ) : (
                    <Badge variant="default" className="gap-2">
                      <Play className="h-3 w-3" />
                      Active
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">
                  Contract Address
                </p>
                <p className="font-mono text-sm">
                  {CONTRACTS.SECUREFLOW_ESCROW.slice(0, 20)}...
                </p>
              </div>
            </div>
          </Card>

          <DisputeResolution onDisputeResolved={fetchContractStats} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Pause/Unpause - Only for Owner */}
            {isOwner && (
              <Card className="glass border-primary/20 p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    {isPaused ? (
                      <Play className="h-6 w-6 text-primary" />
                    ) : (
                      <Pause className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2">
                      {isPaused ? "Unpause Contract" : "Pause Contract"}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {isPaused
                        ? "Resume all escrow operations and allow users to interact with the contract"
                        : "Temporarily halt all escrow operations for maintenance or emergency situations"}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => openDialog(isPaused ? "unpause" : "pause")}
                  variant={isPaused ? "default" : "destructive"}
                  className="w-full gap-2"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4" />
                      Unpause Contract
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4" />
                      Pause Contract
                    </>
                  )}
                </Button>
              </Card>
            )}

            {/* Withdraw Stuck Tokens - Only for Owner */}
            {isOwner && (
              <Card className="glass border-primary/20 p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                    <Download className="h-6 w-6 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2">
                      Withdraw Stuck Tokens
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Emergency function to withdraw tokens that may be stuck in
                      the contract
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => openDialog("withdraw")}
                  variant="destructive"
                  className="w-full gap-2"
                >
                  <Download className="h-4 w-4" />
                  Withdraw Tokens
                </Button>
              </Card>
            )}
          </div>

          {/* Token Management & Arbiter Management - Side by Side */}
          <div
            className={`grid grid-cols-1 ${
              isOwner ? "lg:grid-cols-2" : "lg:grid-cols-1"
            } gap-6 mt-6`}
          >
            {/* Token Management Section - Available to Owner and Arbiters */}
            <Card className="glass border-primary/20 p-6">
              <h2 className="text-2xl font-bold mb-6">Token Management</h2>
              <div className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="tokenAddress" className="mb-2 block">
                      Token Address
                    </Label>
                    <Input
                      id="tokenAddress"
                      placeholder="0x..."
                      value={tokenAddress}
                      onChange={(e) => setTokenAddress(e.target.value)}
                      className="font-mono"
                      disabled={isWhitelisting}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Enter a token address to whitelist it. Only whitelisted
                      tokens can be used in escrows.
                    </p>
                  </div>
                  <Button
                    onClick={handleWhitelistToken}
                    disabled={isWhitelisting || !tokenAddress}
                    className="gap-2 w-full"
                  >
                    {isWhitelisting ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Whitelisting...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Whitelist Token
                      </>
                    )}
                  </Button>
                </div>
                <div className="pt-4 border-t border-muted/50">
                  <p className="text-sm font-semibold mb-2">Quick Actions:</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTokenAddress(CONTRACTS.CUSD_MAINNET)}
                    className="gap-2 w-full"
                  >
                    <Shield className="h-3 w-3" />
                    Whitelist cUSD ({CONTRACTS.CUSD_MAINNET.slice(0, 10)}...)
                  </Button>
                </div>
              </div>
            </Card>

            {/* Arbiter Management Section - Only for Owner */}
            {isOwner && (
              <Card className="glass border-primary/20 p-6">
                <h2 className="text-2xl font-bold mb-6">Arbiter Management</h2>
                <div className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="arbiterAddress" className="mb-2 block">
                        Arbiter Address
                      </Label>
                      <Input
                        id="arbiterAddress"
                        placeholder="0x..."
                        value={arbiterAddress}
                        onChange={(e) => setArbiterAddress(e.target.value)}
                        className="font-mono"
                        disabled={isAuthorizing}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Authorize an arbiter address. Only authorized arbiters
                        can be used in escrows.
                      </p>
                    </div>
                    <Button
                      onClick={handleAuthorizeArbiter}
                      disabled={isAuthorizing || !arbiterAddress}
                      className="gap-2 w-full"
                    >
                      {isAuthorizing ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Authorizing...
                        </>
                      ) : (
                        <>
                          <Shield className="h-4 w-4" />
                          Authorize Arbiter
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="pt-4 border-t border-muted/50">
                    <p className="text-sm font-semibold mb-2">Quick Actions:</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setArbiterAddress(wallet.address || "")}
                      className="gap-2 w-full"
                      disabled={!wallet.address}
                    >
                      <Shield className="h-3 w-3" />
                      Authorize Default Arbiter (Your Wallet)
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>

          <Card className="glass border-primary/20 p-6">
            <h2 className="text-2xl font-bold mb-6">Contract Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Owner Address
                </Label>
                <p className="font-mono text-sm bg-muted/50 p-3 rounded-lg">
                  {contractOwner || wallet.address}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Connected Wallet
                </Label>
                <p className="font-mono text-sm bg-muted/50 p-3 rounded-lg">
                  {wallet.address}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Contract Address
                </Label>
                <p className="font-mono text-sm bg-muted/50 p-3 rounded-lg">
                  {CONTRACTS.SECUREFLOW_ESCROW}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Network
                </Label>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">
                  Celo Mainnet
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Chain ID
                </Label>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">42220</p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Platform Fee
                </Label>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">
                  {contractStats.platformFeeBP}% (
                  {(contractStats.platformFeeBP / 100).toFixed(2)}%)
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Total Escrows
                </Label>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">
                  {contractStats.totalEscrows}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Authorized Arbiters
                </Label>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">
                  {contractStats.authorizedArbiters}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground mb-2 block">
                  Whitelisted Tokens
                </Label>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">
                  {contractStats.whitelistedTokens}
                </p>
              </div>
            </div>
          </Card>

          <Alert className="mt-8">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Admin Privileges</AlertTitle>
            <AlertDescription>
              These controls have significant impact on the contract and all
              users. Use them responsibly and only when necessary. All actions
              are recorded on the blockchain.
            </AlertDescription>
          </Alert>
        </motion.div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full ${
                  dialogContent.variant === "destructive"
                    ? "bg-destructive/10"
                    : "bg-primary/10"
                }`}
              >
                <Icon
                  className={`h-6 w-6 ${
                    dialogContent.variant === "destructive"
                      ? "text-destructive"
                      : "text-primary"
                  }`}
                />
              </div>
              <DialogTitle className="text-2xl">
                {dialogContent.title}
              </DialogTitle>
            </div>
            <DialogDescription className="text-base leading-relaxed">
              {dialogContent.description}
            </DialogDescription>
          </DialogHeader>

          {actionType === "withdraw" && (
            <div className="space-y-4 my-4">
              <div className="space-y-2">
                <Label htmlFor="token">Token Address</Label>
                <Input
                  id="token"
                  placeholder="0x..."
                  value={withdrawData.token}
                  onChange={(e) =>
                    setWithdrawData({ ...withdrawData, token: e.target.value })
                  }
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="1000"
                  value={withdrawData.amount}
                  onChange={(e) =>
                    setWithdrawData({ ...withdrawData, amount: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          <Alert
            variant={
              dialogContent.variant === "destructive"
                ? "destructive"
                : "default"
            }
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This action will be recorded on the blockchain and cannot be
              undone.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAction} variant={dialogContent.variant}>
              {dialogContent.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
