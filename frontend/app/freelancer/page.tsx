"use client";

import { useState, useEffect } from "react";
import { useWeb3 } from "@/contexts/web3-context";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import {
  useNotifications,
  createEscrowNotification,
  createMilestoneNotification,
} from "@/contexts/notification-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FreelancerHeader } from "@/components/freelancer/freelancer-header";
import { FreelancerStats } from "@/components/freelancer/freelancer-stats";
import { EscrowCard } from "@/components/freelancer/escrow-card";
import { FreelancerLoading } from "@/components/freelancer/freelancer-loading";
import {
  FilterSortControls,
  type FilterStatus,
  type SortOption,
} from "@/components/dashboard/filter-sort-controls";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  User,
  DollarSign,
  CheckCircle,
  Calendar,
  Play,
  RefreshCw,
  Clock,
  Star,
} from "lucide-react";
import { motion } from "framer-motion";

interface Escrow {
  id: string;
  payer: string;
  beneficiary: string;
  token: string;
  totalAmount: string;
  releasedAmount: string;
  status: string;
  createdAt: number;
  duration: number;
  milestones: Milestone[];
  projectTitle?: string;
  projectDescription: string;
  isOpenJob: boolean;
  milestoneCount: number;
}

interface Milestone {
  description: string;
  amount: string;
  status: string;
  submittedAt?: number;
  approvedAt?: number;
  disputeReason?: string;
  rejectionReason?: string;
  winner?: string;
  resolutionReason?: string;
  disputedBy?: string;
}

export default function FreelancerPage() {
  const { wallet, getContract } = useWeb3();
  const { addNotification, addCrossWalletNotification } = useNotifications();
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingMilestone, setSubmittingMilestone] = useState<string | null>(
    null
  );
  const [submittedMilestones, setSubmittedMilestones] = useState<Set<string>>(
    new Set()
  );
  const [approvedMilestones, setApprovedMilestones] = useState<Set<string>>(
    new Set()
  );
  const [selectedEscrowId, setSelectedEscrowId] = useState<string | null>(null);
  const [selectedMilestoneIndex, setSelectedMilestoneIndex] = useState<
    number | null
  >(null);
  const [milestoneDescriptions, setMilestoneDescriptions] = useState<
    Record<string, string>
  >({});
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [resubmitDescription, setResubmitDescription] = useState("");
  const [showResubmitDialog, setShowResubmitDialog] = useState(false);
  const [selectedResubmitEscrow, setSelectedResubmitEscrow] = useState<
    string | null
  >(null);
  const [selectedResubmitMilestone, setSelectedResubmitMilestone] = useState<
    number | null
  >(null);
  const [escrowRatings, setEscrowRatings] = useState<
    Record<string, { rating: number; exists: boolean }>
  >({});
  const [freelancerRating, setFreelancerRating] = useState<{
    averageRating: number;
    totalRatings: number;
  } | null>(null);
  const [badgeTier, setBadgeTier] = useState<number | null>(null);
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "active" | "completed" | "disputed"
  >("all");
  const [sortOption, setSortOption] = useState<
    "newest" | "oldest" | "amount-high" | "amount-low" | "status"
  >("newest");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (wallet.isConnected) {
      fetchFreelancerEscrows();
    }
  }, [wallet.isConnected]);

  // Listen for milestone submission events
  useEffect(() => {
    const handleMilestoneSubmitted = () => {
      fetchFreelancerEscrows();
    };

    const handleMilestoneApproved = () => {
      fetchFreelancerEscrows();
    };

    const handleMilestoneRejected = (event: any) => {
      fetchFreelancerEscrows();
    };

    window.addEventListener("milestoneSubmitted", handleMilestoneSubmitted);
    window.addEventListener("milestoneApproved", handleMilestoneApproved);
    window.addEventListener("milestoneRejected", handleMilestoneRejected);
    return () => {
      window.removeEventListener(
        "milestoneSubmitted",
        handleMilestoneSubmitted
      );
      window.removeEventListener("milestoneApproved", handleMilestoneApproved);
      window.removeEventListener("milestoneRejected", handleMilestoneRejected);
    };
  }, []);

  const fetchFreelancerEscrows = async () => {
    setLoading(true);
    try {
      if (!wallet.isConnected || !wallet.address) {
        return;
      }

      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      if (!contract) {
        toast({
          title: "Contract Error",
          description:
            "Smart contract is not available. Please check your connection.",
          variant: "destructive",
        });
        return;
      }

      // Get total number of escrows
      const totalEscrows = await contract.call("nextEscrowId");
      const escrowCount = Number(totalEscrows);

      const freelancerEscrows: Escrow[] = [];

      // Fetch escrows where current user is the beneficiary
      if (escrowCount > 1) {
        for (let i = 1; i < escrowCount; i++) {
          try {
            const escrowSummary = await contract.call("getEscrowSummary", i);

            // Handle potential contract call failures
            if (escrowSummary === null || escrowSummary === undefined) {
              continue;
            }

            // Check if escrowSummary is valid
            if (
              !escrowSummary ||
              !Array.isArray(escrowSummary) ||
              escrowSummary.length === 0
            ) {
              continue;
            }

            // Check if current user is the beneficiary
            const isBeneficiary =
              escrowSummary[1].toLowerCase() === wallet.address?.toLowerCase();

            if (isBeneficiary) {
              // Get milestone count from escrow summary first
              const milestoneCount = Number(escrowSummary[11]) || 0;

              // Fetch milestones for this escrow
              const milestones = await contract.call("getMilestones", i);

              if (milestones && milestones.length > 0) {
              }

              // Try to get individual milestones if getMilestones doesn't return all
              const allMilestones = [];

              // Always try to fetch individual milestones to get accurate data
              for (let j = 0; j < milestoneCount; j++) {
                try {
                  const individualMilestone = await contract.call(
                    "milestones",
                    i,
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

              // Convert contract data to our Escrow type
              const statusFromContract = getStatusFromNumber(
                Number(escrowSummary[3])
              );
              // Normalize status: map "Released" to "completed" and "InProgress" to "active" for consistency
              let normalizedStatus = statusFromContract.toLowerCase();
              if (normalizedStatus === "released") {
                normalizedStatus = "completed";
              } else if (normalizedStatus === "inprogress") {
                normalizedStatus = "active";
              }

              const escrow: Escrow = {
                id: i.toString(),
                payer: escrowSummary[0], // depositor
                beneficiary: escrowSummary[1], // beneficiary
                token: escrowSummary[7], // token
                totalAmount: escrowSummary[4].toString(), // totalAmount
                releasedAmount: escrowSummary[5].toString(), // paidAmount
                status: normalizedStatus as
                  | "pending"
                  | "active"
                  | "completed"
                  | "disputed", // status
                createdAt: Number(escrowSummary[10]) * 1000, // createdAt (convert to milliseconds)
                duration: Number(escrowSummary[8]) - Number(escrowSummary[10]), // deadline - createdAt (in seconds)
                milestones: allMilestones.map((m: any, index: number) => {
                  try {
                    // Handle milestone data structure from getMilestones
                    let description = "";
                    let amount = "0";
                    let status = 0;
                    let submittedAt = undefined;
                    let approvedAt = undefined;
                    let disputedBy: string | undefined = undefined;
                    let disputeReason = "";
                    let rejectionReason = "";

                    if (m && typeof m === "object") {
                      try {
                        // Check if this is a placeholder milestone
                        if (
                          m.description &&
                          m.description.includes("To be defined")
                        ) {
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

                            // Parse disputedBy (index 6 in contract)
                            if (m.disputedBy !== undefined) {
                              disputedBy = String(m.disputedBy);
                            } else if (m[6] !== undefined) {
                              disputedBy = String(m[6]);
                            }

                            // Parse dispute reason (index 7 in contract)
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
                            const amountInTokens = formatAmount(amount);
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
                    let finalStatus = getMilestoneStatusFromNumber(status);

                    // Check if this is a placeholder milestone
                    const isPlaceholder =
                      description && description.includes("To be defined");

                    if (isPlaceholder) {
                      // For placeholder milestones, determine status based on previous milestones
                      if (index === 0) {
                        // First milestone - should be pending
                        finalStatus = "pending";
                      } else {
                        // Check if previous milestone is approved
                        // This will be handled by the UI logic
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
                      else if (
                        index === 0 &&
                        escrowSummary[5] &&
                        Number(escrowSummary[5]) > 0
                      ) {
                        finalStatus = "approved";
                      }
                      // Otherwise use the parsed status
                      else {
                      }
                    }

                    // Track milestone states for submission prevention
                    const milestoneKey = `${i}-${index}`;
                    if (finalStatus === "approved") {
                      setApprovedMilestones(
                        (prev) => new Set([...prev, milestoneKey])
                      );
                    } else if (finalStatus === "submitted") {
                      setSubmittedMilestones(
                        (prev) => new Set([...prev, milestoneKey])
                      );
                    }

                    // For resolved milestones, disputedBy contains the winner and disputeReason contains the resolution reason
                    const winner =
                      finalStatus === "resolved" ? disputedBy : undefined;
                    const resolutionReason =
                      finalStatus === "resolved" ? disputeReason : undefined;

                    return {
                      description,
                      amount,
                      status: finalStatus,
                      submittedAt,
                      approvedAt,
                      disputedBy:
                        finalStatus === "disputed" ? disputedBy : undefined,
                      disputeReason:
                        finalStatus === "disputed" ? disputeReason : undefined,
                      winner,
                      resolutionReason,
                      rejectionReason,
                    };
                  } catch (error) {
                    return {
                      description: `Milestone ${index + 1}`,
                      amount: "0",
                      status: "pending",
                    };
                  }
                }),
                projectTitle: escrowSummary[13] || "", // projectTitle
                projectDescription: escrowSummary[14] || "", // projectDescription
                isOpenJob: Boolean(escrowSummary[12]), // isOpenJob
                milestoneCount: Number(escrowSummary[11]) || 0, // milestoneCount
              };

              freelancerEscrows.push(escrow);
            }
          } catch (error) {
            continue;
          }
        }
      }

      setEscrows(freelancerEscrows);

      // Fetch ratings for completed/released escrows
      const ratings: Record<string, { rating: number; exists: boolean }> = {};
      for (const escrow of freelancerEscrows) {
        // Check for both "completed" and "released" status (case-insensitive)
        const statusLower = escrow.status.toLowerCase();
        if (statusLower === "completed" || statusLower === "released") {
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

      // Fetch overall freelancer rating
      if (wallet.address) {
        try {
          const ratingData = await contract.call(
            "getFreelancerRating",
            wallet.address
          );
          if (
            ratingData &&
            Array.isArray(ratingData) &&
            ratingData.length >= 2
          ) {
            // ratingData: [averageRating, totalRatings]
            // averageRating is stored as percentage (0-500), divide by 100 for actual rating
            const averageRating = Number(ratingData[0]) / 100;
            const totalRatings = Number(ratingData[1]);
            setFreelancerRating({ averageRating, totalRatings });
          }
        } catch (error) {
          console.log("Error fetching freelancer rating:", error);
          setFreelancerRating({ averageRating: 0, totalRatings: 0 });
        }

        // Fetch badge tier
        try {
          const tier = await contract.call("getBadgeTier", wallet.address);
          setBadgeTier(Number(tier) || 0);
        } catch (error) {
          console.log("Error fetching badge tier:", error);
          setBadgeTier(0);
        }
      }

      // Update submitted milestones based on current data
      const currentSubmittedMilestones = new Set<string>();
      freelancerEscrows.forEach((escrow) => {
        escrow.milestones.forEach((milestone, index) => {
          // Mark as submitted if milestone is submitted, approved, or has been processed
          if (
            milestone.status === "submitted" ||
            milestone.status === "approved" ||
            milestone.submittedAt ||
            milestone.approvedAt
          ) {
            currentSubmittedMilestones.add(`${escrow.id}-${index}`);
          }
        });
      });
      setSubmittedMilestones(currentSubmittedMilestones);
    } catch (error) {
      toast({
        title: "Failed to load escrows",
        description:
          "Could not fetch your assigned escrows from the blockchain",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const startWork = async (escrowId: string) => {
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      // Get escrow details to debug
      try {
        const escrowSummary = await contract.call(
          "getEscrowSummary",
          Number(escrowId)
        );
      } catch (debugError) {
        console.error("Failed to get escrow details:", debugError);
      }

      toast({
        title: "Starting work...",
        description: "Submitting transaction to start work on this escrow",
      });

      const txHash = await contract.send(
        "startWork",
        "no-value",
        Number(escrowId)
      );

      toast({
        title: "Work started!",
        description: "You can now submit milestones for this project",
      });

      // Get client address from escrow data
      const escrow = escrows.find((e) => e.id === escrowId);
      const clientAddress = escrow?.payer;

      // Add cross-wallet notification for work started
      addCrossWalletNotification(
        createEscrowNotification("work_started", escrowId, {
          projectTitle:
            escrows.find((e) => e.id === escrowId)?.projectTitle ||
            `Project #${escrowId}`,
          freelancerName:
            wallet.address!.slice(0, 6) + "..." + wallet.address!.slice(-4),
        }),
        clientAddress, // Client address
        wallet.address || undefined // Freelancer address
      );

      // Refresh escrows then reload so the Start Work button disappears
      await fetchFreelancerEscrows();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error("Start work error:", error);
      console.error("Error message:", error.message);
      console.error("Error code:", error.code);
      console.error("Error data:", error.data);

      // Check for MetaMask disconnection
      if (
        error.message?.includes("Disconnected from MetaMask") ||
        error.message?.includes("Premature close") ||
        error.code === "UNPREDICTABLE_GAS_LIMIT"
      ) {
        toast({
          title: "MetaMask Connection Lost",
          description: "Please refresh the page and reconnect your wallet",
          variant: "destructive",
        });
      } else if (error.message?.includes("Only beneficiary")) {
        toast({
          title: "Not Authorized",
          description: "Only the beneficiary can start work on this escrow",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to start work",
          description: error.message || "Could not start work on this escrow",
          variant: "destructive",
        });
      }
    }
  };

  const submitMilestone = async (escrowId: string, milestoneIndex: number) => {
    const milestoneKey = `${escrowId}-${milestoneIndex}`;
    const description = milestoneDescriptions[milestoneKey] || "";

    // Check if milestone has already been submitted
    if (submittedMilestones.has(milestoneKey)) {
      toast({
        title: "Milestone already submitted",
        description:
          "This milestone has already been submitted and cannot be submitted again",
        variant: "destructive",
      });
      return;
    }

    // Check if milestone has already been approved
    if (approvedMilestones.has(milestoneKey)) {
      toast({
        title: "Milestone already approved",
        description:
          "This milestone has already been approved and cannot be resubmitted",
        variant: "destructive",
      });
      return;
    }

    // Check if this is the correct milestone to submit (sequential order)
    const escrow = escrows.find((e) => e.id === escrowId);
    if (escrow) {
      // Find the current milestone that should be submitted
      let expectedMilestoneIndex = -1;

      for (let i = 0; i < escrow.milestones.length; i++) {
        const milestone = escrow.milestones[i];
        const milestoneKey = `${escrowId}-${i}`;

        // Check if this milestone is pending and can be submitted
        if (
          milestone.status === "pending" &&
          !submittedMilestones.has(milestoneKey) &&
          !approvedMilestones.has(milestoneKey)
        ) {
          // For the first milestone, it can always be submitted if pending
          if (i === 0) {
            expectedMilestoneIndex = i;
            break;
          }

          // For subsequent milestones, check if the previous one is approved
          const previousMilestone = escrow.milestones[i - 1];
          const previousMilestoneKey = `${escrowId}-${i - 1}`;

          // Check if previous milestone is approved
          const isPreviousApproved =
            previousMilestone &&
            (previousMilestone.status === "approved" ||
              approvedMilestones.has(previousMilestoneKey));

          // Check if there are any submitted milestones before this one that aren't approved
          let hasUnapprovedSubmitted = false;
          for (let j = 0; j < i; j++) {
            const prevMilestone = escrow.milestones[j];
            const prevMilestoneKey = `${escrowId}-${j}`;
            const isPrevSubmitted =
              prevMilestone.status === "submitted" ||
              submittedMilestones.has(prevMilestoneKey);
            const isPrevApproved =
              prevMilestone.status === "approved" ||
              approvedMilestones.has(prevMilestoneKey);

            if (isPrevSubmitted && !isPrevApproved) {
              hasUnapprovedSubmitted = true;
              break;
            }
          }

          // Only allow submission if previous milestone is approved AND no submitted milestones are pending
          if (isPreviousApproved && !hasUnapprovedSubmitted) {
            expectedMilestoneIndex = i;
            break;
          }
        }
      }

      // Check if the milestone being submitted is the expected one
      if (expectedMilestoneIndex !== milestoneIndex) {
        if (expectedMilestoneIndex === -1) {
          toast({
            title: "No milestone available for submission",
            description:
              "All milestones are either completed or in progress. Please wait for the current milestone to be approved.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Wrong milestone sequence",
            description: `You can only submit milestone ${expectedMilestoneIndex + 1
              } at this time. Please complete the previous milestones first.`,
            variant: "destructive",
          });
        }
        return;
      }
    }

    // Additional check: Get the current milestone status from contract
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      const milestones = await contract.call("getMilestones", escrowId);

      if (milestones && milestones.length > milestoneIndex) {
        const milestone = milestones[milestoneIndex];

        // Check if milestone has been submitted (status 1) or approved (status 2)
        if (milestone && milestone[2] && Number(milestone[2]) > 0) {
          toast({
            title: "Milestone already processed",
            description: `This milestone has already been ${Number(milestone[2]) === 2 ? "approved" : "submitted"
              } and cannot be submitted again`,
            variant: "destructive",
          });
          return;
        }
      }
    } catch (error) { }

    // Validate milestone description from input field
    if (!description?.trim()) {
      toast({
        title: "Description required",
        description: "Please provide a description of your work",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmittingMilestone(`${escrowId}-${milestoneIndex}`);
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      toast({
        title: "Submitting milestone...",
        description: "Submitting transaction to submit your milestone",
      });

      const txHash = await contract.send(
        "submitMilestone",
        "no-value",
        escrowId,
        milestoneIndex,
        description
      );

      // Wait for transaction confirmation
      toast({
        title: "Transaction submitted",
        description: "Waiting for blockchain confirmation...",
      });

      // Wait for transaction to be mined using polling
      let receipt;
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute timeout

      while (attempts < maxAttempts) {
        try {
          if (typeof window !== "undefined" && window.ethereum) {
            receipt = await (window.ethereum as any).request({
              method: "eth_getTransactionReceipt",
              params: [txHash],
            });

            if (receipt) {
              break;
            }
          }
        } catch (error) { }

        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        attempts++;
      }

      if (!receipt) {
        throw new Error(
          "Transaction timeout - please check the blockchain explorer"
        );
      }

      if (receipt.status === "0x1") {
        toast({
          title: "Milestone submitted!",
          description: "Your milestone has been submitted for review",
        });

        // Get client address from escrow data
        const escrow = escrows.find((e) => e.id === escrowId);
        const clientAddress = escrow?.payer;

        // Add cross-wallet notification for milestone submission
        addCrossWalletNotification(
          createMilestoneNotification("submitted", escrowId, milestoneIndex, {
            freelancerName:
              wallet.address!.slice(0, 6) + "..." + wallet.address!.slice(-4),
            projectTitle: escrow?.projectTitle || `Project #${escrowId}`,
          }),
          clientAddress, // Client address
          wallet.address || undefined // Freelancer address
        );

        // Mark this milestone as submitted to prevent double submission
        const milestoneKey = `${escrowId}-${milestoneIndex}`;
        setSubmittedMilestones((prev) => new Set([...prev, milestoneKey]));

        // Clear form
        setMilestoneDescriptions((prev) => {
          const updated = { ...prev };
          delete updated[milestoneKey];
          return updated;
        });
        setSelectedEscrowId(null);

        // Refresh escrows
        await fetchFreelancerEscrows();

        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent("milestoneSubmitted"));
      } else {
        throw new Error("Transaction failed on blockchain");
      }
    } catch (error) {
      toast({
        title: "Failed to submit milestone",
        description: "Could not submit your milestone",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const resubmitMilestone = async (
    escrowId: string,
    milestoneIndex: number,
    description: string
  ) => {
    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please describe the improvements you've made",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmittingMilestone(`${escrowId}-${milestoneIndex}`);
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      toast({
        title: "Resubmitting milestone...",
        description: "Submitting transaction to resubmit your milestone",
      });

      const txHash = await contract.send(
        "resubmitMilestone",
        "no-value",
        escrowId,
        milestoneIndex,
        description
      );

      // Wait for transaction confirmation
      toast({
        title: "Transaction submitted",
        description: "Waiting for blockchain confirmation...",
      });

      // Wait for transaction to be mined using polling
      let receipt;
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute timeout

      while (attempts < maxAttempts) {
        try {
          if (typeof window !== "undefined" && window.ethereum) {
            receipt = await (window.ethereum as any).request({
              method: "eth_getTransactionReceipt",
              params: [txHash],
            });

            if (receipt) {
              break;
            }
          }
        } catch (error) { }

        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        attempts++;
      }

      if (!receipt) {
        throw new Error(
          "Transaction timeout - please check the blockchain explorer"
        );
      }

      if (receipt.status === "0x1") {
        toast({
          title: "Milestone resubmitted!",
          description: "Your milestone has been resubmitted for client review",
        });

        // Get client address from escrow data
        const escrow = escrows.find((e) => e.id === escrowId);
        const clientAddress = escrow?.payer;

        // Add notification for milestone resubmission (notify the client)
        addNotification(
          createMilestoneNotification("submitted", escrowId, milestoneIndex, {
            freelancerName:
              wallet.address!.slice(0, 6) + "..." + wallet.address!.slice(-4),
            projectTitle: escrow?.projectTitle || `Project #${escrowId}`,
          }),
          clientAddress ? [clientAddress] : undefined // Notify the client
        );

        // Clear form and close dialog
        setResubmitDescription("");
        setShowResubmitDialog(false);
        setSelectedResubmitEscrow(null);
        setSelectedResubmitMilestone(null);

        // Refresh escrows
        await fetchFreelancerEscrows();

        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent("milestoneResubmitted"));
      } else {
        throw new Error("Transaction failed on blockchain");
      }
    } catch (error) {
      toast({
        title: "Failed to resubmit milestone",
        description: "Could not resubmit your milestone",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const openDispute = async (
    escrowId: string,
    milestoneIndex: number,
    reason: string
  ) => {
    if (!reason.trim()) {
      toast({
        title: "Reason required",
        description: "Please provide a reason for the dispute",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmittingMilestone(`${escrowId}-${milestoneIndex}`);
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      toast({
        title: "Opening dispute...",
        description: "Submitting transaction to open dispute",
      });

      const txHash = await contract.send(
        "disputeMilestone",
        "no-value",
        escrowId,
        milestoneIndex,
        reason
      );

      toast({
        title: "Dispute opened!",
        description: "A dispute has been opened for this milestone",
      });

      // Add notification for dispute opening
      addNotification(
        createMilestoneNotification("disputed", escrowId, milestoneIndex, {
          reason: reason,
          freelancerName:
            wallet.address!.slice(0, 6) + "..." + wallet.address!.slice(-4),
        })
      );

      // Refresh escrows
      await fetchFreelancerEscrows();
    } catch (error) {
      toast({
        title: "Failed to open dispute",
        description: "Could not open dispute for this milestone",
        variant: "destructive",
      });
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const getStatusFromNumber = (status: number): string => {
    const statuses = [
      "Pending",
      "InProgress",
      "Released",
      "Refunded",
      "Disputed",
      "Expired",
    ];
    return statuses[status] || "Unknown";
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
    return statuses[status] || "pending";
  };

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200";
      case "submitted":
        return "bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200";
      case "approved":
        return "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200";
      case "rejected":
        return "bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200";
      case "disputed":
        return "bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200";
      case "resolved":
        return "bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200";
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "inprogress":
        return "bg-blue-100 text-blue-800";
      case "released":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "submitted":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "terminated":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatAmount = (amount: string) => {
    try {
      const num = Number(amount) / 1e18;
      if (isNaN(num) || num < 0) {
        return "0.00";
      }
      return num.toFixed(2);
    } catch (error) {
      return "0.00";
    }
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
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

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Connect Wallet</CardTitle>
            <CardDescription>
              Please connect your wallet to view your freelancer dashboard
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Freelancer Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your assigned projects and track your earnings
            </p>
          </div>
          <Button
            onClick={fetchFreelancerEscrows}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          </div>
        ) : escrows.length === 0 ? (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No assigned projects
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-center">
                You don't have any assigned projects yet. Check the jobs page to
                find open opportunities.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Stats Section */}
            <FreelancerStats
              escrows={escrows}
              freelancerRating={freelancerRating}
              badgeTier={badgeTier}
            />

            {/* Filter and Sort Controls */}
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

            {/* Projects Section */}
            {filteredEscrows.length === 0 ? (
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    No Results Found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-center">
                    Try adjusting your filters or search query.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6">
                {filteredEscrows.map((escrow) => (
                  <motion.div
                    key={escrow.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                              <User className="h-5 w-5" />
                              {escrow.projectTitle ||
                                (escrow.projectDescription
                                  ? escrow.projectDescription.length > 50
                                    ? escrow.projectDescription.substring(
                                      0,
                                      50
                                    ) + "..."
                                    : escrow.projectDescription
                                  : `Project #${escrow.id}`)}
                            </CardTitle>
                            <CardDescription className="mt-1 text-gray-600 dark:text-gray-400">
                              {escrow.projectDescription &&
                                (!escrow.projectTitle ||
                                  escrow.projectDescription.length > 50)
                                ? escrow.projectDescription
                                : `Project ID: #${escrow.id}`}
                            </CardDescription>
                          </div>
                          <Badge
                            className={getStatusColor(
                              escrow.milestones.some(
                                (m) =>
                                  m.status === "disputed" ||
                                  m.status === "rejected"
                              )
                                ? "terminated"
                                : escrow.status
                            )}
                          >
                            {escrow.milestones.some(
                              (m) =>
                                m.status === "disputed" ||
                                m.status === "rejected"
                            )
                              ? "terminated"
                              : escrow.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Total Value
                              </p>
                              <p className="font-semibold text-green-700 dark:text-green-400">
                                {formatAmount(escrow.totalAmount)} tokens
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Released
                              </p>
                              <p className="font-semibold text-blue-700 dark:text-blue-400">
                                {formatAmount(escrow.releasedAmount)} tokens
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Created
                              </p>
                              <p className="font-semibold text-purple-700 dark:text-purple-400">
                                {formatDate(escrow.createdAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                            <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Milestones
                              </p>
                              <p className="font-semibold text-orange-700 dark:text-orange-400">
                                {escrow.milestoneCount ||
                                  escrow.milestones.length}{" "}
                                total
                              </p>
                            </div>
                          </div>
                          <div
                            className={`flex items-center gap-2 p-3 rounded-lg ${(() => {
                              const daysLeft = calculateDaysLeft(
                                escrow.createdAt,
                                escrow.duration
                              );
                              const message = getDaysLeftMessage(daysLeft);
                              return message.bgColor;
                            })()}`}
                          >
                            <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Days Left
                              </p>
                              <p
                                className={`font-semibold ${(() => {
                                  const daysLeft = calculateDaysLeft(
                                    escrow.createdAt,
                                    escrow.duration
                                  );
                                  const message = getDaysLeftMessage(daysLeft);
                                  return message.color;
                                })()}`}
                              >
                                {(() => {
                                  const daysLeft = calculateDaysLeft(
                                    escrow.createdAt,
                                    escrow.duration
                                  );
                                  const message = getDaysLeftMessage(daysLeft);
                                  return message.text;
                                })()}
                              </p>
                            </div>
                          </div>
                          {/* Client Rating Box - Only for completed/released projects */}
                          {(escrow.status.toLowerCase() === "completed" ||
                            escrow.status.toLowerCase() === "released") && (
                              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                <div className="flex-1">
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Client Rating
                                  </p>
                                  {escrowRatings[escrow.id]?.exists ? (
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex items-center gap-0.5">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <Star
                                            key={star}
                                            className={`h-3.5 w-3.5 ${star <=
                                                escrowRatings[escrow.id].rating
                                                ? "fill-yellow-400 text-yellow-400"
                                                : "text-gray-300"
                                              }`}
                                          />
                                        ))}
                                      </div>
                                      <span className="font-semibold text-yellow-700 dark:text-yellow-400 text-sm">
                                        {escrowRatings[escrow.id].rating}/5
                                      </span>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      Pending
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                        </div>

                        {/* Milestones - Compact Design */}
                        <div className="mb-6">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                            Milestones (
                            {escrow.milestoneCount || escrow.milestones.length}{" "}
                            total)
                          </h4>

                          {/* Milestone Progress */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            {escrow.milestones.map((milestone, index) => {
                              const milestoneKey = `${escrow.id}-${index}`;
                              const isApproved =
                                milestone.status === "approved" ||
                                approvedMilestones.has(milestoneKey);
                              const isSubmitted =
                                milestone.status === "submitted" ||
                                submittedMilestones.has(milestoneKey);
                              const isPending =
                                milestone.status === "pending" &&
                                !submittedMilestones.has(milestoneKey) &&
                                !approvedMilestones.has(milestoneKey);

                              // Determine if this is the current milestone that can be submitted
                              let isCurrent = false;
                              let isBlocked = false;
                              if (isPending) {
                                // For the first milestone, it can always be current if pending
                                if (index === 0) {
                                  isCurrent = true;
                                } else {
                                  // For subsequent milestones, check if the previous one is approved
                                  const previousMilestone =
                                    escrow.milestones[index - 1];
                                  const previousMilestoneKey = `${escrow.id}-${index - 1
                                    }`;

                                  // Check if previous milestone is approved
                                  const isPreviousApproved =
                                    previousMilestone &&
                                    (previousMilestone.status === "approved" ||
                                      approvedMilestones.has(
                                        previousMilestoneKey
                                      ));

                                  // Check if there are any submitted milestones before this one that aren't approved
                                  let hasUnapprovedSubmitted = false;
                                  for (let j = 0; j < index; j++) {
                                    const prevMilestone = escrow.milestones[j];
                                    const prevMilestoneKey = `${escrow.id}-${j}`;
                                    const isPrevSubmitted =
                                      prevMilestone.status === "submitted" ||
                                      submittedMilestones.has(prevMilestoneKey);
                                    const isPrevApproved =
                                      prevMilestone.status === "approved" ||
                                      approvedMilestones.has(prevMilestoneKey);

                                    if (isPrevSubmitted && !isPrevApproved) {
                                      hasUnapprovedSubmitted = true;
                                      break;
                                    }
                                  }

                                  // Only allow submission if previous milestone is approved AND no submitted milestones are pending
                                  if (
                                    isPreviousApproved &&
                                    !hasUnapprovedSubmitted
                                  ) {
                                    isCurrent = true;
                                  } else if (hasUnapprovedSubmitted) {
                                    isBlocked = true;
                                  }
                                }
                              }

                              return (
                                <div
                                  key={index}
                                  className={`p-4 rounded-lg border-2 ${isApproved
                                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                      : isSubmitted
                                        ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                                        : isCurrent
                                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                                          : isBlocked
                                            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                                            : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                                    }`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                      Milestone {index + 1}
                                    </span>
                                    <div className="flex gap-1">
                                      {isCurrent && (
                                        <Badge className="bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                                          Current
                                        </Badge>
                                      )}
                                      {isBlocked && (
                                        <Badge className="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200">
                                          Blocked
                                        </Badge>
                                      )}
                                      <Badge
                                        className={getMilestoneStatusColor(
                                          milestone.status
                                        )}
                                      >
                                        {milestone.status}
                                      </Badge>
                                    </div>
                                  </div>

                                  {/* Client Requirements */}
                                  {milestone.description &&
                                    !milestone.description.includes(
                                      "To be defined"
                                    ) &&
                                    milestone.description !==
                                    `Milestone ${index + 1}` && (
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                        <span className="font-medium">
                                          Requirements:
                                        </span>
                                        <p className="mt-1 line-clamp-2">
                                          {milestone.description.length > 80
                                            ? milestone.description.substring(
                                              0,
                                              80
                                            ) + "..."
                                            : milestone.description}
                                        </p>
                                      </div>
                                    )}

                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    {formatAmount(milestone.amount)} tokens
                                  </div>

                                  {/* Show rejected status if milestone is rejected */}
                                  {milestone.status === "rejected" && (
                                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge className="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200">
                                          Rejected - Needs Improvement
                                        </Badge>
                                      </div>

                                      {/* Display feedback directly */}
                                      {milestone.disputeReason && (
                                        <div className="mb-3 p-2 bg-red-100 dark:bg-red-800/30 rounded border border-red-200 dark:border-red-700">
                                          <p className="text-xs font-medium text-red-800 dark:text-red-200 mb-1">
                                            Client Feedback:
                                          </p>
                                          <p className="text-sm text-red-700 dark:text-red-300">
                                            {milestone.disputeReason}
                                          </p>
                                        </div>
                                      )}

                                      <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                                        This milestone was rejected by the
                                        client. Please review the feedback above
                                        and resubmit with improvements.
                                      </p>

                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          className="bg-red-600 hover:bg-red-700 text-white"
                                          onClick={() => {
                                            setSelectedResubmitEscrow(
                                              escrow.id
                                            );
                                            setSelectedResubmitMilestone(index);
                                            setResubmitDescription("");
                                            setShowResubmitDialog(true);
                                          }}
                                        >
                                          Resubmit Work
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Show resolved status if milestone is resolved */}
                                  {milestone.status === "resolved" &&
                                    milestone.resolutionReason && (
                                      <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Badge className="bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200">
                                            Resolved
                                          </Badge>
                                        </div>
                                        <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                                          This dispute has been resolved by the
                                          admin.
                                        </p>
                                        {milestone.winner && (
                                          <div className="mb-2 p-2 bg-purple-100 dark:bg-purple-800/30 rounded border border-purple-200 dark:border-purple-700">
                                            <p className="text-xs font-medium text-purple-800 dark:text-purple-200 mb-1">
                                              Winner:
                                            </p>
                                            <p className="text-sm text-purple-700 dark:text-purple-300">
                                              {milestone.winner ===
                                                escrow.beneficiary
                                                ? "You (Freelancer)"
                                                : milestone.winner ===
                                                  escrow.payer
                                                  ? "Client"
                                                  : `${milestone.winner.slice(
                                                    0,
                                                    6
                                                  )}...${milestone.winner.slice(
                                                    -4
                                                  )}`}
                                            </p>
                                          </div>
                                        )}
                                        <div className="mt-2 p-2 bg-purple-100 dark:bg-purple-800/30 rounded border border-purple-200 dark:border-purple-700">
                                          <p className="text-xs font-medium text-purple-800 dark:text-purple-200 mb-1">
                                            Admin Resolution Reason:
                                          </p>
                                          <p className="text-sm text-purple-700 dark:text-purple-300">
                                            {milestone.resolutionReason}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                  {/* Show disputed status if milestone is disputed */}
                                  {milestone.status === "disputed" && (
                                    <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge className="bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200">
                                          Disputed - Under Review
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                                        This milestone is currently under
                                        dispute. The admin will review the case
                                        and make a fair resolution.
                                      </p>
                                      {milestone.disputeReason && (
                                        <div className="mt-2 p-2 bg-orange-100 dark:bg-orange-800/30 rounded border border-orange-200 dark:border-orange-700">
                                          <p className="text-xs font-medium text-orange-800 dark:text-orange-200 mb-1">
                                            Reason for dispute:
                                          </p>
                                          <p className="text-sm text-orange-700 dark:text-orange-300">
                                            {milestone.disputeReason}
                                          </p>
                                        </div>
                                      )}
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled
                                          className="border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300"
                                        >
                                          Under Review
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Current Milestone Submission Form */}
                          {(() => {
                            // Find the current milestone that can be submitted
                            // Only allow submission of the next milestone in sequence
                            let currentMilestoneIndex = -1;

                            for (let i = 0; i < escrow.milestones.length; i++) {
                              const milestone = escrow.milestones[i];
                              const milestoneKey = `${escrow.id}-${i}`;

                              // Check if this milestone is pending and can be submitted
                              if (
                                milestone.status === "pending" &&
                                !submittedMilestones.has(milestoneKey) &&
                                !approvedMilestones.has(milestoneKey)
                              ) {
                                // For the first milestone, it can always be submitted if pending
                                if (i === 0) {
                                  currentMilestoneIndex = i;
                                  break;
                                }

                                // For subsequent milestones, check if the previous one is approved
                                const previousMilestone =
                                  escrow.milestones[i - 1];
                                const previousMilestoneKey = `${escrow.id}-${i - 1
                                  }`;

                                // Check if previous milestone is approved
                                const isPreviousApproved =
                                  previousMilestone &&
                                  (previousMilestone.status === "approved" ||
                                    approvedMilestones.has(
                                      previousMilestoneKey
                                    ));

                                // Check if there are any submitted milestones before this one that aren't approved
                                let hasUnapprovedSubmitted = false;
                                for (let j = 0; j < i; j++) {
                                  const prevMilestone = escrow.milestones[j];
                                  const prevMilestoneKey = `${escrow.id}-${j}`;
                                  const isPrevSubmitted =
                                    prevMilestone.status === "submitted" ||
                                    submittedMilestones.has(prevMilestoneKey);
                                  const isPrevApproved =
                                    prevMilestone.status === "approved" ||
                                    approvedMilestones.has(prevMilestoneKey);

                                  if (isPrevSubmitted && !isPrevApproved) {
                                    hasUnapprovedSubmitted = true;
                                    break;
                                  }
                                }

                                // Only allow submission if previous milestone is approved AND no submitted milestones are pending
                                if (
                                  isPreviousApproved &&
                                  !hasUnapprovedSubmitted
                                ) {
                                  currentMilestoneIndex = i;
                                  break;
                                }
                              }
                            }

                            if (currentMilestoneIndex === -1) {
                              return (
                                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
                                  <p className="text-gray-600 dark:text-gray-400">
                                    All milestones completed or in progress
                                  </p>
                                </div>
                              );
                            }

                            const currentMilestone =
                              escrow.milestones[currentMilestoneIndex];
                            const milestoneKey = `${escrow.id}-${currentMilestoneIndex}`;
                            const isSubmitted =
                              currentMilestone.status === "submitted" ||
                              submittedMilestones.has(milestoneKey);
                            const canSubmit =
                              currentMilestone.status === "pending" &&
                              (escrow.status === "active" ||
                                escrow.status === "inprogress") &&
                              !submittedMilestones.has(milestoneKey) &&
                              !approvedMilestones.has(milestoneKey);

                            // Don't show form if milestone is already submitted
                            if (isSubmitted) {
                              return (
                                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h5 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
                                        Milestone {currentMilestoneIndex + 1}{" "}
                                        Submitted
                                      </h5>
                                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                        Awaiting client approval...
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Badge className="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100">
                                        Submitted
                                      </Badge>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedEscrowId(escrow.id);
                                          setSelectedMilestoneIndex(
                                            currentMilestoneIndex
                                          );
                                          setDisputeReason("");
                                          setShowDisputeDialog(true);
                                        }}
                                      >
                                        Dispute
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
                                  Submit Milestone {currentMilestoneIndex + 1}
                                </h5>

                                {/* Client Requirements */}
                                {currentMilestone.description &&
                                  !currentMilestone.description.includes(
                                    "To be defined"
                                  ) &&
                                  currentMilestone.description !==
                                  `Milestone ${currentMilestoneIndex + 1
                                  }` && (
                                    <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                                      <div className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                                        Client Requirements:
                                      </div>
                                      <div className="text-sm text-blue-700 dark:text-blue-300">
                                        {currentMilestone.description}
                                      </div>
                                    </div>
                                  )}

                                {/* Show input form only if not submitted */}
                                {!isSubmitted && (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Your Work Description
                                      </label>
                                      <Textarea
                                        value={
                                          milestoneDescriptions[milestoneKey] ||
                                          ""
                                        }
                                        onChange={(e) =>
                                          setMilestoneDescriptions((prev) => ({
                                            ...prev,
                                            [milestoneKey]: e.target.value,
                                          }))
                                        }
                                        className="text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                                        rows={3}
                                        placeholder="Describe what you've completed for this milestone..."
                                      />
                                    </div>

                                    <div className="flex gap-2">
                                      {canSubmit && (
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            submitMilestone(
                                              escrow.id,
                                              currentMilestoneIndex
                                            )
                                          }
                                          disabled={
                                            submittingMilestone ===
                                            milestoneKey ||
                                            !milestoneDescriptions[
                                              milestoneKey
                                            ]?.trim()
                                          }
                                        >
                                          {submittingMilestone === milestoneKey
                                            ? "Submitting..."
                                            : "Submit Milestone"}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Show submitted status if milestone is submitted */}
                                {isSubmitted && (
                                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge className="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200">
                                        Submitted - Awaiting Approval
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                                      Your milestone has been submitted and is
                                      waiting for client approval.
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setSelectedEscrowId(escrow.id);
                                        setSelectedMilestoneIndex(
                                          currentMilestoneIndex
                                        );
                                        setDisputeReason("");
                                        setShowDisputeDialog(true);
                                      }}
                                      className="border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-800"
                                    >
                                      Dispute
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                          {(escrow.status === "pending" ||
                            escrow.status === "Pending") && (
                              <Button
                                onClick={() => startWork(escrow.id)}
                                className="flex items-center gap-2"
                              >
                                <Play className="h-4 w-4" />
                                Start Work
                              </Button>
                            )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dispute Dialog */}
        {showDisputeDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle>Open Dispute</CardTitle>
                <CardDescription>
                  Provide a reason for disputing this milestone
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Dispute Reason
                    </label>
                    <textarea
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Explain why you're disputing this milestone..."
                      className="w-full p-3 border rounded-lg resize-none"
                      rows={4}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (
                          selectedEscrowId &&
                          selectedMilestoneIndex !== null
                        ) {
                          openDispute(
                            selectedEscrowId,
                            selectedMilestoneIndex,
                            disputeReason
                          );
                          setShowDisputeDialog(false);
                        }
                      }}
                      disabled={
                        !disputeReason.trim() || submittingMilestone !== null
                      }
                      className="flex-1"
                    >
                      {submittingMilestone ? "Opening..." : "Open Dispute"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowDisputeDialog(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Resubmit Dialog */}
        {showResubmitDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle>Resubmit Milestone</CardTitle>
                <CardDescription>
                  Resubmit milestone 1 for client review. Make sure you've
                  addressed the feedback.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Show rejection reason if available */}
                  {selectedResubmitEscrow &&
                    selectedResubmitMilestone !== null && (
                      <div>
                        <label className="block text-sm font-medium mb-2 text-red-600">
                          Rejection Reason
                        </label>
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                          {(() => {
                            const escrow = escrows.find(
                              (e) => e.id === selectedResubmitEscrow
                            );
                            if (
                              escrow &&
                              escrow.milestones &&
                              escrow.milestones[selectedResubmitMilestone]
                            ) {
                              const milestone =
                                escrow.milestones[selectedResubmitMilestone];
                              // The rejection reason should be in the last field of the milestone data
                              return (
                                milestone.rejectionReason ||
                                "No reason provided"
                              );
                            }
                            return "No reason provided";
                          })()}
                        </div>
                      </div>
                    )}

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Update Message
                    </label>
                    <textarea
                      value={resubmitDescription}
                      onChange={(e) => setResubmitDescription(e.target.value)}
                      placeholder="Describe the improvements you've made to address the client's feedback..."
                      className="w-full p-3 border rounded-lg resize-none"
                      rows={4}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This message will be sent to the client along with your
                      resubmission.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (
                          selectedResubmitEscrow &&
                          selectedResubmitMilestone !== null
                        ) {
                          resubmitMilestone(
                            selectedResubmitEscrow,
                            selectedResubmitMilestone,
                            resubmitDescription
                          );
                        }
                      }}
                      disabled={
                        !resubmitDescription.trim() ||
                        submittingMilestone !== null
                      }
                      className="flex-1"
                    >
                      {submittingMilestone
                        ? "Resubmitting..."
                        : "Resubmit Milestone"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowResubmitDialog(false);
                        setResubmitDescription("");
                        setSelectedResubmitEscrow(null);
                        setSelectedResubmitMilestone(null);
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
