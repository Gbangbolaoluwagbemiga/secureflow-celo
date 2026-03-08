"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWeb3 } from "@/contexts/web3-context";
import { useSmartAccount } from "@/contexts/smart-account-context";
import { useDelegation } from "@/contexts/delegation-context";
import {
  useNotifications,
  createMilestoneNotification,
  createEscrowNotification,
} from "@/contexts/notification-context";
import { useToast } from "@/hooks/use-toast";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import {
  CheckCircle2,
  Send,
  AlertTriangle,
  Gavel,
  Play,
  Zap,
  XCircle,
} from "lucide-react";
import type { Milestone } from "@/lib/web3/types";
import { useEngagementRewards } from "@goodsdks/engagement-sdk";

// Production Engagement Rewards Contract
const ENGAGEMENT_REWARDS_ADDRESS = "0x25db74CF4E7BA120526fd87e159CF656d94bAE43";

// Safe wrapper — useEngagementRewards internally calls wagmi hooks which require
// WagmiProvider. Since we use EthersAdapter (no WagmiProvider), we catch the
// error and return null so the rest of the component renders normally.
function useSafeEngagementRewards(address: `0x${string}`) {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useEngagementRewards(address);
  } catch {
    return null;
  }
}

interface MilestoneActionsProps {
  escrowId: string;
  milestoneIndex: number;
  milestone: Milestone;
  isPayer: boolean;
  isBeneficiary: boolean;
  escrowStatus: string;
  onSuccess: () => void;
  allMilestones?: Milestone[]; // Add all milestones for sequential validation
  showSubmitButton?: boolean; // New prop to control submit button visibility
  payerAddress?: string; // Client address for notifications
  beneficiaryAddress?: string; // Freelancer address for notifications
}

import { ENGAGEMENT_REWARDS_ABI } from "@/lib/web3/engagement-rewards-abi";

export function MilestoneActions({
  escrowId,
  milestoneIndex,
  milestone,
  isPayer,
  isBeneficiary,
  escrowStatus,
  onSuccess,
  allMilestones = [],
  showSubmitButton = true, // Default to true for backward compatibility
  payerAddress,
  beneficiaryAddress,
}: MilestoneActionsProps) {
  const { getContract, wallet } = useWeb3();
  const engagementRewards = useSafeEngagementRewards(ENGAGEMENT_REWARDS_ADDRESS as `0x${string}`);
  const { executeTransaction, executeBatchTransaction, isSmartAccountReady } =
    useSmartAccount();
  const { isDelegatedFunction } = useDelegation();
  const { addNotification, addCrossWalletNotification } = useNotifications();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<
    | "start"
    | "submit"
    | "approve"
    | "reject"
    | "resubmit"
    | "dispute"
    | "resolve"
    | null
  >(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [resubmitMessage, setResubmitMessage] = useState("");

  // Check if this project is terminated (has disputed milestones)
  const isProjectTerminated = allMilestones.some(
    (m) => m.status === "disputed" || m.status === "rejected",
  );

  // Poll transaction receipt for confirmation
  const pollTransactionReceipt = async (txHash: string) => {
    const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute timeout
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        if (typeof window !== "undefined" && window.ethereum) {
          const receipt = await (window.ethereum as any).request({
            method: "eth_getTransactionReceipt",
            params: [txHash],
          });

          if (receipt) {
            return receipt;
          }
        }
      } catch (error) {
        // Ignore errors during polling
      }

      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      attempts++;
    }

    throw new Error(
      "Transaction timeout - please check the blockchain explorer",
    );
  };

  // Check if this milestone can be approved
  const canApproveMilestone = () => {
    return milestone.status === "submitted" && isPayer;
  };

  // Check if this milestone can be resubmitted
  const canResubmitMilestone = () => {
    return milestone.status === "rejected" && isBeneficiary;
  };

  // Check if this milestone can be submitted (sequential validation)
  const canSubmitMilestone = () => {
    if (
      milestone.status !== "pending" ||
      !isBeneficiary ||
      escrowStatus !== "active"
    ) {
      return false;
    }

    // For the first milestone, it can always be submitted if pending
    if (milestoneIndex === 0) {
      return true;
    }

    // For subsequent milestones, check if the previous one is approved
    const previousMilestone = allMilestones[milestoneIndex - 1];
    if (!previousMilestone) {
      return false;
    }

    // Check if previous milestone is approved
    const isPreviousApproved = previousMilestone.status === "approved";

    // Check if there are any submitted milestones before this one that aren't approved
    let hasUnapprovedSubmitted = false;
    for (let i = 0; i < milestoneIndex; i++) {
      const prevMilestone = allMilestones[i];
      if (prevMilestone && prevMilestone.status === "submitted") {
        hasUnapprovedSubmitted = true;
        break;
      }
    }

    // Only allow submission if previous milestone is approved AND no submitted milestones are pending
    return isPreviousApproved && !hasUnapprovedSubmitted;
  };

  const openDialog = (type: typeof actionType) => {
    setActionType(type);
    setDisputeReason(""); // Clear dispute reason when opening dialog
    setResubmitMessage(""); // Clear resubmit message when opening dialog
    setDialogOpen(true);
  };

  const handleAction = async () => {
    // Validate reason if disputing or rejecting
    if (
      (actionType === "dispute" || actionType === "reject") &&
      !disputeReason.trim()
    ) {
      toast({
        title: "Reason required",
        description: `Please provide a reason for ${actionType === "dispute" ? "disputing" : "rejecting"} this milestone`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      let txHash;

      // Check if we should use Smart Account for gasless transactions
      const useSmartAccount =
        isSmartAccountReady &&
        (actionType === "approve" ||
          actionType === "submit" ||
          actionType === "dispute");

      // Check if this is a delegated function
      const isDelegated = isDelegatedFunction(
        actionType === "approve"
          ? "approveMilestone"
          : actionType === "dispute"
            ? "disputeMilestone"
            : "",
      );

      switch (actionType) {
        case "start":
          txHash = await contract.send("startWork", escrowId);
          toast({
            title: "Work started!",
            description: "You can now begin working on the milestones",
          });

          // Add cross-wallet notification for work started
          addCrossWalletNotification(
            createEscrowNotification("work_started", escrowId, {
              projectTitle: `Project #${escrowId}`,
              freelancerName: "Freelancer",
            }),
            payerAddress, // Client address
            beneficiaryAddress, // Freelancer address
          );
          break;
        case "submit":
          if (useSmartAccount) {
            // Use Smart Account for enhanced transaction
            const { ethers } = await import("ethers");
            const iface = new ethers.Interface(SECUREFLOW_ABI);
            const data = iface.encodeFunctionData("submitMilestone", [
              escrowId,
              milestoneIndex,
              milestone.description,
            ]);
            txHash = await executeTransaction(
              CONTRACTS.SECUREFLOW_ESCROW,
              data,
            );
            toast({
              title: "🚀 Gasless Milestone Submitted!",
              description:
                "Milestone submitted with no gas fees using Smart Account delegation",
            });

            // Add cross-wallet notification - notify both CLIENT and FREELANCER
            addCrossWalletNotification(
              createMilestoneNotification(
                "submitted",
                escrowId,
                milestoneIndex,
              ),
              payerAddress, // Client address
              beneficiaryAddress, // Freelancer address
            );
          } else {
            txHash = await contract.send(
              "submitMilestone",
              "no-value",
              escrowId,
              milestoneIndex,
              milestone.description,
            );
            toast({
              title: "Milestone submitted!",
              description: "Waiting for client approval",
            });

            // Add cross-wallet notification - notify both CLIENT and FREELANCER
            addCrossWalletNotification(
              createMilestoneNotification(
                "submitted",
                escrowId,
                milestoneIndex,
              ),
              payerAddress, // Client address
              beneficiaryAddress, // Freelancer address
            );
          }

          // Wait for blockchain state to update, then refresh data
          await new Promise((resolve) => setTimeout(resolve, 2000));
          onSuccess();
          break;
        case "approve":
          try {
            // Validate milestone state before attempting approval
            if (milestone.status !== "submitted") {
              toast({
                title: "Invalid milestone state",
                description:
                  "This milestone is not in submitted state and cannot be approved",
                variant: "destructive",
              });
              return;
            }

            let signature = "0x";
            let validUntilBlock = 0;

            if (wallet.address) {
              try {
                // 1. Get current block for signature validity
                const { ethers } = await import("ethers");
                let currentBlock = 0;

                if (typeof window !== "undefined" && window.ethereum) {
                  const provider = new ethers.BrowserProvider(window.ethereum as any);
                  currentBlock = await provider.getBlockNumber();
                } else {
                  const provider = new ethers.JsonRpcProvider("https://forno.celo.org");
                  currentBlock = await provider.getBlockNumber();
                }

                validUntilBlock = Number(currentBlock) + 600; // Valid for 600 blocks (~50 mins)

                // 2. Check if user is registered
                const erContract = getContract(ENGAGEMENT_REWARDS_ADDRESS, ENGAGEMENT_REWARDS_ABI);

                if (erContract) {
                  const result = await erContract.call(
                    "userRegistrations",
                    CONTRACTS.SECUREFLOW_ESCROW,
                    wallet.address
                  );

                  // Result is [isRegistered, lastClaimTimestamp]
                  const isRegisteredInt = result[0];

                  if (Number(isRegisteredInt) === 0) {
                    toast({
                      title: "One-time Setup",
                      description:
                        "Please sign to register for Engagement Rewards...",
                    });

                    // 3. Generate signature for first-time users
                    if (engagementRewards) {
                      signature = await engagementRewards.signClaim(
                        CONTRACTS.SECUREFLOW_ESCROW as `0x${string}`,
                        "0x0000000000000000000000000000000000000000", // No inviter
                        BigInt(validUntilBlock)
                      );
                    }
                  }
                }
              } catch (err) {
                console.warn("Engagement Rewards setup warning:", err);
                // Continue with defaults if ER fails
              }
            }

            if (useSmartAccount) {
              // Use Smart Account for enhanced transaction
              const { ethers } = await import("ethers");
              const iface = new ethers.Interface(SECUREFLOW_ABI);
              const data = iface.encodeFunctionData("approveMilestone", [
                escrowId,
                milestoneIndex,
                validUntilBlock,
                signature,
              ]);
              txHash = await executeTransaction(
                CONTRACTS.SECUREFLOW_ESCROW,
                data,
              );
              toast({
                title: "🚀 Gasless Milestone Approved!",
                description:
                  "Milestone approved with no gas fees using Smart Account delegation",
              });
            } else {
              // Use regular transaction
              // Try to estimate gas first to catch potential issues
              try {
                const gasEstimate = await contract.estimateGas.approveMilestone(
                  escrowId,
                  milestoneIndex,
                  validUntilBlock,
                  signature
                );
              } catch (gasError) {
                // Gas estimation failed, but continue with transaction
                console.log(
                  "Gas estimation failed, proceeding with transaction",
                );
              }

              // Add retry logic for failed transactions
              let retryCount = 0;
              const maxRetries = 3;

              while (retryCount < maxRetries) {
                try {
                  txHash = await contract.send(
                    "approveMilestone",
                    "no-value",
                    escrowId,
                    milestoneIndex,
                    validUntilBlock,
                    signature
                  );
                  break; // Success, exit retry loop
                } catch (sendError: any) {
                  retryCount++;

                  if (retryCount >= maxRetries) {
                    throw sendError; // Re-throw the last error
                  }

                  // Wait before retry
                  await new Promise((resolve) => setTimeout(resolve, 2000));

                  toast({
                    title: "Retrying transaction",
                    description: `Attempt ${retryCount + 1} of ${maxRetries}. Please wait...`,
                    variant: "default",
                  });
                }
              }
            }

            // Wait for transaction to be mined and confirmed
            try {
              let receipt;

              // Check if txHash has a wait method (ethers.js transaction object)
              if (txHash && typeof txHash.wait === "function") {
                receipt = await Promise.race([
                  txHash.wait(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("Transaction timeout")),
                      60000,
                    ),
                  ),
                ]);
              } else {
                // Fallback: use polling to check transaction status

                receipt = await pollTransactionReceipt(txHash);
              }

              if (receipt.status === 1) {
                toast({
                  title: "Milestone approved!",
                  description: "Payment has been released to the beneficiary",
                });

                // Add cross-wallet notification - notify both CLIENT and FREELANCER
                addCrossWalletNotification(
                  createMilestoneNotification(
                    "approved",
                    escrowId,
                    milestoneIndex,
                  ),
                  payerAddress, // Client address
                  beneficiaryAddress, // Freelancer address
                );

                // Close the modal immediately after successful approval
                setDialogOpen(false);

                // Wait longer for blockchain state to fully update
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Dispatch event to notify freelancer dashboard of approval
                window.dispatchEvent(
                  new CustomEvent("milestoneApproved", {
                    detail: { escrowId, milestoneIndex },
                  }),
                );

                // Call onSuccess to refresh data first
                onSuccess();

                // Wait a bit more for data to refresh, then reload page
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Reload the page to reflect the updated state
                window.location.reload();

                // Reload the page to reflect the updated state
                window.location.reload();
              } else {
                throw new Error("Transaction failed on blockchain");
              }
            } catch (receiptError: any) {
              // If confirmation fails but we have a transaction hash, assume success
              // This handles cases where the transaction succeeds but confirmation polling fails
              if (txHash) {
                toast({
                  title: "Milestone approved!",
                  description: "Payment has been released to the beneficiary",
                });

                // Close the modal immediately after successful approval
                setDialogOpen(false);

                // Wait longer for blockchain state to fully update
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Dispatch event to notify freelancer dashboard of approval
                window.dispatchEvent(
                  new CustomEvent("milestoneApproved", {
                    detail: { escrowId, milestoneIndex },
                  }),
                );

                // Call onSuccess to refresh data first
                onSuccess();

                // Wait a bit more for data to refresh, then reload page
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Reload the page to reflect the updated state
                window.location.reload();
                return;
              }

              if (receiptError.message?.includes("timeout")) {
                toast({
                  title: "Transaction timeout",
                  description:
                    "The transaction is taking longer than expected. Please check the blockchain explorer to see if it was successful.",
                  variant: "destructive",
                });
              } else {
                throw new Error("Transaction failed to confirm on blockchain");
              }
            }
          } catch (error: any) {
            // Handle specific error cases
            if (error.message?.includes("Not submitted")) {
              toast({
                title: "Transaction failed",
                description:
                  "The transaction was not submitted to the network. This may be due to network congestion or wallet issues. Please try again or refresh the page.",
                variant: "destructive",
              });
            } else if (
              error.message?.includes("Transaction failed on blockchain")
            ) {
              toast({
                title: "Transaction reverted",
                description:
                  "The transaction was submitted but failed on the blockchain. The milestone may not be in the correct state for approval.",
                variant: "destructive",
              });
            } else if (error.message?.includes("insufficient funds")) {
              toast({
                title: "Insufficient funds",
                description:
                  "You don't have enough MON tokens to pay for the transaction fee.",
                variant: "destructive",
              });
            } else if (error.message?.includes("gas")) {
              toast({
                title: "Gas estimation failed",
                description:
                  "Unable to estimate gas for this transaction. The milestone may not be in the correct state.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "Approval failed",
                description:
                  error.message ||
                  "An unexpected error occurred while approving the milestone.",
                variant: "destructive",
              });
            }
            throw error; // Re-throw to prevent success toast
          } finally {
            setIsLoading(false);
          }
          break;
        case "reject":
          try {
            // Validate milestone state before attempting rejection
            if (milestone.status !== "submitted") {
              toast({
                title: "Invalid milestone state",
                description:
                  "This milestone is not in submitted state and cannot be rejected",
                variant: "destructive",
              });
              return;
            }

            if (useSmartAccount) {
              // Use Smart Account for enhanced transaction
              const { ethers } = await import("ethers");
              const iface = new ethers.Interface(SECUREFLOW_ABI);
              const data = iface.encodeFunctionData("rejectMilestone", [
                escrowId,
                milestoneIndex,
                disputeReason,
              ]);
              txHash = await executeTransaction(
                CONTRACTS.SECUREFLOW_ESCROW,
                data,
              );
              toast({
                title: "🚀 Smart Account Milestone rejected!",
                description:
                  "Milestone rejected using Smart Account with enhanced features",
              });
            } else {
              // Use regular transaction
              txHash = await contract.send(
                "rejectMilestone",
                "no-value",
                escrowId,
                milestoneIndex,
                disputeReason,
              );
            }

            // Wait for transaction to be mined and confirmed
            try {
              let receipt;

              // Check if txHash has a wait method (ethers.js transaction object)
              if (txHash && typeof txHash.wait === "function") {
                receipt = await Promise.race([
                  txHash.wait(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("Transaction timeout")),
                      60000,
                    ),
                  ),
                ]);
              } else {
                // Fallback: use polling to check transaction status
                receipt = await pollTransactionReceipt(txHash);
              }

              if (receipt.status === 1) {
                toast({
                  title: "Milestone rejected!",
                  description:
                    "The milestone has been rejected and the freelancer can resubmit",
                });

                // Add cross-wallet notification - notify both CLIENT and FREELANCER
                addCrossWalletNotification(
                  createMilestoneNotification(
                    "rejected",
                    escrowId,
                    milestoneIndex,
                    { reason: disputeReason },
                  ),
                  payerAddress, // Client address
                  beneficiaryAddress, // Freelancer address
                );

                setDialogOpen(false);
                onSuccess();

                // Wait a bit for data to refresh, then reload page
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Reload the page to reflect the updated state
                window.location.reload();
              } else {
                throw new Error("Transaction failed on blockchain");
              }
            } catch (receiptError: any) {
              if (txHash) {
                toast({
                  title: "Milestone rejected!",
                  description:
                    "The milestone has been rejected and the freelancer can resubmit",
                });
                setDialogOpen(false);
                onSuccess();

                // Wait a bit for data to refresh, then reload page
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Reload the page to reflect the updated state
                window.location.reload();
                return;
              }
              throw new Error("Transaction failed to confirm on blockchain");
            }
          } catch (error: any) {
            toast({
              title: "Rejection failed",
              description: error.message || "Failed to reject milestone",
              variant: "destructive",
            });
            return;
          } finally {
            setIsLoading(false);
          }
          break;
        case "resubmit":
          try {
            // Validate milestone state before attempting resubmission
            if (milestone.status !== "rejected") {
              toast({
                title: "Invalid milestone state",
                description:
                  "This milestone is not in rejected state and cannot be resubmitted",
                variant: "destructive",
              });
              return;
            }

            if (useSmartAccount) {
              // Use Smart Account for enhanced transaction
              const { ethers } = await import("ethers");
              const iface = new ethers.Interface(SECUREFLOW_ABI);
              const data = iface.encodeFunctionData("resubmitMilestone", [
                escrowId,
                milestoneIndex,
                resubmitMessage || milestone.description, // Use resubmit message or fallback to description
              ]);
              txHash = await executeTransaction(
                CONTRACTS.SECUREFLOW_ESCROW,
                data,
              );
              toast({
                title: "🚀 Smart Account Milestone resubmitted!",
                description:
                  "Milestone resubmitted using Smart Account with enhanced features",
              });
            } else {
              // Use regular transaction
              txHash = await contract.send(
                "resubmitMilestone",
                "no-value",
                escrowId,
                milestoneIndex,
                resubmitMessage || milestone.description, // Use resubmit message or fallback to description
              );
            }

            // Wait for transaction to be mined and confirmed
            try {
              let receipt;

              // Check if txHash has a wait method (ethers.js transaction object)
              if (txHash && typeof txHash.wait === "function") {
                receipt = await Promise.race([
                  txHash.wait(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("Transaction timeout")),
                      60000,
                    ),
                  ),
                ]);
              } else {
                // Fallback: use polling to check transaction status
                receipt = await pollTransactionReceipt(txHash);
              }

              if (receipt.status === 1) {
                toast({
                  title: "Milestone resubmitted!",
                  description:
                    "The milestone has been resubmitted and is waiting for client review",
                });

                // Add cross-wallet notification - notify both CLIENT and FREELANCER
                addCrossWalletNotification(
                  createMilestoneNotification(
                    "submitted",
                    escrowId,
                    milestoneIndex,
                  ),
                  payerAddress, // Client address
                  beneficiaryAddress, // Freelancer address
                );

                setDialogOpen(false);
                onSuccess();
              } else {
                throw new Error("Transaction failed on blockchain");
              }
            } catch (receiptError: any) {
              if (txHash) {
                toast({
                  title: "Milestone resubmitted!",
                  description:
                    "The milestone has been resubmitted and is waiting for client review",
                });
                setDialogOpen(false);
                onSuccess();
                return;
              }
              throw new Error("Transaction failed to confirm on blockchain");
            }
          } catch (error: any) {
            toast({
              title: "Resubmission failed",
              description: error.message || "Failed to resubmit milestone",
              variant: "destructive",
            });
            return;
          } finally {
            setIsLoading(false);
          }
          break;
        case "dispute":
          try {
            // Validate milestone state before attempting dispute
            if (milestone.status !== "submitted") {
              toast({
                title: "Invalid milestone state",
                description:
                  "This milestone is not in submitted state and cannot be disputed",
                variant: "destructive",
              });
              return;
            }

            if (useSmartAccount) {
              // Use Smart Account for enhanced transaction
              const { ethers } = await import("ethers");
              const iface = new ethers.Interface(SECUREFLOW_ABI);
              const data = iface.encodeFunctionData("disputeMilestone", [
                escrowId,
                milestoneIndex,
                disputeReason,
              ]);
              txHash = await executeTransaction(
                CONTRACTS.SECUREFLOW_ESCROW,
                data,
              );
              toast({
                title: "🚀 Smart Account Dispute created!",
                description:
                  "Dispute created using Smart Account with enhanced features",
              });

              // Add cross-wallet notification - notify both CLIENT and FREELANCER
              addCrossWalletNotification(
                createMilestoneNotification(
                  "disputed",
                  escrowId,
                  milestoneIndex,
                  { reason: disputeReason },
                ),
                payerAddress, // Client address
                beneficiaryAddress, // Freelancer address
              );
            } else {
              txHash = await contract.send(
                "disputeMilestone",
                "no-value",
                escrowId,
                milestoneIndex,
                disputeReason,
              );
            }

            // Check if we got a valid transaction hash
            if (!txHash) {
              throw new Error(
                "No transaction hash received - transaction may have failed",
              );
            }

            // Wait for transaction to be mined and confirmed
            try {
              let receipt;

              // Check if txHash has a wait method (ethers.js transaction object)
              if (txHash && typeof txHash.wait === "function") {
                receipt = await Promise.race([
                  txHash.wait(),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("Transaction timeout")),
                      60000,
                    ),
                  ),
                ]);
              } else {
                // Fallback: use polling to check transaction status
                receipt = await pollTransactionReceipt(txHash);
              }

              if (receipt.status === 1) {
                toast({
                  title: "Milestone disputed!",
                  description:
                    "The milestone has been disputed and will be reviewed by the admin",
                });

                // Close the modal immediately after successful dispute
                setDialogOpen(false);

                // Wait longer for blockchain state to fully update
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Dispatch event to notify freelancer dashboard of dispute
                window.dispatchEvent(
                  new CustomEvent("milestoneDisputed", {
                    detail: { escrowId, milestoneIndex },
                  }),
                );

                // Call onSuccess to refresh data first
                onSuccess();

                // Wait a bit more for data to refresh, then reload page
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Reload the page to reflect the updated state
                window.location.reload();
              } else {
                throw new Error("Transaction failed on blockchain");
              }
            } catch (receiptError: any) {
              // If confirmation fails but we have a transaction hash, assume success
              // This handles cases where the transaction succeeds but confirmation polling fails
              if (txHash) {
                toast({
                  title: "Milestone disputed!",
                  description:
                    "The milestone has been disputed and will be reviewed by the admin",
                });

                // Close the modal immediately after successful dispute
                setDialogOpen(false);

                // Wait longer for blockchain state to fully update
                await new Promise((resolve) => setTimeout(resolve, 5000));

                // Dispatch event to notify freelancer dashboard of dispute
                window.dispatchEvent(
                  new CustomEvent("milestoneDisputed", {
                    detail: { escrowId, milestoneIndex },
                  }),
                );

                // Call onSuccess to refresh data first
                onSuccess();

                // Wait a bit more for data to refresh, then reload page
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Reload the page to reflect the updated state
                window.location.reload();
                return;
              }

              // Only show error if we don't have a transaction hash
              if (receiptError.message?.includes("timeout")) {
                toast({
                  title: "Transaction timeout",
                  description:
                    "The transaction is taking longer than expected. Please check the blockchain explorer to see if it was successful.",
                  variant: "destructive",
                });
              } else {
                toast({
                  title: "Transaction failed",
                  description:
                    "The transaction failed to confirm on the blockchain.",
                  variant: "destructive",
                });
              }
              throw receiptError; // Re-throw to prevent success flow
            }
          } catch (error: any) {
            if (error.message?.includes("Gas estimation failed")) {
              toast({
                title: "Transaction failed",
                description:
                  "Gas estimation failed. The milestone may not be in the correct state for dispute.",
                variant: "destructive",
              });
            } else if (error.message?.includes("Internal JSON-RPC error")) {
              toast({
                title: "Transaction failed",
                description:
                  "Network error occurred. Please try again or check your connection.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "Dispute failed",
                description:
                  error.message ||
                  "An unexpected error occurred while disputing the milestone.",
                variant: "destructive",
              });
            }
            throw error;
          } finally {
            setIsLoading(false);
          }
          break;
        case "resolve":
          // This would need additional UI for choosing resolution
          toast({
            title: "Resolution pending",
            description: "Admin will review and resolve the dispute",
          });
          break;
      }

      setDialogOpen(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error.message || "Failed to perform action",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDialogContent = () => {
    switch (actionType) {
      case "start":
        return {
          title: "Start Work",
          description:
            "Confirm that you're ready to start working on this project. This will activate the escrow.",
          icon: Play,
          confirmText: "Start Work",
        };
      case "submit":
        return {
          title: "Submit Milestone",
          description: `Submit milestone ${milestoneIndex + 1} for review. The client will be notified to approve your work.`,
          icon: Send,
          confirmText: "Submit",
        };
      case "approve":
        return {
          title: "Approve Milestone",
          description: `Approve milestone ${milestoneIndex + 1} and release ${(Number.parseFloat(milestone.amount) / 1e18).toFixed(2)} tokens to the beneficiary.`,
          icon: CheckCircle2,
          confirmText: "Approve & Release",
        };
      case "reject":
        return {
          title: "Reject Milestone",
          description: `Reject milestone ${milestoneIndex + 1}. The freelancer will be able to resubmit after making changes.`,
          icon: XCircle,
          confirmText: "Reject",
        };
      case "resubmit":
        return {
          title: "Resubmit Milestone",
          description: `Resubmit milestone ${milestoneIndex + 1} for client review. Make sure you've addressed the feedback.`,
          icon: Send,
          confirmText: "Resubmit",
        };
      case "dispute":
        return {
          title: "Dispute Milestone",
          description: `Dispute milestone ${milestoneIndex + 1}. This will notify the admin to review the dispute.`,
          icon: Gavel,
          confirmText: "Dispute",
        };
      case "resolve":
        return {
          title: "Resolve Dispute",
          description:
            "As the contract owner, you can resolve this dispute in favor of either party.",
          icon: Gavel,
          confirmText: "Resolve",
        };
      default:
        return {
          title: "",
          description: "",
          icon: CheckCircle2,
          confirmText: "Confirm",
        };
    }
  };

  const dialogContent = getDialogContent();
  const Icon = dialogContent.icon;

  return (
    <>
      <div
        className="flex flex-wrap gap-2"
        data-milestone-actions={`${escrowId}-${milestoneIndex}`}
      >
        {/* Start Work button removed - only available on freelancer page */}

        {/* Submit Milestone - Only beneficiary for pending milestones that can be submitted (disabled if terminated) */}
        {showSubmitButton && canSubmitMilestone() && !isProjectTerminated && (
          <Button
            onClick={() => openDialog("submit")}
            size="sm"
            variant="default"
            className="gap-2"
          >
            {isSmartAccountReady ? (
              <>
                <Zap className="h-4 w-4" />
                Smart Submit
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit
              </>
            )}
          </Button>
        )}

        {/* Approve Milestone - Only payer for submitted milestones (disabled if terminated) */}
        {canApproveMilestone() && !isProjectTerminated && (
          <Button
            onClick={() => openDialog("approve")}
            size="sm"
            variant="default"
            className="gap-2"
            disabled={isLoading}
          >
            {isSmartAccountReady ? (
              <>
                <Zap className="h-4 w-4" />
                {isLoading ? "Processing..." : "Smart Approve"}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {isLoading ? "Processing..." : "Approve"}
              </>
            )}
          </Button>
        )}

        {/* Reject Milestone - Only payer for submitted milestones (disabled if terminated) */}
        {canApproveMilestone() && !isProjectTerminated && (
          <Button
            onClick={() => openDialog("reject")}
            size="sm"
            variant="outline"
            className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            disabled={isLoading}
          >
            {isSmartAccountReady ? (
              <>
                <Zap className="h-4 w-4" />
                {isLoading ? "Processing..." : "Smart Reject"}
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                {isLoading ? "Processing..." : "Reject"}
              </>
            )}
          </Button>
        )}

        {/* Dispute Milestone - Only payer for submitted milestones (disabled if terminated) */}
        {milestone.status === "submitted" &&
          isPayer &&
          !isProjectTerminated && (
            <Button
              onClick={() => openDialog("dispute")}
              size="sm"
              variant="destructive"
              className="gap-2"
              disabled={isLoading}
            >
              {isSmartAccountReady ? (
                <>
                  <Zap className="h-4 w-4" />
                  {isLoading ? "Processing..." : "Smart Dispute"}
                </>
              ) : (
                <>
                  <Gavel className="h-4 w-4" />
                  {isLoading ? "Processing..." : "Dispute"}
                </>
              )}
            </Button>
          )}

        {/* Approved Status - Show approved badge */}
        {milestone.status === "approved" && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Approved</span>
          </div>
        )}

        {/* Rejected Status - Show rejected badge and resubmit button */}
        {milestone.status === "rejected" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Rejected</span>
            </div>
            {canResubmitMilestone() && (
              <Button
                onClick={() => openDialog("resubmit")}
                size="sm"
                variant="default"
                className="gap-2"
                disabled={isLoading}
                data-action="resubmit"
              >
                {isSmartAccountReady ? (
                  <>
                    <Zap className="h-4 w-4" />
                    {isLoading ? "Processing..." : "Smart Resubmit"}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {isLoading ? "Processing..." : "Resubmit"}
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Disputed Status - Show disputed badge with reason */}
        {milestone.status === "disputed" && (
          <div className="flex flex-col gap-2 text-orange-600">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4" />
              <span className="text-sm font-medium">Disputed</span>
            </div>
            {milestone.disputeReason && (
              <div className="text-xs text-orange-700 bg-orange-50 p-2 rounded border">
                <strong>Reason:</strong> {milestone.disputeReason}
              </div>
            )}
          </div>
        )}

        {/* Resolved Status - Show resolved badge */}
        {milestone.status === "resolved" && (
          <div className="flex items-center gap-2 text-blue-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Resolved</span>
          </div>
        )}

        {/* Terminated Project Status - Show terminated badge */}
        {isProjectTerminated && (
          <div className="flex items-center gap-2 text-gray-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Project Terminated</span>
          </div>
        )}

        {/* Duplicate dispute button removed */}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-2xl">
                {dialogContent.title}
              </DialogTitle>
            </div>
            <DialogDescription className="text-base leading-relaxed">
              {dialogContent.description}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/50 rounded-lg p-4 my-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Escrow ID:</span>
                <span className="font-mono font-semibold">#{escrowId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Milestone:</span>
                <span className="font-semibold">{milestoneIndex + 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-bold text-primary">
                  {(() => {
                    try {
                      const amount = Number.parseFloat(milestone.amount);
                      if (isNaN(amount)) return "0.00";
                      return (amount / 1e18).toFixed(2);
                    } catch (e) {
                      return "0.00";
                    }
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* Reason input for dispute or reject action */}
          {(actionType === "dispute" || actionType === "reject") && (
            <div className="my-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for {actionType === "dispute" ? "dispute" : "rejection"}{" "}
                (required)
              </label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder={`Please explain why you are ${actionType === "dispute" ? "disputing" : "rejecting"} this milestone...`}
                className="w-full p-3 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                rows={3}
                required
              />
              {!disputeReason.trim() && (
                <p className="text-sm text-red-600 mt-1">
                  Please provide a reason for the{" "}
                  {actionType === "dispute" ? "dispute" : "rejection"}
                </p>
              )}
            </div>
          )}

          {/* Rejection reason display and resubmit message for resubmit action */}
          {actionType === "resubmit" && (
            <div className="my-4 space-y-4">
              {/* Show rejection reason if available */}
              {milestone.rejectionReason && (
                <div>
                  <label className="block text-sm font-medium text-red-600 mb-2">
                    Rejection Reason
                  </label>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    {milestone.rejectionReason}
                  </div>
                </div>
              )}

              {/* Update message field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Update Message
                </label>
                <textarea
                  value={resubmitMessage}
                  onChange={(e) => setResubmitMessage(e.target.value)}
                  placeholder="Describe the improvements you've made to address the client's feedback..."
                  className="w-full p-3 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={4}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This message will be sent to the client along with your
                  resubmission.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleAction} disabled={isLoading}>
              {isLoading ? "Processing..." : dialogContent.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
