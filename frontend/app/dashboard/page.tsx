"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { useWeb3 } from "@/contexts/web3-context";
import { useToast } from "@/hooks/use-toast";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import {
  useNotifications,
  createEscrowNotification,
  createMilestoneNotification,
} from "@/contexts/notification-context";
import type { Escrow, Milestone } from "@/lib/web3/types";
import { motion } from "framer-motion";
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { EscrowCard } from "@/components/dashboard/escrow-card";
import { DashboardLoading } from "@/components/dashboard/dashboard-loading";
import { RateFreelancer } from "@/components/rating-freelancer";
import {
  FilterSortControls,
  type FilterStatus,
  type SortOption,
} from "@/components/dashboard/filter-sort-controls";

export default function DashboardPage() {
  const { wallet, getContract } = useWeb3();
  const { toast } = useToast();
  const { addNotification, addCrossWalletNotification } = useNotifications();
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEscrow, setExpandedEscrow] = useState<string | null>(null);
  const [submittingMilestone, setSubmittingMilestone] = useState<string | null>(
    null
  );
  const [escrowRatings, setEscrowRatings] = useState<
    Record<string, { rating: number; exists: boolean }>
  >({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [searchQuery, setSearchQuery] = useState("");

  const getStatusFromNumber = (status: number): string => {
    switch (status) {
      case 0:
        return "pending";
      case 1:
        return "active";
      case 2:
        return "completed";
      case 3:
        return "disputed";
      case 4:
        return "active"; // Changed from "cancelled" to "active" for disputed escrows
      default:
        return "pending";
    }
  };

  // Check if an escrow should be marked as terminated (has disputed or resolved milestones)
  const isEscrowTerminated = (escrow: Escrow): boolean => {
    return escrow.milestones.some(
      (milestone) =>
        milestone.status === "disputed" ||
        milestone.status === "rejected" ||
        milestone.status === "resolved"
    );
  };

  // Check if all disputes have been resolved
  const hasAllDisputesResolved = (escrow: Escrow): boolean => {
    const disputedMilestones = escrow.milestones.filter(
      (milestone) => milestone.status === "disputed"
    );
    return (
      disputedMilestones.length === 0 &&
      escrow.milestones.some((milestone) => milestone.status === "resolved")
    );
  };

  const getMilestoneStatusFromNumber = (status: number): string => {
    const statuses = [
      "pending", // 0 - NotStarted
      "submitted", // 1 - Submitted
      "approved", // 2 - Approved
      "disputed", // 3 - Disputed
      "resolved", // 4 - Resolved
      "rejected", // 5 - Rejected
    ];
    const mappedStatus = statuses[status] || "pending";

    return mappedStatus;
  };

  const calculateDaysLeft = (createdAt: number, duration: number): number => {
    const now = Date.now();
    // Duration is already in seconds from the contract, convert to milliseconds
    const projectEndTime = createdAt + duration * 1000;
    const daysLeft = Math.ceil((projectEndTime - now) / (24 * 60 * 60 * 1000));
    return Math.max(0, daysLeft); // Don't show negative days
  };

  const getDaysLeftMessage = (
    daysLeft: number
  ): { text: string; color: string; bgColor: string } => {
    if (daysLeft > 7) {
      return {
        text: `${daysLeft} days`,
        color: "text-red-700 dark:text-red-400",
        bgColor: "bg-red-50 dark:bg-red-900/20",
      };
    } else if (daysLeft > 0) {
      return {
        text: `${daysLeft} days`,
        color: "text-orange-700 dark:text-orange-400",
        bgColor: "bg-orange-50 dark:bg-orange-900/20",
      };
    } else {
      return {
        text: "Deadline passed",
        color: "text-red-700 dark:text-red-400",
        bgColor: "bg-red-100 dark:bg-red-900/30",
      };
    }
  };

  // Query DisputeResolved event to get exact fund split amounts
  const getDisputeResolutionAmounts = async (
    contract: any,
    escrowId: number,
    milestoneIndex: number
  ): Promise<{ freelancerAmount: number; clientAmount: number } | null> => {
    try {
      const { ethers } = await import("ethers");
      const { CONTRACTS, HASHKEY_MAINNET } = await import("@/lib/web3/config");
      const { SECUREFLOW_ABI } = await import("@/lib/web3/abis");

      // Try to get provider from wallet context or use RPC
      let provider: any = null;
      let lastError: any = null;

      for (const rpcUrl of HASHKEY_MAINNET.rpcUrls) {
        try {
          provider = new ethers.JsonRpcProvider(rpcUrl);
          // Test connection
          await provider.getBlockNumber();
          break;
        } catch (e) {
          lastError = e;
          provider = null;
          continue;
        }
      }

      if (!provider) return null;

      const contractWithProvider = new ethers.Contract(
        CONTRACTS.SECUREFLOW_ESCROW,
        SECUREFLOW_ABI,
        provider
      );

      // Query DisputeResolved events for this escrow and milestone
      // Try querying from block 0 first, then fallback to recent blocks if too large
      let events: any[] = [];
      const currentBlock = await provider.getBlockNumber();

      // Try querying from deployment block or last 500k blocks (larger range)
      const deploymentBlock = 0; // Start from block 0
      const maxRange = 500000; // 500k blocks
      const fromBlock = Math.max(deploymentBlock, currentBlock - maxRange);

      // Create filter - try with specific escrowId and milestoneIndex
      const filter = contractWithProvider.filters.DisputeResolved(
        escrowId,
        milestoneIndex
      );

      // Also try without milestoneIndex filter in case the filter doesn't work
      const filterWithoutMilestone =
        contractWithProvider.filters.DisputeResolved(escrowId);

      try {
        // Try querying the entire range first with specific filter
        events = await contractWithProvider.queryFilter(
          filter,
          fromBlock,
          currentBlock
        );

        // If no events found with specific filter, try without milestoneIndex filter
        if (events.length === 0) {
          try {
            const allEvents = await contractWithProvider.queryFilter(
              filterWithoutMilestone,
              fromBlock,
              currentBlock
            );
            // Filter manually by milestoneIndex
            events = allEvents.filter((e: any) => {
              const eventMilestoneIndex = Number(
                e.args[1] || e.args.milestoneIndex || 0
              );
              return eventMilestoneIndex === milestoneIndex;
            });
          } catch (e) {
            // Continue with empty events
          }
        }
      } catch (eventError: any) {
        // If range is too large, try querying from block 0
        if (
          eventError.message?.includes("too large") ||
          eventError.message?.includes("limit") ||
          eventError.message?.includes("query returned more")
        ) {
          try {
            // Try from block 0
            events = await contractWithProvider.queryFilter(
              filter,
              0,
              currentBlock
            );
          } catch (e2: any) {
            // If still failing, try in chunks
            try {
              const chunkSize = 100000; // 100k blocks per chunk
              for (let start = 0; start <= currentBlock; start += chunkSize) {
                const end = Math.min(start + chunkSize - 1, currentBlock);
                try {
                  const chunkEvents = await contractWithProvider.queryFilter(
                    filter,
                    start,
                    end
                  );
                  events.push(...chunkEvents);
                } catch (chunkError: any) {
                  // Skip this chunk if it fails
                  continue;
                }
              }
            } catch (e3) {
              // Give up if all queries fail
              return null;
            }
          }
        } else if (
          !eventError.message?.includes("no backend is currently healthy") &&
          !eventError.message?.includes("-32011")
        ) {
          // Log unexpected errors (not RPC health issues)
        }
      }

      if (events.length > 0) {
        // Get the latest event (most recent resolution)
        const latestEvent = events[events.length - 1];

        // Parse event args - ethers.js v6 structures event args
        // DisputeResolved(escrowId indexed, milestoneIndex indexed, arbiter indexed, beneficiaryAmount, refundAmount, resolvedAt)
        // All args are in the args array: [escrowId, milestoneIndex, arbiter, beneficiaryAmount, refundAmount, resolvedAt]
        if (latestEvent.args) {
          try {
            let beneficiaryAmountRaw: any = null;
            let refundAmountRaw: any = null;

            // Try multiple ways to access event args
            // Method 1: Array access (ethers.js v6)
            if (Array.isArray(latestEvent.args)) {
              if (latestEvent.args.length >= 5) {
                beneficiaryAmountRaw = latestEvent.args[3];
                refundAmountRaw = latestEvent.args[4];
              }
            }
            // Method 2: Indexed access
            else if (
              latestEvent.args[3] !== undefined &&
              latestEvent.args[4] !== undefined
            ) {
              beneficiaryAmountRaw = latestEvent.args[3];
              refundAmountRaw = latestEvent.args[4];
            }
            // Method 3: Named property access
            else if (
              latestEvent.args.beneficiaryAmount !== undefined &&
              latestEvent.args.refundAmount !== undefined
            ) {
              beneficiaryAmountRaw = latestEvent.args.beneficiaryAmount;
              refundAmountRaw = latestEvent.args.refundAmount;
            }
            // Method 4: Try accessing via get() method if it's a Result object
            else if (typeof latestEvent.args.get === "function") {
              try {
                beneficiaryAmountRaw = latestEvent.args.get(3);
                refundAmountRaw = latestEvent.args.get(4);
              } catch (e) {
                // Try named access
                try {
                  beneficiaryAmountRaw =
                    latestEvent.args.get("beneficiaryAmount");
                  refundAmountRaw = latestEvent.args.get("refundAmount");
                } catch (e2) {
                  // Give up
                }
              }
            }

            if (beneficiaryAmountRaw !== null && refundAmountRaw !== null) {
              // Convert to numbers (handle BigInt, string, or number)
              const freelancerAmount = Number(beneficiaryAmountRaw) / 1e18;
              const clientAmount = Number(refundAmountRaw) / 1e18;

              // Return amounts if valid
              if (
                !isNaN(freelancerAmount) &&
                !isNaN(clientAmount) &&
                freelancerAmount >= 0 &&
                clientAmount >= 0
              ) {
                return {
                  freelancerAmount,
                  clientAmount,
                };
              }
            }
          } catch (parseError) {
            // Log error for debugging (only in development)
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "Failed to parse DisputeResolved event args:",
                parseError,
                latestEvent
              );
            }
          }
        }
      }
    } catch (error) {
      // Silently fail - we'll show generic split info
    }
    return null;
  };

  const fetchMilestones = async (
    contract: any,
    escrowId: number,
    escrowSummary?: any
  ) => {
    try {
      // Get milestone count from escrow summary first
      const milestoneCount = Number(escrowSummary[11]) || 0;

      // Always try to fetch individual milestones to get accurate data

      const allMilestones = [];

      for (let j = 0; j < milestoneCount; j++) {
        try {
          const individualMilestone = await contract.call(
            "milestones",
            escrowId,
            j
          );

          allMilestones.push(individualMilestone);
        } catch (error) {
          // Only create placeholder if we absolutely can't fetch the data
          allMilestones.push({
            description: `Milestone ${j + 1} - To be defined`,
            amount: "0",
            status: 0, // pending
            submittedAt: 0,
            approvedAt: 0,
          });
        }
      }

      if (allMilestones.length > 0) {
        return allMilestones.map((m: any, index: number) => {
          try {
            // Handle milestone data structure from getMilestones
            let description = "";
            let amount = "0";
            let status = 0;
            let submittedAt = undefined;
            let approvedAt = undefined;
            let disputedBy = "";
            let disputeReason = "";
            let rejectionReason = "";

            if (m && typeof m === "object") {
              try {
                // Check if this is a placeholder milestone
                if (m.description && m.description.includes("To be defined")) {
                  // This is a placeholder milestone
                  description = m.description;
                  amount = m.amount || "0";
                  status = m.status || 0;
                  submittedAt = m.submittedAt || undefined;
                  approvedAt = m.approvedAt || undefined;
                } else {
                  // This is a real milestone from the contract
                  // Handle Proxy(Result) objects properly
                  try {
                    // Try direct field access first (for struct fields)
                    if (m.description !== undefined) {
                      description = String(m.description);
                    } else if (m[0] !== undefined) {
                      description = String(m[0]);
                    } else {
                      description = `Milestone ${index + 1}`;
                    }

                    if (m.amount !== undefined) {
                      amount = String(m.amount);
                    } else if (m[1] !== undefined) {
                      amount = String(m[1]);
                    } else {
                      amount = "0";
                    }

                    if (m.status !== undefined) {
                      status = Number(m.status) || 0;
                    } else if (m[2] !== undefined) {
                      status = Number(m[2]) || 0;
                    } else {
                      status = 0;
                    }

                    // Removed excessive debug logging

                    if (
                      m.submittedAt !== undefined &&
                      Number(m.submittedAt) > 0
                    ) {
                      submittedAt = Number(m.submittedAt) * 1000;
                    } else if (m[3] !== undefined && Number(m[3]) > 0) {
                      submittedAt = Number(m[3]) * 1000;
                    }

                    if (
                      m.approvedAt !== undefined &&
                      Number(m.approvedAt) > 0
                    ) {
                      approvedAt = Number(m.approvedAt) * 1000;
                    } else if (m[4] !== undefined && Number(m[4]) > 0) {
                      approvedAt = Number(m[4]) * 1000;
                    }

                    // Parse disputedBy (index 6 in contract) - for disputed: who disputed, for resolved: winner
                    let disputedBy = "";
                    if (m.disputedBy !== undefined) {
                      disputedBy = String(m.disputedBy);
                    } else if (m[6] !== undefined) {
                      disputedBy = String(m[6]);
                    }

                    // Parse dispute reason (index 7 in contract) - for disputed: dispute reason, for resolved: resolution reason
                    if (m.disputeReason !== undefined) {
                      disputeReason = String(m.disputeReason);
                    } else if (m[7] !== undefined) {
                      disputeReason = String(m[7]);
                    }

                    // Parse rejection reason (also index 7 in contract)
                    if (m.rejectionReason !== undefined) {
                      rejectionReason = String(m.rejectionReason);
                    } else if (m[7] !== undefined) {
                      rejectionReason = String(m[7]);
                    }

                    // Debug amount conversion
                    const amountInTokens = (Number(amount) / 1e18).toFixed(2);
                  } catch (proxyError) {
                    // Fallback to basic parsing
                    description = `Milestone ${index + 1}`;
                    amount = "0";
                    status = 0;
                  }
                }
              } catch (e) {
                description = `Milestone ${index + 1}`;
                amount = "0";
                status = 0;
              }
            } else {
              // Fallback for unexpected structure
              description = `Milestone ${index + 1}`;
              amount = "0";
              status = 0;
            }

            // Determine the actual status based on timestamps and status
            // IMPORTANT: Check status FIRST before any other logic
            // CRITICAL: If status is 4 (Resolved), NEVER override it
            let finalStatus = getMilestoneStatusFromNumber(status);

            // Removed excessive debug logging

            // Check if this is a placeholder milestone
            const isPlaceholder =
              description && description.includes("To be defined");

            // CRITICAL: Never override resolved status (status 4)
            if (status === 4) {
              // Status is already "resolved" from getMilestoneStatusFromNumber
              // Don't let any other logic override it
              finalStatus = "resolved";
            } else if (isPlaceholder) {
              // For placeholder milestones, determine status based on previous milestones
              if (index === 0) {
                finalStatus = "pending";
              } else {
                // Check if previous milestone is approved
                finalStatus = "pending";
              }
            } else {
              // Priority 1: Use contract status as the primary source of truth
              if (status === 1) {
                finalStatus = "submitted";
              } else if (status === 2) {
                finalStatus = "approved";
              } else if (status === 3) {
                finalStatus = "disputed";
              } else if (status === 4) {
                finalStatus = "resolved";
              } else if (status === 5) {
                finalStatus = "rejected";
              }
              // Priority 2: Fallback to timestamp-based logic if status is 0
              else if (status === 0) {
                if (approvedAt && approvedAt > 0) {
                  finalStatus = "approved";
                } else if (submittedAt && submittedAt > 0) {
                  finalStatus = "submitted";
                } else {
                  finalStatus = "pending";
                }
              }
              // Special case: If this is the first milestone and funds have been released, it should be approved
              // BUT: Don't override if status is already "resolved" (status 4) or "disputed" (status 3)
              else if (
                status !== 4 &&
                status !== 3 &&
                index === 0 &&
                escrowSummary[5] &&
                Number(escrowSummary[5]) > 0
              ) {
                finalStatus = "approved";
              }
              // Otherwise use the parsed status (which should already be set correctly from getMilestoneStatusFromNumber)
              else {
                // Status is already correctly set from getMilestoneStatusFromNumber
                // Don't override resolved or disputed statuses
              }
            }

            // Final safety check: If status was 4, ensure finalStatus is "resolved"
            if (status === 4 && finalStatus !== "resolved") {
              finalStatus = "resolved";
            }

            // For resolved milestones, disputedBy contains the winner and disputeReason contains the resolution reason
            const winner = finalStatus === "resolved" ? disputedBy : undefined;
            const resolutionReason =
              finalStatus === "resolved" ? disputeReason : undefined;

            // Removed excessive debug logging

            const milestoneResult = {
              description,
              amount,
              status: finalStatus,
              submittedAt,
              approvedAt,
              disputedBy: finalStatus === "disputed" ? disputedBy : undefined,
              disputeReason:
                finalStatus === "disputed" ? disputeReason : undefined,
              winner,
              resolutionReason,
              rejectionReason,
              // Fund split amounts will be fetched separately for resolved milestones
              freelancerAmount: undefined,
              clientAmount: undefined,
            };

            // Removed excessive debug logging

            return milestoneResult;
          } catch (error) {
            return {
              description: `Milestone ${index + 1}`,
              amount: "0",
              status: "pending",
            };
          }
        });
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  useEffect(() => {
    if (wallet.isConnected) {
      fetchUserEscrows();
    }
  }, [wallet.isConnected]);

  const fetchUserEscrows = async () => {
    if (!isRefreshing) {
      setLoading(true);
    }
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      // Get total number of escrows
      const totalEscrows = await contract.call("nextEscrowId");
      const escrowCount = Number(totalEscrows);

      const userEscrows: Escrow[] = [];

      // Fetch user's escrows from the contract
      // Check if there are any escrows created yet (nextEscrowId > 1 means at least one escrow exists)
      if (escrowCount > 1) {
        for (let i = 1; i < escrowCount; i++) {
          try {
            const escrowSummary = await contract.call("getEscrowSummary", i);

            // Check if user is involved in this escrow
            // getEscrowSummary returns indexed properties: [depositor, beneficiary, arbiters, status, totalAmount, paidAmount, remaining, token, deadline, workStarted, createdAt, milestoneCount, isOpenJob, projectTitle, projectDescription]
            const isPayer =
              escrowSummary[0].toLowerCase() === wallet.address?.toLowerCase();
            const isBeneficiary =
              escrowSummary[1].toLowerCase() === wallet.address?.toLowerCase();

            // Show escrows for both clients and freelancers, but with different functionality
            if (isPayer || isBeneficiary) {
              // Fetch milestones first to check for resolved disputes
              let milestones = (await fetchMilestones(
                contract,
                i,
                escrowSummary
              )) as Milestone[];

              // For resolved milestones, fetch exact fund split amounts from events
              for (let j = 0; j < milestones.length; j++) {
                if (milestones[j].status === "resolved") {
                  try {
                    const amounts = await getDisputeResolutionAmounts(
                      contract,
                      i,
                      j
                    );
                    if (
                      amounts &&
                      amounts.freelancerAmount !== undefined &&
                      amounts.clientAmount !== undefined &&
                      !isNaN(amounts.freelancerAmount) &&
                      !isNaN(amounts.clientAmount)
                    ) {
                      milestones[j] = {
                        ...milestones[j],
                        freelancerAmount: amounts.freelancerAmount,
                        clientAmount: amounts.clientAmount,
                      };
                    } else if (process.env.NODE_ENV === "development") {
                      console.log(
                        `Escrow ${i}, Milestone ${j}: Could not fetch amounts`,
                        amounts
                      );
                    }
                  } catch (amountsError) {
                    // Log error in development
                    if (process.env.NODE_ENV === "development") {
                      console.warn(
                        `Failed to fetch amounts for Escrow ${i}, Milestone ${j}:`,
                        amountsError
                      );
                    }
                  }
                }
              }

              // Check if there are resolved disputes
              const resolvedMilestones = milestones.filter(
                (milestone) => milestone.status === "resolved"
              );
              const hasResolvedDispute = resolvedMilestones.length > 0;

              // Get base status from contract
              const baseStatus = getStatusFromNumber(Number(escrowSummary[3]));

              // If there are resolved disputes, override status to "disputed"
              // (which will be displayed as "Dispute Resolved" in the badge)
              const finalStatus = hasResolvedDispute
                ? "disputed" // We'll show this as "Dispute Resolved" in the badge
                : (baseStatus as
                  | "pending"
                  | "active"
                  | "completed"
                  | "disputed");

              // Removed excessive debug logging

              // Convert contract data to our Escrow type
              const escrow: Escrow = {
                id: i.toString(),
                payer: escrowSummary[0], // depositor
                beneficiary: escrowSummary[1], // beneficiary
                isClient: isPayer, // Track if current user is the client (payer)
                isFreelancer: isBeneficiary, // Track if current user is the freelancer (beneficiary)
                token: escrowSummary[7], // token
                totalAmount: escrowSummary[4].toString(), // totalAmount
                releasedAmount: escrowSummary[5].toString(), // paidAmount
                status: finalStatus,
                createdAt: Number(escrowSummary[10]) * 1000, // createdAt (convert to milliseconds)
                duration: Number(escrowSummary[8]) - Number(escrowSummary[10]), // deadline - createdAt (in seconds)
                milestones: milestones,
                projectTitle: escrowSummary[13] || "", // projectTitle
                projectDescription: escrowSummary[14] || "", // projectDescription
              };

              userEscrows.push(escrow);
            }
          } catch (error) {
            // Skip escrows that don't exist or user doesn't have access to
            continue;
          }
        }
      }

      // Set the actual escrows from the contract
      setEscrows(userEscrows);

      // Fetch ratings for completed escrows
      const ratings: Record<string, { rating: number; exists: boolean }> = {};
      for (const escrow of userEscrows) {
        if (escrow.status === "completed" && escrow.isClient) {
          try {
            const ratingData = await contract.call(
              "getEscrowRating",
              escrow.id
            );
            if (
              ratingData &&
              Array.isArray(ratingData) &&
              ratingData.length >= 5 &&
              ratingData[4]
            ) {
              // ratingData: [rater, freelancer, rating, ratedAt, exists]
              ratings[escrow.id] = {
                rating: Number(ratingData[2]) || 0,
                exists: Boolean(ratingData[4]),
              };
            } else {
              ratings[escrow.id] = { rating: 0, exists: false };
            }
          } catch (error) {
            // Rating doesn't exist yet or error fetching
            console.log(`Rating check for escrow ${escrow.id}:`, error);
            ratings[escrow.id] = { rating: 0, exists: false };
          }
        }
      }
      setEscrowRatings(ratings);
    } catch (error) {
      toast({
        title: "Failed to load escrows",
        description: "Could not fetch your escrows from the blockchain",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchUserEscrows();
  };

  const getStatusBadge = (status: string, escrow?: Escrow) => {
    // Check if there are resolved disputes first
    const hasResolvedDispute = escrow?.milestones.some(
      (milestone) => milestone.status === "resolved"
    );

    // Check if this escrow should be terminated
    const isTerminated = escrow ? isEscrowTerminated(escrow) : false;

    // If there are resolved disputes, show as "Dispute Resolved" instead of "active"
    const finalStatus = hasResolvedDispute
      ? "resolved"
      : isTerminated
        ? "terminated"
        : status;

    const variants: Record<string, { variant: any; icon: any; label: string }> =
    {
      pending: { variant: "secondary", icon: Clock, label: "Pending" },
      active: { variant: "default", icon: TrendingUp, label: "Active" },
      completed: {
        variant: "outline",
        icon: CheckCircle2,
        label: "Completed",
      },
      disputed: {
        variant: "destructive",
        icon: AlertCircle,
        label: "Disputed",
      },
      resolved: {
        variant: "secondary",
        icon: CheckCircle2,
        label: "Dispute Resolved",
      },
      terminated: {
        variant: "secondary",
        icon: AlertCircle,
        label: "Terminated",
      },
    };

    const config = variants[finalStatus] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getMilestoneStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      submitted: { variant: "default", label: "Submitted" },
      approved: { variant: "outline", label: "Approved" },
      disputed: { variant: "destructive", label: "Disputed" },
    };

    const config = variants[status] || variants.pending;

    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  const calculateProgress = (escrow: Escrow) => {
    const released = Number.parseFloat(escrow.releasedAmount) / 1e18;
    const total = Number.parseFloat(escrow.totalAmount) / 1e18;
    return total > 0 ? (released / total) * 100 : 0;
  };

  const formatAmount = (amount: string) => {
    return (Number.parseFloat(amount) / 1e18).toFixed(2);
  };

  const getTokenInfo = (tokenAddress: string) => {
    return {
      name:
        tokenAddress === "0x0000000000000000000000000000000000000000"
          ? "HSK"
          : "Token",
      symbol:
        tokenAddress === "0x0000000000000000000000000000000000000000"
          ? "HSK"
          : "TKN",
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "active":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "disputed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "submitted":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "disputed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Filter and sort escrows
  const getFilteredAndSortedEscrows = () => {
    let filtered = [...escrows];

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((e) => {
        const status = e.status.toLowerCase();
        return status === statusFilter.toLowerCase();
      });
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((e) => {
        const title = (e.projectTitle || "").toLowerCase();
        const description = (e.projectDescription || "").toLowerCase();
        return title.includes(query) || description.includes(query);
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortOption) {
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
        case "amount-high":
          return (
            Number.parseFloat(b.totalAmount) - Number.parseFloat(a.totalAmount)
          );
        case "amount-low":
          return (
            Number.parseFloat(a.totalAmount) - Number.parseFloat(b.totalAmount)
          );
        case "status":
          const statusOrder: Record<string, number> = {
            pending: 0,
            active: 1,
            completed: 2,
            disputed: 3,
          };
          return (
            (statusOrder[a.status.toLowerCase()] ?? 99) -
            (statusOrder[b.status.toLowerCase()] ?? 99)
          );
        default:
          return 0;
      }
    });

    return filtered;
  };

  const filteredEscrows = getFilteredAndSortedEscrows();
  const activeFiltersCount =
    (statusFilter !== "all" ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  const handleClearFilters = () => {
    setStatusFilter("all");
    setSearchQuery("");
    setSortOption("newest");
  };

  const disputeMilestone = async (escrowId: string, milestoneIndex: number) => {
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      if (!contract) return;

      setSubmittingMilestone(`${escrowId}-${milestoneIndex}`);
      await contract.send(
        "disputeMilestone",
        escrowId,
        milestoneIndex,
        "Disputed by client"
      );
      toast({
        title: "Milestone Disputed",
        description: "A dispute has been opened for this milestone",
      });

      // Get freelancer address from escrow data
      const escrow = escrows.find((e) => e.id === escrowId);
      const freelancerAddress = escrow?.beneficiary;

      // Add cross-wallet notification for dispute opening
      addCrossWalletNotification(
        createMilestoneNotification("disputed", escrowId, milestoneIndex, {
          reason: "Disputed by client",
          clientName:
            wallet.address!.slice(0, 6) + "..." + wallet.address!.slice(-4),
        }),
        wallet.address || undefined, // Client address
        freelancerAddress // Freelancer address
      );

      // Wait a moment for blockchain state to update
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchUserEscrows();
    } catch (error) {
      toast({
        title: "Dispute Failed",
        description: "Could not open dispute. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const startWork = async (escrowId: string) => {
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      if (!contract) return;

      setSubmittingMilestone(escrowId);
      await contract.send("startWork", escrowId);
      toast({
        title: "Work Started",
        description: "You have started work on this escrow",
      });

      // Get freelancer address from escrow data
      const escrow = escrows.find((e) => e.id === escrowId);
      const freelancerAddress = escrow?.beneficiary;

      // Add cross-wallet notification for work started
      addCrossWalletNotification(
        createEscrowNotification("work_started", escrowId, {
          projectTitle:
            escrows.find((e) => e.id === escrowId)?.projectDescription ||
            `Project #${escrowId}`,
          freelancerName:
            wallet.address!.slice(0, 6) + "..." + wallet.address!.slice(-4),
        }),
        wallet.address || undefined, // Client address
        freelancerAddress // Freelancer address
      );

      // Wait a moment for blockchain state to update, then reload
      await new Promise((resolve) => setTimeout(resolve, 2000));
      window.location.reload();
    } catch (error) {
      toast({
        title: "Start Work Failed",
        description: "Could not start work. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const openDispute = async (escrowId: string) => {
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      if (!contract) return;

      setSubmittingMilestone(escrowId);
      await contract.send("disputeMilestone", escrowId, 0, "General dispute");
      toast({
        title: "Dispute Opened",
        description: "A dispute has been opened for this escrow",
      });

      // Wait a moment for blockchain state to update
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchUserEscrows();
    } catch (error) {
      toast({
        title: "Dispute Failed",
        description: "Could not open dispute. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const approveMilestone = async (escrowId: string, milestoneIndex: number) => {
    try {
      // SECURITY: Double-check that user is the depositor
      const escrow = escrows.find((e) => e.id === escrowId);
      if (
        !escrow ||
        escrow.payer.toLowerCase() !== wallet.address?.toLowerCase()
      ) {
        toast({
          title: "Access Denied",
          description: "Only the job creator can approve milestones",
          variant: "destructive",
        });
        return;
      }

      setSubmittingMilestone(`${escrowId}-${milestoneIndex}`);
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      if (!contract) return;

      toast({
        title: "Approving milestone...",
        description: "Please confirm the transaction in your wallet",
      });

      const txHash = await contract.send(
        "approveMilestone",
        "no-value",
        escrowId,
        milestoneIndex
      );

      // Wait for transaction confirmation
      let receipt;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        try {
          if (typeof window !== "undefined" && window.ethereum) {
            receipt = await (window.ethereum as any).request({
              method: "eth_getTransactionReceipt",
              params: [txHash],
            });
            if (receipt) break;
          }
        } catch (error) { }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;
      }

      if (!receipt) {
        throw new Error(
          "Transaction timeout - please check the blockchain explorer"
        );
      }

      if (receipt.status === "0x1") {
        toast({
          title: "Milestone Approved!",
          description: "Payment has been sent to the freelancer",
        });

        // Get freelancer address from escrow data
        const freelancerAddress = escrow.beneficiary;

        // Add cross-wallet notification for milestone approval
        addCrossWalletNotification(
          createMilestoneNotification("approved", escrowId, milestoneIndex, {
            clientName:
              wallet.address!.slice(0, 6) + "..." + wallet.address!.slice(-4),
            projectTitle: escrow.projectDescription || `Project #${escrowId}`,
          }),
          wallet.address || undefined, // Client address
          freelancerAddress // Freelancer address
        );

        // Wait a moment for blockchain state to update
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Add debugging for payment tracking
        const milestone = escrow.milestones[milestoneIndex];

        // Check if milestone amount is being parsed correctly
        const milestoneAmountInTokens =
          Number.parseFloat(milestone.amount) / 1e18;

        await fetchUserEscrows();

        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent("milestoneApproved"));

        // Reload the page to ensure UI is fully updated
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        throw new Error("Transaction failed on blockchain");
      }
    } catch (error: any) {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve milestone",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const rejectMilestone = async (
    escrowId: string,
    milestoneIndex: number,
    reason: string
  ) => {
    try {
      // SECURITY: Double-check that user is the depositor
      const escrow = escrows.find((e) => e.id === escrowId);
      if (
        !escrow ||
        escrow.payer.toLowerCase() !== wallet.address?.toLowerCase()
      ) {
        toast({
          title: "Access Denied",
          description: "Only the job creator can reject milestones",
          variant: "destructive",
        });
        return;
      }

      setSubmittingMilestone(`${escrowId}-${milestoneIndex}`);
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      if (!contract) return;

      toast({
        title: "Rejecting milestone...",
        description: "Please confirm the transaction in your wallet",
      });

      const txHash = await contract.send(
        "rejectMilestone",
        "no-value",
        escrowId,
        milestoneIndex,
        reason
      );

      // Wait for transaction confirmation
      let receipt;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        try {
          if (typeof window !== "undefined" && window.ethereum) {
            receipt = await (window.ethereum as any).request({
              method: "eth_getTransactionReceipt",
              params: [txHash],
            });
            if (receipt) break;
          }
        } catch (error) { }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;
      }

      if (!receipt) {
        throw new Error(
          "Transaction timeout - please check the blockchain explorer"
        );
      }

      if (receipt.status === "0x1") {
        toast({
          title: "Milestone Rejected",
          description: "The freelancer has been notified and can resubmit",
        });
        await fetchUserEscrows();

        // Reload the page to ensure UI is fully updated
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        throw new Error("Transaction failed on blockchain");
      }
    } catch (error: any) {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject milestone",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedEscrow(expandedEscrow === id ? null : id);
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <Card className="glass border-primary/20 p-12 text-center max-w-md">
          <Wallet className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Wallet Not Connected</h2>
          <p className="text-muted-foreground mb-6">
            Please connect your wallet to view your escrows
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <DashboardLoading isConnected={wallet.isConnected} />;
  }

  const completedEscrows = escrows.filter((e) => e.status === "completed");
  const totalVolume = escrows
    .reduce((sum, e) => sum + Number.parseFloat(e.totalAmount) / 1e18, 0)
    .toFixed(2);

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4">
          <DashboardHeader />
          <Card className="glass border-primary/20 p-12 text-center max-w-md">
            <Wallet className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground">
              Connect your wallet to view your escrows and manage milestones.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen py-12">
        <div className="container mx-auto px-4">
          <DashboardHeader />
          <DashboardLoading isConnected={wallet.isConnected} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        <DashboardHeader
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />

        <DashboardStats escrows={escrows} />

        {escrows.length === 0 ? (
          <Card className="glass border-muted p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-bold mb-2">No Escrows Found</h3>
            <p className="text-muted-foreground">
              You don't have any escrows yet. Create one to get started.
            </p>
          </Card>
        ) : (
          <>
            <FilterSortControls
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              sortOption={sortOption}
              onSortChange={setSortOption}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onClearFilters={handleClearFilters}
              activeFiltersCount={activeFiltersCount}
            />

            {filteredEscrows.length === 0 ? (
              <Card className="glass border-muted p-12 text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-bold mb-2">No Results Found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your filters or search query.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {filteredEscrows.map((escrow, index) => {
                  const rating = escrowRatings[escrow.id];
                  return (
                    <EscrowCard
                      key={escrow.id}
                      escrow={escrow}
                      index={index}
                      expandedEscrow={expandedEscrow}
                      submittingMilestone={
                        submittingMilestone === escrow.id ? "true" : "false"
                      }
                      onToggleExpanded={() =>
                        setExpandedEscrow(
                          expandedEscrow === escrow.id ? null : escrow.id
                        )
                      }
                      onApproveMilestone={approveMilestone}
                      onRejectMilestone={(
                        escrowId: string,
                        milestoneIndex: number
                      ) => {
                        // For now, use empty reason - this should be handled by the component
                        rejectMilestone(
                          escrowId,
                          milestoneIndex,
                          "No reason provided"
                        );
                      }}
                      onDisputeMilestone={disputeMilestone}
                      onStartWork={startWork}
                      onDispute={openDispute}
                      calculateDaysLeft={calculateDaysLeft}
                      getDaysLeftMessage={getDaysLeftMessage}
                      rating={rating}
                      onRatingSubmitted={() => fetchUserEscrows()}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
