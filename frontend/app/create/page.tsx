"use client";

// Force dynamic rendering to prevent SSR issues with AppKit
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useWeb3 } from "@/contexts/web3-context";
import { useSmartAccount } from "@/contexts/smart-account-context";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CONTRACTS, ZERO_ADDRESS, CELO_MAINNET } from "@/lib/web3/config";
import { SECUREFLOW_ABI, ERC20_ABI } from "@/lib/web3/abis";
import { useRouter } from "next/navigation";
import { ProjectDetailsStep } from "@/components/create/project-details-step";
import { MilestonesStep } from "@/components/create/milestones-step";
import { ReviewStep } from "@/components/create/review-step";

interface Milestone {
  description: string;
  amount: string;
}

export default function CreateEscrowPage() {
  const router = useRouter();
  const { wallet, getContract, switchToCelo } = useWeb3();
  const { executeTransaction, isSmartAccountReady } = useSmartAccount();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAIWriter, setShowAIWriter] = useState(false);
  const [currentMilestoneIndex, setCurrentMilestoneIndex] = useState<
    number | null
  >(null);
  const [useNativeToken, setUseNativeToken] = useState(false);
  const [isOpenJob, setIsOpenJob] = useState(false);
  const [isContractPaused, setIsContractPaused] = useState(false);
  const [isOnCorrectNetwork, setIsOnCorrectNetwork] = useState(true);
  const [whitelistedTokens, setWhitelistedTokens] = useState<
    { address: string; name?: string; symbol?: string }[]
  >([]);
  // Cache token metadata to avoid refetching on re-renders
  const tokenMetadataCache = useRef<
    Map<string, { name: string; symbol: string }>
  >(new Map());
  const [errors, setErrors] = useState<{
    projectTitle?: string;
    projectDescription?: string;
    duration?: string;
    totalBudget?: string;
    beneficiary?: string;
    tokenAddress?: string;
    milestones?: string;
    totalMismatch?: string;
  }>({});

  useEffect(() => {
    checkContractPauseStatus();
    checkNetworkStatus();
    fetchWhitelistedTokens();
  }, [wallet.chainId]);

  const checkNetworkStatus = async () => {
    if (!wallet.isConnected) return;

    try {
      const currentChainId = await window.ethereum.request({
        method: "eth_chainId",
      });
      const targetChainId = CELO_MAINNET.chainId; // Somnia Dream Testnet

      setIsOnCorrectNetwork(
        currentChainId.toLowerCase() === targetChainId.toLowerCase()
      );
    } catch (error) {
      setIsOnCorrectNetwork(false);
    }
  };

  const checkContractPauseStatus = async () => {
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      const paused = await contract.call("paused");

      let isPaused = false;

      // Use the same robust parsing logic as admin page
      if (paused === true || paused === "true" || paused === 1) {
        isPaused = true;
      } else if (paused === false || paused === "false" || paused === 0) {
        isPaused = false;
      } else if (paused && typeof paused === "object") {
        try {
          const pausedValue = paused.toString();
          isPaused = pausedValue === "true" || pausedValue === "1";
        } catch (e) {
          isPaused = false; // Default to not paused
        }
      }

      setIsContractPaused(isPaused);
    } catch (error) {
      setIsContractPaused(false);
    }
  };

  const fetchWhitelistedTokens = async () => {
    try {
      const { ethers } = await import("ethers");

      // Known token mappings (use lowercase keys)
      const TOKEN_INFO: { [key: string]: { name: string; symbol: string } } = {
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
          name: "USD Coin",
          symbol: "USDC",
        },
        // GoodDollar (G$) on Celo
        // Official address: 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A
        ...(CONTRACTS.GDOLLAR_CELO && CONTRACTS.GDOLLAR_CELO !== ZERO_ADDRESS
          ? {
              [CONTRACTS.GDOLLAR_CELO.toLowerCase()]: {
                name: "GoodDollar",
                symbol: "G$",
              },
            }
          : {}),
      };

      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      // Load cached tokens from localStorage (shared with admin page)
      let cachedTokens: string[] = [];
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("secureflow_whitelisted_tokens");
        if (stored) {
          try {
            cachedTokens = JSON.parse(stored);
            console.log("📋 Loaded cached tokens:", cachedTokens);

            // Show cached tokens immediately while we fetch/verify in background
            if (cachedTokens.length > 0) {
              // Quick metadata fetch for cached tokens
              const provider = new ethers.JsonRpcProvider(
                CELO_MAINNET.rpcUrls[0]
              );
              const ERC20_ABI = [
                "function name() view returns (string)",
                "function symbol() view returns (string)",
              ];

              const quickTokens = await Promise.all(
                cachedTokens.slice(0, 5).map(async (address: string) => {
                  const addrLower = address.toLowerCase();
                  // Check cache
                  const cached = tokenMetadataCache.current.get(addrLower);
                  if (cached) {
                    return {
                      address: addrLower,
                      name: cached.name,
                      symbol: cached.symbol,
                    };
                  }
                  // Check hardcoded
                  if (TOKEN_INFO[addrLower]) {
                    return {
                      address: addrLower,
                      name: TOKEN_INFO[addrLower].name,
                      symbol: TOKEN_INFO[addrLower].symbol,
                    };
                  }
                  // Quick fetch
                  try {
                    const tokenContract = new ethers.Contract(
                      address,
                      ERC20_ABI,
                      provider
                    );
                    const [name, symbol] = (await Promise.race([
                      Promise.all([
                        tokenContract.name(),
                        tokenContract.symbol(),
                      ]),
                      new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Timeout")), 3000)
                      ),
                    ])) as [string, string];
                    return { address: addrLower, name, symbol };
                  } catch {
                    return {
                      address: addrLower,
                      name: undefined,
                      symbol: undefined,
                    };
                  }
                })
              );
              setWhitelistedTokens(quickTokens.filter((t) => t.address));
            }
          } catch (e) {
            console.warn("Failed to parse cached tokens:", e);
          }
        }
      }

      // Start with cached tokens, verify them directly (FAST)
      let allWhitelistedTokens: string[] = [];

      // Verify cached tokens directly - much faster than event queries
      if (cachedTokens.length > 0) {
        console.log("⚡ Fast path: Verifying cached tokens directly...");
        const verificationResults = await Promise.all(
          cachedTokens.map(async (token) => {
            try {
              const isWhitelisted = await contract.call(
                "whitelistedTokens",
                token
              );
              return isWhitelisted ? token.toLowerCase() : null;
            } catch {
              return null;
            }
          })
        );
        allWhitelistedTokens = verificationResults.filter(
          (t): t is string => t !== null
        );
        console.log(`✅ Verified ${allWhitelistedTokens.length} cached tokens`);
      }

      // ALWAYS check recent events to discover newly whitelisted tokens
      // This catches tokens that were just whitelisted but not yet in cache
      console.log("🔍 Checking recent events for newly whitelisted tokens...");

      try {
        const provider = new ethers.JsonRpcProvider(CELO_MAINNET.rpcUrls[0]);
        const contractWithProvider = new ethers.Contract(
          CONTRACTS.SECUREFLOW_ESCROW,
          SECUREFLOW_ABI,
          provider
        );

        const currentBlock = await provider.getBlockNumber();
        // Query from block 0 to get ALL tokens (like admin page does)
        // This ensures we find tokens whitelisted at any time
        const fromBlock = 0;

        console.log(
          `📡 Querying recent events (blocks ${fromBlock} to ${currentBlock})...`
        );

        // Query events in chunks with timeout to avoid hanging (like admin page)
        const chunkSize = 10000; // 10k blocks per chunk (same as admin page)
        let whitelistedEvents: any[] = [];
        let blacklistedEvents: any[] = [];

        console.log(
          `📡 Querying events from block ${fromBlock} to ${currentBlock} in chunks of ${chunkSize}...`
        );

        // Query in chunks with timeout protection
        for (
          let startBlock = fromBlock;
          startBlock <= currentBlock;
          startBlock += chunkSize
        ) {
          const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
          try {
            const chunkQueryPromise = Promise.all([
              contractWithProvider
                .queryFilter(
                  contractWithProvider.filters.TokenWhitelisted(),
                  startBlock,
                  endBlock
                )
                .catch(() => []),
              contractWithProvider
                .queryFilter(
                  contractWithProvider.filters.TokenBlacklisted(),
                  startBlock,
                  endBlock
                )
                .catch(() => []),
            ]);

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Chunk timeout")), 5000)
            );

            const [whitelisted, blacklisted] = (await Promise.race([
              chunkQueryPromise,
              timeoutPromise,
            ])) as [any[], any[]];

            whitelistedEvents.push(...whitelisted);
            blacklistedEvents.push(...blacklisted);

            if (whitelisted.length > 0 || blacklisted.length > 0) {
              console.log(
                `  ✓ Blocks ${startBlock}-${endBlock}: ${whitelisted.length} whitelisted, ${blacklisted.length} blacklisted`
              );
            }
          } catch (error: any) {
            // Skip this chunk if it times out or fails, but continue with next chunks
            console.warn(
              `  ⚠️ Skipped chunk ${startBlock}-${endBlock}:`,
              error.message
            );
            // Don't break - continue with next chunks
            continue;
          }
        }

        console.log(
          `📊 Total events found: ${whitelistedEvents.length} whitelisted, ${blacklistedEvents.length} blacklisted`
        );

        // Extract token addresses from events (matching admin page logic)
        const whitelisted = new Set<string>();
        whitelistedEvents.forEach((event: any) => {
          // Match admin page parsing: event.args && event.args.token
          if (event.args && event.args.token) {
            const addr = event.args.token.toString().toLowerCase();
            if (addr && addr !== ZERO_ADDRESS.toLowerCase()) {
              whitelisted.add(addr);
            }
          } else if (event.args && event.args[0]) {
            // Fallback for different event format
            const addr = event.args[0].toString().toLowerCase();
            if (addr && addr !== ZERO_ADDRESS.toLowerCase()) {
              whitelisted.add(addr);
            }
          }
        });
        blacklistedEvents.forEach((event: any) => {
          // Match admin page parsing
          if (event.args && event.args.token) {
            whitelisted.delete(event.args.token.toString().toLowerCase());
          } else if (event.args && event.args[0]) {
            whitelisted.delete(event.args[0].toString().toLowerCase());
          }
        });

        const tokensFromEvents = Array.from(whitelisted);
        console.log(
          `📋 Found ${tokensFromEvents.length} tokens from events (from block ${fromBlock} to ${currentBlock}):`,
          tokensFromEvents
        );

        // If we found 0 tokens from events but have cached tokens,
        // it might mean events aren't loading. Double-check localStorage.
        if (tokensFromEvents.length === 0 && cachedTokens.length > 0) {
          console.log(
            "⚠️ No tokens found in events, but we have cached tokens. Verifying cached tokens..."
          );
        }

        // Merge with cached/verified tokens
        const allTokensToCheck = [
          ...new Set([...allWhitelistedTokens, ...tokensFromEvents]),
        ];

        console.log(
          `🔍 Total tokens to verify: ${allTokensToCheck.length}`,
          allTokensToCheck
        );

        // Verify ALL tokens (cached + newly discovered)
        const verificationResults = await Promise.all(
          allTokensToCheck.map(async (token) => {
            try {
              const isWhitelisted = await contract.call(
                "whitelistedTokens",
                token
              );
              return isWhitelisted ? token.toLowerCase() : null;
            } catch {
              return null;
            }
          })
        );

        allWhitelistedTokens = verificationResults.filter(
          (t): t is string => t !== null
        );
        console.log(
          `✅ Verified ${allWhitelistedTokens.length} total whitelisted tokens:`,
          allWhitelistedTokens
        );

        // Update localStorage with all verified tokens
        if (typeof window !== "undefined" && allWhitelistedTokens.length > 0) {
          localStorage.setItem(
            "secureflow_whitelisted_tokens",
            JSON.stringify(allWhitelistedTokens)
          );
          console.log("💾 Updated localStorage with all verified tokens");
        }
      } catch (error) {
        console.warn("Recent event check failed:", error);
        // Continue with cached tokens if event query fails
      }

      // Update localStorage cache with verified tokens (already done above if events succeeded)
      if (typeof window !== "undefined" && allWhitelistedTokens.length > 0) {
        localStorage.setItem(
          "secureflow_whitelisted_tokens",
          JSON.stringify(allWhitelistedTokens)
        );
        console.log("💾 Updated localStorage cache with verified tokens");
      }

      // Remove duplicates and filter out zero address
      const uniqueTokens = [...new Set(allWhitelistedTokens)].filter(
        (t) => t && t !== "0x0000000000000000000000000000000000000000"
      );

      if (uniqueTokens.length === 0) {
        setWhitelistedTokens([]);
        return;
      }

      // Fetch token metadata in parallel with timeout
      const provider = new ethers.JsonRpcProvider(CELO_MAINNET.rpcUrls[0]);
      const ERC20_ABI = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
      ];

      console.log("📦 Fetching metadata for tokens:", uniqueTokens);

      const tokensWithInfo = await Promise.all(
        uniqueTokens.map(async (address) => {
          const addressLower = address.toLowerCase();

          // Check cache first
          const cached = tokenMetadataCache.current.get(addressLower);
          if (cached) {
            return {
              address: addressLower,
              name: cached.name,
              symbol: cached.symbol,
            };
          }

          // Use hardcoded info if available
          if (TOKEN_INFO[addressLower]) {
            const info = {
              address: addressLower,
              name: TOKEN_INFO[addressLower].name,
              symbol: TOKEN_INFO[addressLower].symbol,
            };
            // Cache it
            tokenMetadataCache.current.set(addressLower, {
              name: info.name,
              symbol: info.symbol,
            });
            return info;
          }

          // Fetch from blockchain with timeout
          try {
            const tokenContract = new ethers.Contract(
              address,
              ERC20_ABI,
              provider
            );

            // Try to fetch name and symbol separately with individual timeouts
            let name: string | null = null;
            let symbol: string | null = null;

            try {
              name = await Promise.race([
                tokenContract.name(),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error("Name timeout")), 5000)
                ),
              ]);
            } catch (nameError) {
              // Silently fail - will use fallback
            }

            try {
              symbol = await Promise.race([
                tokenContract.symbol(),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error("Symbol timeout")), 5000)
                ),
              ]);
            } catch (symbolError) {
              // Silently fail - will use fallback
            }

            // If we got at least one, use it; otherwise use address
            const result = {
              address: addressLower,
              name:
                name ||
                `${addressLower.slice(0, 6)}...${addressLower.slice(-4)}`,
              symbol: symbol || "???",
            };

            // Cache successful results (only if we got both name and symbol)
            if (name && symbol) {
              tokenMetadataCache.current.set(addressLower, { name, symbol });
            }

            return result;
          } catch (error) {
            // If contract call completely fails, use address as fallback
            // Don't cache failures
            return {
              address: addressLower,
              name: `${addressLower.slice(0, 6)}...${addressLower.slice(-4)}`,
              symbol: "???",
            };
          }
        })
      );

      console.log("✅ Tokens with info:", tokensWithInfo);

      // Remove any duplicates by address (case-insensitive)
      const seen = new Set<string>();
      const deduplicated = tokensWithInfo.filter((token) => {
        const key = token.address.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      setWhitelistedTokens(deduplicated);
    } catch (error) {
      console.error("Failed to fetch whitelisted tokens:", error);
      setWhitelistedTokens([]);
    }
  };

  const [formData, setFormData] = useState({
    projectTitle: "",
    projectDescription: "",
    duration: "",
    totalBudget: "",
    beneficiary: "",
    token: CONTRACTS.MOCK_ERC20, // Default to deployed MockERC20
    useNativeToken: false,
    isOpenJob: false,
    milestones: [
      { description: "", amount: "" },
      { description: "", amount: "" },
    ] as Milestone[],
  });

  const commonTokens = [
    { name: "Native ETH", address: ZERO_ADDRESS, isNative: true },
    { name: "Custom ERC20", address: "", isNative: false },
  ];

  const addMilestone = () => {
    setFormData({
      ...formData,
      milestones: [...formData.milestones, { description: "", amount: "" }],
    });
  };

  const removeMilestone = (index: number) => {
    if (formData.milestones.length <= 1) {
      toast({
        title: "Cannot remove",
        description: "At least one milestone is required",
        variant: "destructive",
      });
      return;
    }
    const newMilestones = formData.milestones.filter((_, i) => i !== index);
    setFormData({ ...formData, milestones: newMilestones });
  };

  const updateMilestone = (
    index: number,
    field: keyof Milestone,
    value: string
  ) => {
    const newMilestones = [...formData.milestones];
    newMilestones[index][field] = value;
    setFormData({ ...formData, milestones: newMilestones });
  };

  const openAIWriter = (index: number) => {
    setCurrentMilestoneIndex(index);
    setShowAIWriter(true);
  };

  const handleAISelect = (description: string) => {
    if (currentMilestoneIndex !== null) {
      updateMilestone(currentMilestoneIndex, "description", description);
      setShowAIWriter(false);
      setCurrentMilestoneIndex(null);
    }
  };

  const calculateTotalMilestones = () => {
    return formData.milestones.reduce(
      (sum, m) => sum + (Number.parseFloat(m.amount) || 0),
      0
    );
  };

  const validateStep = () => {
    const newErrors: typeof errors = {};
    let hasErrors = false;

    if (step === 1) {
      // Validate all required fields for step 1
      if (!formData.projectTitle || formData.projectTitle.length < 3) {
        newErrors.projectTitle = "Project title must be at least 3 characters";
        hasErrors = true;
      }

      if (
        !formData.projectDescription ||
        formData.projectDescription.length < 50
      ) {
        newErrors.projectDescription =
          "Project description must be at least 50 characters";
        hasErrors = true;
      }

      if (
        !formData.duration ||
        Number(formData.duration) < 1 ||
        Number(formData.duration) > 365
      ) {
        newErrors.duration = "Duration must be between 1 and 365 days";
        hasErrors = true;
      }

      if (!formData.totalBudget || Number(formData.totalBudget) < 0.01) {
        newErrors.totalBudget = "Total budget must be at least 0.01 tokens";
        hasErrors = true;
      }

      if (
        !formData.isOpenJob &&
        (!formData.beneficiary ||
          !/^0x[a-fA-F0-9]{40}$/.test(formData.beneficiary))
      ) {
        newErrors.beneficiary =
          "Valid beneficiary address is required for direct escrow";
        hasErrors = true;
      }

      if (
        !formData.useNativeToken &&
        (!formData.token || !/^0x[a-fA-F0-9]{40}$/.test(formData.token))
      ) {
        newErrors.tokenAddress =
          "Valid token address is required for custom ERC20 tokens";
        hasErrors = true;
      }
    } else if (step === 2) {
      const total = calculateTotalMilestones();
      const targetTotal = Number.parseFloat(formData.totalBudget) || 0;

      if (formData.milestones.some((m) => !m.description || !m.amount)) {
        newErrors.milestones = "Please fill in all milestone details";
        hasErrors = true;
      }

      if (Math.abs(total - targetTotal) > 0.01) {
        newErrors.totalMismatch = `Milestone amounts (${total}) must equal total amount (${targetTotal})`;
        hasErrors = true;
      }
    }

    setErrors(newErrors);
    return !hasErrors;
  };

  const clearErrors = () => {
    setErrors({});
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const validateForm = () => {
    const errors: string[] = [];

    // Validate project title
    if (!formData.projectTitle || formData.projectTitle.length < 3) {
      errors.push("Project title must be at least 3 characters long");
    }

    // Validate project description
    if (
      !formData.projectDescription ||
      formData.projectDescription.length < 50
    ) {
      errors.push("Project description must be at least 50 characters long");
    }

    // Validate duration
    if (
      !formData.duration ||
      Number(formData.duration) < 1 ||
      Number(formData.duration) > 365
    ) {
      errors.push("Duration must be between 1 and 365 days");
    }

    // Validate total budget
    if (!formData.totalBudget || Number(formData.totalBudget) < 0.01) {
      errors.push("Total budget must be at least 0.01 tokens");
    }

    // Validate beneficiary (only if not open job)
    if (!formData.isOpenJob) {
      if (!formData.beneficiary) {
        errors.push("Beneficiary address is required for direct escrow");
      } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.beneficiary)) {
        errors.push("Beneficiary address must be a valid Somnia address");
      }
    }

    // Validate milestones
    if (formData.milestones.length === 0) {
      errors.push("At least one milestone is required");
    }

    for (let i = 0; i < formData.milestones.length; i++) {
      const milestone = formData.milestones[i];
      if (!milestone.description || milestone.description.length < 10) {
        errors.push(
          `Milestone ${i + 1} description must be at least 10 characters long`
        );
      }
      if (!milestone.amount || Number(milestone.amount) < 0.01) {
        errors.push(`Milestone ${i + 1} amount must be at least 0.01 tokens`);
      }
    }

    // Validate milestone amounts sum
    const totalMilestoneAmount = formData.milestones.reduce(
      (sum, milestone) => sum + Number(milestone.amount || 0),
      0
    );
    if (Math.abs(totalMilestoneAmount - Number(formData.totalBudget)) > 0.01) {
      errors.push("Total milestone amounts must equal the total budget");
    }

    return errors;
  };

  const handleSubmit = async () => {
    if (!wallet.isConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to create an escrow",
        variant: "destructive",
      });
      return;
    }

    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      toast({
        title: "Form validation failed",
        description: validationErrors.join(", "),
        variant: "destructive",
      });
      return;
    }

    // Allow both native tokens (ZERO_ADDRESS) and ERC20 tokens
    if (!formData.token) {
      toast({
        title: "Invalid token address",
        description: "Please select a token type",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Native tokens (ZERO_ADDRESS) are always allowed - skip ERC20 checks
      // Normalize addresses for comparison (case-insensitive)
      const normalizedToken = formData.token?.toLowerCase() || "";
      const normalizedZero = ZERO_ADDRESS.toLowerCase();
      const isNativeToken =
        normalizedToken === normalizedZero || formData.useNativeToken === true;

      console.log("Token type check:", {
        tokenAddress: formData.token,
        normalizedToken: normalizedToken,
        normalizedZero: normalizedZero,
        useNativeToken: formData.useNativeToken,
        isNativeToken: isNativeToken,
        ZERO_ADDRESS: ZERO_ADDRESS,
      });

      if (!isNativeToken) {
        const tokenContract = getContract(formData.token, ERC20_ABI);

        // Test if token contract is working and get decimals
        let tokenDecimals = 18; // Default to 18
        let tokenSymbol = "TOKEN"; // Default symbol for error messages
        try {
          const tokenName = await tokenContract.call("name");
          tokenSymbol = (await tokenContract.call("symbol")) || "TOKEN";
          const decimals = await tokenContract.call("decimals");
          tokenDecimals = Number(decimals) || 18;

          console.log("Token info:", {
            tokenName,
            tokenSymbol,
            decimals: tokenDecimals,
            tokenAddress: formData.token,
          });

          // Verify token is whitelisted (required check for ERC20 tokens only)
          // Native tokens (ZERO_ADDRESS) are always allowed by the contract
          try {
            const escrowContract = getContract(
              CONTRACTS.SECUREFLOW_ESCROW,
              SECUREFLOW_ABI
            );
            const isWhitelisted = await escrowContract.call(
              "whitelistedTokens",
              formData.token
            );
            console.log("Token whitelist status:", isWhitelisted);
            if (!isWhitelisted) {
              throw new Error(
                `Token ${formData.token.slice(0, 10)}...${formData.token.slice(
                  -8
                )} is not whitelisted. Please whitelist this token in the Admin page before creating an escrow.`
              );
            }
          } catch (whitelistError: any) {
            if (whitelistError.message?.includes("not whitelisted")) {
              throw whitelistError;
            }
            console.warn("Could not check whitelist status:", whitelistError);
            // If we can't check, show warning but allow to proceed
            toast({
              title: "Warning",
              description:
                "Could not verify token whitelist status. Please ensure the token is whitelisted.",
              variant: "default",
            });
          }
        } catch (tokenError: any) {
          console.error("Token contract error:", tokenError);
          throw new Error(
            `Token contract error: ${
              tokenError.message ||
              "Please check the token address and ensure you're on Somnia Dream Testnet"
            }`
          );
        }

        // Calculate total amount using actual token decimals
        const totalAmountInWei = BigInt(
          Math.floor(
            Number.parseFloat(formData.totalBudget) * 10 ** tokenDecimals
          )
        ).toString();

        // Check token balance first
        try {
          // Ensure wallet address is checksummed
          if (!wallet.address) {
            throw new Error("Wallet address is not available");
          }
          const { ethers } = await import("ethers");
          const checksummedAddress = ethers.getAddress(wallet.address);
          const checksummedTokenAddress = ethers.getAddress(formData.token);

          console.log("Checking balance for:", {
            originalAddress: wallet.address,
            checksummedAddress: checksummedAddress,
            tokenAddress: formData.token,
            checksummedTokenAddress: checksummedTokenAddress,
          });

          // Try multiple methods to get balance - wallet provider is most reliable
          let balance: any = null;
          let balanceSource = "";

          // Method 1: Direct wallet provider call (most reliable)
          try {
            if (typeof window !== "undefined" && window.ethereum) {
              const walletProvider = new ethers.BrowserProvider(
                window.ethereum
              );
              const tokenContractDirect = new ethers.Contract(
                checksummedTokenAddress,
                ERC20_ABI,
                walletProvider
              );
              balance = await tokenContractDirect.balanceOf(checksummedAddress);
              balanceSource = "walletProvider";
              console.log(
                "✅ Balance from wallet provider:",
                balance.toString()
              );
            }
          } catch (walletError: any) {
            console.warn(
              "⚠️ Wallet provider balance check failed:",
              walletError.message
            );
          }

          // Method 2: Try getContract call (fallback)
          if (balance === null) {
            try {
              const fallbackBalance = await tokenContract.call(
                "balanceOf",
                checksummedAddress
              );
              if (fallbackBalance !== null && fallbackBalance !== undefined) {
                balance = fallbackBalance;
                balanceSource = "getContract";
                console.log(
                  "✅ Balance from getContract:",
                  balance?.toString()
                );
              }
            } catch (contractError: any) {
              console.warn(
                "⚠️ getContract balance check failed:",
                contractError.message
              );
            }
          }

          // Method 3: Try direct RPC call as last resort
          if (balance === null) {
            try {
              const rpcProvider = new ethers.JsonRpcProvider(
                CELO_MAINNET.rpcUrls[0]
              );
              const tokenContractRPC = new ethers.Contract(
                checksummedTokenAddress,
                ERC20_ABI,
                rpcProvider
              );
              const rpcBalance = await tokenContractRPC.balanceOf(
                checksummedAddress
              );
              if (rpcBalance !== null && rpcBalance !== undefined) {
                balance = rpcBalance;
                balanceSource = "directRPC";
                console.log("✅ Balance from direct RPC:", balance.toString());
              }
            } catch (rpcError: any) {
              console.warn(
                "⚠️ Direct RPC balance check failed:",
                rpcError.message
              );
            }
          }

          if (balance === null || balance === undefined) {
            throw new Error(
              `Failed to retrieve ${tokenSymbol} token balance. Please check your wallet connection and network.`
            );
          }

          // Convert balance to BigInt if it's a string or number
          const balanceBigInt =
            typeof balance === "bigint" ? balance : BigInt(balance.toString());
          const totalAmountBigInt = BigInt(totalAmountInWei);
          const divisor = BigInt(10 ** tokenDecimals);

          console.log("Balance check result:", {
            balanceSource: balanceSource,
            walletAddress: checksummedAddress,
            tokenAddress: checksummedTokenAddress,
            rawBalance: balance.toString(),
            balance: balanceBigInt.toString(),
            totalAmount: totalAmountBigInt.toString(),
            balanceFormatted: (Number(balanceBigInt) / Number(divisor)).toFixed(
              4
            ),
            totalAmountFormatted: (
              Number(totalAmountBigInt) / Number(divisor)
            ).toFixed(4),
            decimals: tokenDecimals,
          });

          if (balanceBigInt < totalAmountBigInt) {
            const balanceFormatted = Number(balanceBigInt) / Number(divisor);
            const totalAmountFormatted =
              Number(totalAmountBigInt) / Number(divisor);
            throw new Error(
              `Insufficient ${tokenSymbol} balance! You have ${balanceFormatted.toFixed(
                4
              )} ${tokenSymbol} but need ${totalAmountFormatted.toFixed(
                4
              )} ${tokenSymbol}. Please add more ${tokenSymbol} tokens to your wallet.`
            );
          }
        } catch (balanceError: any) {
          console.error("Balance check error:", balanceError);
          if (balanceError.message?.includes("Insufficient token balance")) {
            throw balanceError;
          }
          throw new Error(
            `Failed to check token balance: ${
              balanceError.message ||
              "Please ensure you have enough tokens and are on Somnia Dream Testnet"
            }`
          );
        }

        try {
          const approvalTx = await tokenContract.send(
            "approve",
            "no-value", // No native value for ERC20 approval
            CONTRACTS.SECUREFLOW_ESCROW,
            totalAmountInWei
          );

          toast({
            title: "Approval submitted",
            description: "Waiting for token approval confirmation...",
          });

          // Wait for approval transaction to be mined
          let approvalReceipt;
          let approvalAttempts = 0;
          const maxApprovalAttempts = 30;

          while (approvalAttempts < maxApprovalAttempts) {
            try {
              approvalReceipt = await window.ethereum.request({
                method: "eth_getTransactionReceipt",
                params: [approvalTx],
              });

              if (approvalReceipt) {
                break;
              }
            } catch (error) {}

            await new Promise((resolve) => setTimeout(resolve, 2000));
            approvalAttempts++;
          }

          if (!approvalReceipt || approvalReceipt.status !== "0x1") {
            throw new Error(
              "Token approval transaction failed or was rejected"
            );
          }

          toast({
            title: "Token approved",
            description: "Token approval confirmed. Creating escrow...",
          });
        } catch (approvalError: any) {
          console.error("Approval error:", approvalError);
          throw new Error(
            `Token approval failed: ${
              approvalError.message || "Please try again"
            }`
          );
        }
      }

      const escrowContract = getContract(
        CONTRACTS.SECUREFLOW_ESCROW,
        SECUREFLOW_ABI
      );
      const milestoneDescriptions = formData.milestones.map(
        (m) => m.description
      );

      const beneficiaryAddress = isOpenJob
        ? "0x0000000000000000000000000000000000000000" // Zero address for open jobs
        : formData.beneficiary || "0x0000000000000000000000000000000000000000";

      let txHash;

      // Native tokens (ZERO_ADDRESS) are always whitelisted by default in the contract
      if (isNativeToken) {
        // Use createEscrowNative for native tokens
        console.log("Creating native token escrow (no whitelist check needed)");
        const totalAmountInWei = BigInt(
          Math.floor(Number.parseFloat(formData.totalBudget) * 10 ** 18)
        ).toString();

        // Check native token balance with multiple methods
        let balanceInWei: bigint | null = null;
        let balanceSource = "unknown";

        // Method 1: Try wallet provider (most reliable)
        if (
          typeof window !== "undefined" &&
          window.ethereum &&
          wallet.address
        ) {
          try {
            const { ethers } = await import("ethers");
            const checksummedAddress = ethers.getAddress(wallet.address);
            const walletProvider = new ethers.BrowserProvider(window.ethereum);
            balanceInWei = await walletProvider.getBalance(checksummedAddress);
            balanceSource = "walletProvider";
            console.log(
              `✅ ${CELO_MAINNET.nativeCurrency.symbol} balance from wallet provider:`,
              balanceInWei.toString()
            );
          } catch (walletError: any) {
            console.warn(
              "⚠️ Wallet provider balance check failed:",
              walletError.message
            );
          }
        }

        // Method 2: Try direct RPC call
        if (!balanceInWei && wallet.address) {
          try {
            const { ethers } = await import("ethers");
            const checksummedAddress = ethers.getAddress(wallet.address);
            const balance = await window.ethereum.request({
              method: "eth_getBalance",
              params: [checksummedAddress, "latest"],
            });
            balanceInWei = BigInt(balance);
            balanceSource = "eth_getBalance";
            console.log(
              `✅ ${CELO_MAINNET.nativeCurrency.symbol} balance from eth_getBalance:`,
              balanceInWei.toString()
            );
          } catch (rpcError: any) {
            console.warn("⚠️ eth_getBalance failed:", rpcError.message);
          }
        }

        // Method 3: Try direct RPC provider
        if (!balanceInWei && wallet.address) {
          try {
            const { ethers } = await import("ethers");
            const checksummedAddress = ethers.getAddress(wallet.address);
            const provider = new ethers.JsonRpcProvider(
              CELO_MAINNET.rpcUrls[0]
            );
            balanceInWei = await provider.getBalance(checksummedAddress);
            balanceSource = "directRPC";
            console.log(
              `✅ ${CELO_MAINNET.nativeCurrency.symbol} balance from direct RPC:`,
              balanceInWei.toString()
            );
          } catch (directRpcError: any) {
            console.warn(
              "⚠️ Direct RPC balance check failed:",
              directRpcError.message
            );
          }
        }

        if (!balanceInWei) {
          throw new Error(
            `Failed to retrieve ${CELO_MAINNET.nativeCurrency.symbol} balance from all methods. Please check your wallet connection and network.`
          );
        }

        const requiredAmount = BigInt(totalAmountInWei);
        const balanceFormatted = Number(balanceInWei) / 10 ** 18;
        const requiredFormatted = Number(requiredAmount) / 10 ** 18;
        const nativeSymbol = CELO_MAINNET.nativeCurrency.symbol;

        console.log(`${nativeSymbol} Balance check:`, {
          balanceSource,
          rawBalance: balanceInWei.toString(),
          balanceFormatted: balanceFormatted.toFixed(4),
          requiredAmount: requiredAmount.toString(),
          requiredFormatted: requiredFormatted.toFixed(4),
        });

        if (balanceInWei < requiredAmount) {
          throw new Error(
            `Insufficient ${nativeSymbol} balance. You have ${balanceFormatted.toFixed(
              4
            )} ${nativeSymbol} but need ${requiredFormatted.toFixed(
              4
            )} ${nativeSymbol}.`
          );
        }

        // Convert milestone amounts to wei (BigInt)
        const milestoneAmountsInWei = formData.milestones.map((m) =>
          BigInt(Math.floor(Number.parseFloat(m.amount) * 10 ** 18)).toString()
        );

        const arbiters = ["0x3be7fbbdbc73fc4731d60ef09c4ba1a94dc58e41"]; // Default arbiter
        const requiredConfirmations = 1;

        // Convert duration from days to seconds
        const durationInSeconds = Number(formData.duration) * 24 * 60 * 60;

        // Try to estimate gas first with retry logic
        let gasEstimate;
        let gasEstimateAttempts = 0;
        const maxGasEstimateAttempts = 3;

        while (gasEstimateAttempts < maxGasEstimateAttempts) {
          try {
            gasEstimate = await escrowContract.estimateGas(
              "createEscrowNative",
              totalAmountInWei, // msg.value in wei
              beneficiaryAddress,
              arbiters,
              requiredConfirmations,
              milestoneAmountsInWei,
              milestoneDescriptions,
              durationInSeconds,
              formData.projectTitle,
              formData.projectDescription
            );
            break;
          } catch (gasError) {
            gasEstimateAttempts++;

            if (gasEstimateAttempts >= maxGasEstimateAttempts) {
              gasEstimate = BigInt(500000); // Default gas limit
              break;
            }

            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        // Retry transaction with exponential backoff
        let txAttempts = 0;
        const maxTxAttempts = 3;

        while (txAttempts < maxTxAttempts) {
          try {
            // Check if we should use Smart Account for gasless transaction
            if (isSmartAccountReady) {
              // Use Smart Account for gasless escrow creation
              const { ethers } = await import("ethers");
              const iface = new ethers.Interface(SECUREFLOW_ABI);
              const data = iface.encodeFunctionData("createEscrowNative", [
                beneficiaryAddress, // beneficiary parameter
                arbiters, // arbiters parameter
                requiredConfirmations, // requiredConfirmations parameter
                milestoneAmountsInWei, // milestoneAmounts parameter (in wei)
                milestoneDescriptions, // milestoneDescriptions parameter
                durationInSeconds, // duration parameter (in seconds)
                formData.projectTitle, // projectTitle parameter
                formData.projectDescription, // projectDescription parameter
              ]);

              txHash = await executeTransaction(
                CONTRACTS.SECUREFLOW_ESCROW,
                data,
                (Number(totalAmountInWei) / 1e18).toString() // Convert wei to native token for value
              );

              toast({
                title: "Transaction Submitted",
                description:
                  "Your transaction has been submitted. Waiting for confirmation...",
              });
            } else {
              // Use regular transaction
              txHash = await escrowContract.send(
                "createEscrowNative",
                `0x${BigInt(totalAmountInWei).toString(16)}`, // Convert wei to hex for msg.value
                beneficiaryAddress, // beneficiary parameter
                arbiters, // arbiters parameter
                requiredConfirmations, // requiredConfirmations parameter
                milestoneAmountsInWei, // milestoneAmounts parameter (in wei)
                milestoneDescriptions, // milestoneDescriptions parameter
                durationInSeconds, // duration parameter (in seconds)
                formData.projectTitle, // projectTitle parameter
                formData.projectDescription // projectDescription parameter
              );

              toast({
                title: "Transaction Submitted",
                description:
                  "Your transaction has been submitted. Waiting for confirmation...",
              });
            }
            break;
          } catch (txError) {
            txAttempts++;

            if (txAttempts >= maxTxAttempts) {
              throw txError;
            }

            // Wait before retry with exponential backoff
            const waitTime = Math.pow(2, txAttempts) * 1000; // 2s, 4s, 8s
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      } else {
        // Use createEscrow for ERC20 tokens
        // Note: ERC20 tokens must be whitelisted (already checked above)
        console.log("Creating ERC20 escrow with token:", formData.token);
        const arbiters = ["0x3be7fbbdbc73fc4731d60ef09c4ba1a94dc58e41"]; // Default arbiter
        const requiredConfirmations = 1;

        // Convert milestone amounts to wei for ERC20 tokens
        const milestoneAmountsInWei = formData.milestones.map((m) =>
          BigInt(Math.floor(Number.parseFloat(m.amount) * 10 ** 18)).toString()
        );

        // Convert duration from days to seconds
        const durationInSeconds = Number(formData.duration) * 24 * 60 * 60;

        // Check if we should use Smart Account for gasless transaction
        if (isSmartAccountReady) {
          // Use Smart Account for gasless ERC20 escrow creation
          const { ethers } = await import("ethers");
          const iface = new ethers.Interface(SECUREFLOW_ABI);
          const data = iface.encodeFunctionData("createEscrow", [
            beneficiaryAddress, // beneficiary parameter
            arbiters, // arbiters parameter
            requiredConfirmations, // requiredConfirmations parameter
            milestoneAmountsInWei, // milestoneAmounts parameter (in wei)
            milestoneDescriptions, // milestoneDescriptions parameter
            formData.token, // token parameter
            durationInSeconds, // duration parameter (in seconds)
            formData.projectTitle, // projectTitle parameter
            formData.projectDescription, // projectDescription parameter
          ]);

          txHash = await executeTransaction(
            CONTRACTS.SECUREFLOW_ESCROW,
            data,
            "0" // No native token value for ERC20
          );

          toast({
            title: "Transaction Submitted",
            description:
              "Your ERC20 escrow transaction has been submitted. Waiting for confirmation...",
          });
        } else {
          // Use regular transaction
          txHash = await escrowContract.send(
            "createEscrow",
            "no-value", // No msg.value for ERC20
            beneficiaryAddress, // beneficiary parameter
            arbiters, // arbiters parameter
            requiredConfirmations, // requiredConfirmations parameter
            milestoneAmountsInWei, // milestoneAmounts parameter (in wei)
            milestoneDescriptions, // milestoneDescriptions parameter
            formData.token, // token parameter
            durationInSeconds, // duration parameter (in seconds)
            formData.projectTitle, // projectTitle parameter
            formData.projectDescription // projectDescription parameter
          );

          toast({
            title: "Transaction Submitted",
            description:
              "Your ERC20 escrow transaction has been submitted. Waiting for confirmation...",
          });
        }
      }

      // Wait for transaction confirmation
      // Note: Success toast is already shown in Smart Account/regular transaction logic above

      // For Smart Account transactions, we still need to wait for confirmation
      // but the Smart Account pays the gas fees
      if (isSmartAccountReady) {
        // Smart Account transactions are real but gasless for the user

        // Wait for real blockchain confirmation
        let receipt;
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute timeout

        while (attempts < maxAttempts) {
          try {
            receipt = await window.ethereum.request({
              method: "eth_getTransactionReceipt",
              params: [txHash],
            });

            if (receipt) {
              break;
            }
          } catch (error) {}

          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
          attempts++;
        }

        if (!receipt) {
          throw new Error(
            "Transaction timeout - please check the blockchain explorer"
          );
        }

        if (receipt.status === "0x1") {
          // Transaction successful
          toast({
            title: isOpenJob
              ? "✅ Job Posted Successfully!"
              : "✅ Escrow Created Successfully!",
            description: isOpenJob
              ? "Your job is now live with no gas fees! Freelancers can apply on the Browse Jobs page. Redirecting..."
              : "Your escrow has been created successfully with no gas fees! The freelancer can now start working. Redirecting...",
          });

          setTimeout(() => {
            router.push(isOpenJob ? "/jobs" : "/dashboard");
          }, 3000);
        } else {
          throw new Error("Transaction failed on blockchain");
        }
      } else {
        // For regular transactions, wait for blockchain confirmation
        let receipt;
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute timeout

        while (attempts < maxAttempts) {
          try {
            receipt = await window.ethereum.request({
              method: "eth_getTransactionReceipt",
              params: [txHash],
            });

            if (receipt) {
              break;
            }
          } catch (error) {}

          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
          attempts++;
        }

        if (!receipt) {
          throw new Error(
            "Transaction timeout - please check the blockchain explorer"
          );
        }

        if (receipt.status === "0x1") {
          // Transaction successful
          toast({
            title: isOpenJob
              ? "✅ Job Posted Successfully!"
              : "✅ Escrow Created Successfully!",
            description: isOpenJob
              ? "Your job is now live. Freelancers can apply on the Browse Jobs page. Redirecting..."
              : "Your escrow has been successfully created. Redirecting...",
          });

          setTimeout(() => {
            router.push(isOpenJob ? "/jobs" : "/dashboard");
          }, 3000);
        } else {
          // Transaction failed
          throw new Error("Transaction failed on blockchain");
        }
      }
    } catch (error: any) {
      let errorMessage = "Failed to create escrow";

      if (error.message?.includes("insufficient funds")) {
        errorMessage = "Insufficient funds. Please check your balance.";
      } else if (error.message?.includes("gas")) {
        errorMessage = "Gas estimation failed. Please try again.";
      } else if (error.message?.includes("revert")) {
        errorMessage = "Transaction reverted. Please check your parameters.";
      } else if (error.message?.includes("user rejected")) {
        errorMessage = "Transaction was rejected by user.";
      } else if (error.message?.includes("timeout")) {
        errorMessage = "Transaction timeout. Please try again.";
      } else if (error.message?.includes("Internal JSON-RPC error")) {
        errorMessage =
          "Network error occurred. Please try again - this usually works on the second attempt.";
      } else if (error.code === -32603) {
        errorMessage =
          "RPC error occurred. Please try again - this usually works on the second attempt.";
      } else {
        errorMessage = error.message || "Failed to create escrow";
      }

      toast({
        title: "Creation failed",
        description: errorMessage,
        variant: "destructive",
      });

      // If it's an RPC error, show an additional helpful message
      if (
        error.message?.includes("Internal JSON-RPC error") ||
        error.code === -32603
      ) {
        setTimeout(() => {
          toast({
            title: "💡 Tip",
            description:
              "This is a common network issue. Please try creating the escrow again - it usually works on the second attempt!",
            variant: "default",
          });
        }, 2000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-12 gradient-mesh">
      {/* Network Switch Banner */}
      {!isOnCorrectNetwork && wallet.isConnected && (
        <div className="container mx-auto px-4 max-w-4xl mb-6">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                <div>
                  <h3 className="font-semibold text-destructive">
                    Wrong Network
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Please switch to Somnia Dream Testnet to create escrows
                  </p>
                </div>
              </div>
              <Button onClick={switchToCelo} variant="destructive" size="sm">
                Switch to Somnia Dream Testnet
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-center">
            Create New Escrow
          </h1>
          <p className="text-xl text-muted-foreground text-center mb-12">
            Set up a secure escrow with milestone-based payments
          </p>

          <div className="flex items-center justify-center mb-12">
            <div className="flex items-center gap-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-4">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                      s === step
                        ? "border-primary bg-primary text-primary-foreground"
                        : s < step
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                  >
                    {s < step ? <CheckCircle2 className="h-5 w-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div
                      className={`w-16 h-0.5 ${
                        s < step ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <ProjectDetailsStep
                  formData={formData}
                  onUpdate={(data) => {
                    console.log(
                      "ProjectDetailsStep onUpdate called with:",
                      data
                    );
                    // If useNativeToken is being set to true, automatically set token to ZERO_ADDRESS
                    if (data.useNativeToken === true) {
                      console.log(
                        "Setting token to ZERO_ADDRESS for native token"
                      );
                      setFormData({
                        ...formData,
                        ...data,
                        token: ZERO_ADDRESS,
                      });
                    } else if (
                      data.useNativeToken === false &&
                      (formData.token === ZERO_ADDRESS ||
                        formData.token?.toLowerCase() ===
                          ZERO_ADDRESS.toLowerCase())
                    ) {
                      // If unchecking native token and token is currently ZERO_ADDRESS, set to default
                      console.log(
                        "Unchecking native token, setting to default token"
                      );
                      setFormData({
                        ...formData,
                        ...data,
                        token: CONTRACTS.USDC || CONTRACTS.MOCK_ERC20,
                      });
                    } else {
                      console.log(
                        "Regular update, token:",
                        data.token || formData.token
                      );
                      setFormData({ ...formData, ...data });
                    }
                    clearErrors();
                  }}
                  isContractPaused={isContractPaused}
                  whitelistedTokens={whitelistedTokens}
                  errors={{
                    projectTitle: errors.projectTitle,
                    projectDescription: errors.projectDescription,
                    duration: errors.duration,
                    totalBudget: errors.totalBudget,
                    beneficiary: errors.beneficiary,
                    tokenAddress: errors.tokenAddress,
                  }}
                />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <MilestonesStep
                  milestones={formData.milestones}
                  onUpdate={(milestones) => {
                    setFormData({ ...formData, milestones });
                    clearErrors();
                  }}
                  showAIWriter={showAIWriter}
                  onToggleAIWriter={setShowAIWriter}
                  currentMilestoneIndex={currentMilestoneIndex}
                  onSetCurrentMilestoneIndex={setCurrentMilestoneIndex}
                  totalBudget={formData.totalBudget}
                  errors={{
                    milestones: errors.milestones,
                    totalMismatch: errors.totalMismatch,
                  }}
                />
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <ReviewStep
                  formData={formData}
                  onConfirm={handleSubmit}
                  isSubmitting={isSubmitting}
                  isContractPaused={isContractPaused}
                  isOnCorrectNetwork={isOnCorrectNetwork}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-between mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={step === 1}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>

            <Button
              type="button"
              onClick={nextStep}
              disabled={step === 3}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
