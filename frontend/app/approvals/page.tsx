"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { useWeb3 } from "@/contexts/web3-context";
import { useToast } from "@/hooks/use-toast";
import { useJobCreatorStatus } from "@/hooks/use-job-creator-status";
import { usePendingApprovals } from "@/hooks/use-pending-approvals";
import { useRouter } from "next/navigation";
import { CONTRACTS } from "@/lib/web3/config";
import { SECUREFLOW_ABI } from "@/lib/web3/abis";
import { ethers } from "ethers";
import {
  useNotifications,
  createApplicationNotification,
} from "@/contexts/notification-context";
import type { Escrow, Application } from "@/lib/web3/types";
import { motion } from "framer-motion";
import { Briefcase, MessageSquare } from "lucide-react";
import { ApprovalsHeader } from "@/components/approvals/approvals-header";
import { ApprovalsStats } from "@/components/approvals/approvals-stats";
import { JobCard } from "@/components/approvals/job-card";
import { ApprovalsLoading } from "@/components/approvals/approvals-loading";

interface JobWithApplications extends Escrow {
  applications: Application[];
  applicationCount: number;
  projectDescription?: string;
  isOpenJob?: boolean;
}

export default function ApprovalsPage() {
  const { wallet, getContract } = useWeb3();
  const { toast } = useToast();
  const { isJobCreator } = useJobCreatorStatus();
  const { hasPendingApprovals, refreshApprovals } = usePendingApprovals();
  const { addNotification } = useNotifications();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobWithApplications[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobWithApplications | null>(
    null
  );
  const [selectedFreelancer, setSelectedFreelancer] =
    useState<Application | null>(null);
  const [selectedJobForApproval, setSelectedJobForApproval] =
    useState<JobWithApplications | null>(null);

  // Debug selectedFreelancer changes
  useEffect(() => {
    if (selectedFreelancer === null) {
    }
  }, [selectedFreelancer]);
  const [approving, setApproving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const getStatusFromNumber = (
    status: number
  ): "pending" | "active" | "completed" | "disputed" => {
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
        return "pending"; // Map cancelled to pending
      default:
        return "pending";
    }
  };

  const fetchMyJobs = async () => {
    if (!wallet.isConnected || !isJobCreator) return;

    setLoading(true);
    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);
      const nextEscrowId = Number(await contract.call("nextEscrowId"));
      const myJobs: JobWithApplications[] = [];

      for (let i = 1; i < nextEscrowId; i++) {
        try {
          const escrowSummary = await contract.call("getEscrowSummary", i);
          const isMyJob =
            escrowSummary[0].toLowerCase() === wallet.address?.toLowerCase();

          if (isMyJob) {
            const isOpenJob =
              escrowSummary[1] === "0x0000000000000000000000000000000000000000";

            if (isOpenJob) {
              let applicationCount = 0;
              const applications: Application[] = [];

              try {
                const rawApplicationCount = await contract.call(
                  "getApplicationCount",
                  i
                );

                applicationCount = Number(rawApplicationCount);

                if (applicationCount > 0) {
                  try {
                    // Try a different approach - fetch with a smaller limit first
                    let applicationsData;
                    try {
                      applicationsData = await contract.call(
                        "getApplicationsPage",
                        i,
                        0,
                        Math.min(applicationCount, 1) // Start with just 1 application
                      );
                    } catch (initialError) {
                      applicationsData = await contract.call(
                        "getApplicationsPage",
                        i,
                        0,
                        applicationCount
                      );
                    }

                    if (applicationsData && applicationsData.length > 0) {
                      // Try to parse the real application data

                      // If we got fewer applications than expected, try a different approach
                      if (applicationsData.length < applicationCount) {
                        // Try fetching with a higher limit
                        try {
                          const moreApplicationsData = await contract.call(
                            "getApplicationsPage",
                            i,
                            0,
                            applicationCount * 2 // Try with double the limit
                          );

                          if (
                            moreApplicationsData &&
                            moreApplicationsData.length >
                              applicationsData.length
                          ) {
                            // Use the alternative data if it has more applications
                            applicationsData = moreApplicationsData;
                          }
                        } catch (altError) {}
                      }

                      for (
                        let appIndex = 0;
                        appIndex < applicationsData.length;
                        appIndex++
                      ) {
                        try {
                          const app = applicationsData[appIndex];

                          // Attempt to extract real data from Proxy objects
                          let freelancerAddress = "";
                          let coverLetter = "";
                          let proposedTimeline = 0;
                          let appliedAt = 0;

                          // Simplified data extraction strategy
                          try {
                            // Helper to safely access property by name or index
                            const getVal = (obj: any, key: string, idx: number) => {
                              try {
                                return obj[key] !== undefined ? obj[key] : (obj[idx] !== undefined ? obj[idx] : undefined);
                              } catch (e) {
                                return undefined;
                              }
                            };

                            // Try to extract values using common Ethers.js result patterns
                            const rawFreelancer = getVal(app, "freelancer", 0);
                            const rawCoverLetter = getVal(app, "coverLetter", 1);
                            const rawTimeline = getVal(app, "proposedTimeline", 2);
                            const rawAppliedAt = getVal(app, "appliedAt", 3);

                            if (rawFreelancer && rawCoverLetter) {
                                freelancerAddress = String(rawFreelancer);
                                coverLetter = String(rawCoverLetter);
                                proposedTimeline = Number(rawTimeline) || 0;
                                appliedAt = Number(rawAppliedAt) || 0;
                            } else {
                                // Fallback for nested arrays (e.g. [[...]])
                                const inner = Array.isArray(app) ? app[0] : undefined;
                                if (Array.isArray(inner) && inner.length >= 4) {
                                    freelancerAddress = String(inner[0]);
                                    coverLetter = String(inner[1]);
                                    proposedTimeline = Number(inner[2]);
                                    appliedAt = Number(inner[3]);
                                } else {
                                     // Don't throw immediately, check if app itself is the array
                                     if (Array.isArray(app) && app.length >= 4) {
                                        freelancerAddress = String(app[0]);
                                        coverLetter = String(app[1]);
                                        proposedTimeline = Number(app[2]);
                                        appliedAt = Number(app[3]);
                                     } else {
                                        throw new Error("Structure not recognized");
                                     }
                                }
                            }
                          } catch (parseError) {
                              // Last resort fallback if structured parsing fails but we have an array-like object
                              if (app && typeof app === 'object') {
                                  freelancerAddress = String(app[0] || app['0'] || "");
                                  coverLetter = String(app[1] || app['1'] || "");
                                  proposedTimeline = Number(app[2] || app['2'] || 0);
                                  appliedAt = Number(app[3] || app['3'] || 0);
                              }
                          }

                          // Ensure we have valid data
                          if (
                            !freelancerAddress ||
                            freelancerAddress === "0x" ||
                            freelancerAddress === ""
                          ) {
                            // If we still don't have an address, we can't show this application validly
                            // But we'll use a placeholder to at least show *something* happened
                            freelancerAddress = "0x0000000000000000000000000000000000000000"; 
                          }
                          if (
                            !coverLetter ||
                            coverLetter === "" ||
                            coverLetter === "undefined"
                          ) {
                            coverLetter = `Application ${
                              appIndex + 1
                            } - Cover letter data not available`;
                          }
                          if (
                            proposedTimeline === 0 ||
                            isNaN(proposedTimeline)
                          ) {
                            proposedTimeline = 30;
                          }
                          if (appliedAt === 0 || isNaN(appliedAt)) {
                            appliedAt = Date.now() - appIndex * 86400000;
                          }

                          // Check for duplicate applications from the same freelancer
                          const existingApplication = applications.find(
                            (existingApp) =>
                              existingApp.freelancerAddress.toLowerCase() ===
                              freelancerAddress.toLowerCase()
                          );

                          if (existingApplication) {
                            continue; // Skip this duplicate application
                          }

                          // Fetch freelancer rating
                          let averageRating = 0;
                          let totalRatings = 0;
                          try {
                            const ratingData = await contract.call(
                              "getFreelancerRating",
                              freelancerAddress
                            );
                            if (
                              ratingData &&
                              Array.isArray(ratingData) &&
                              ratingData.length >= 2
                            ) {
                              // ratingData: [averageRating, totalRatings]
                              // averageRating is stored as percentage (0-500), keep as is for display
                              averageRating = Number(ratingData[0]) || 0;
                              totalRatings = Number(ratingData[1]) || 0;
                            }
                          } catch (ratingError) {
                            // Rating doesn't exist yet or error fetching - use defaults
                            console.log(
                              `Rating check for ${freelancerAddress}:`,
                              ratingError
                            );
                          }

                          const application: Application = {
                            freelancerAddress,
                            coverLetter,
                            proposedTimeline,
                            appliedAt: appliedAt * 1000, // Convert to milliseconds
                            status: "pending" as const,
                            averageRating,
                            totalRatings,
                          };

                          applications.push(application);
                        } catch (parseError) {
                          // Fallback to mock data if parsing fails - but continue processing other applications
                          const fallbackApplication: Application = {
                            freelancerAddress: `0x${Math.random()
                              .toString(16)
                              .substr(2, 40)}`,
                            coverLetter: `Application ${
                              appIndex + 1
                            } - Failed to parse from blockchain`,
                            proposedTimeline: 30,
                            appliedAt: Date.now() - appIndex * 86400000,
                            status: "pending" as const,
                            averageRating: 0,
                            totalRatings: 0,
                          };

                          // Check for duplicate fallback applications too
                          const existingFallback = applications.find(
                            (existingApp) =>
                              existingApp.freelancerAddress.toLowerCase() ===
                              fallbackApplication.freelancerAddress.toLowerCase()
                          );

                          if (!existingFallback) {
                            applications.push(fallbackApplication);
                          } else {
                          }
                        }
                      }
                    }
                  } catch (dataError) {
                    // Fallback to mock data if fetching fails
                    for (
                      let appIndex = 0;
                      appIndex < applicationCount;
                      appIndex++
                    ) {
                      const mockApplication: Application = {
                        freelancerAddress: `0x${Math.random()
                          .toString(16)
                          .substr(2, 40)}`,
                        coverLetter: `Application ${
                          appIndex + 1
                        } - Failed to fetch from blockchain`,
                        proposedTimeline: 30,
                        appliedAt: Date.now() - appIndex * 86400000,
                        status: "pending" as const,
                      };
                      applications.push(mockApplication);
                    }
                  }
                }
              } catch (error) {
                applicationCount = 0;
              }

              const job: JobWithApplications = {
                id: i.toString(),
                payer: escrowSummary[0],
                beneficiary: escrowSummary[1],
                token: escrowSummary[7],
                totalAmount: escrowSummary[4].toString(),
                releasedAmount: escrowSummary[5].toString(),
                status: getStatusFromNumber(Number(escrowSummary[3])),
                createdAt: Number(escrowSummary[10]) * 1000,
                duration:
                  (Number(escrowSummary[8]) - Number(escrowSummary[10])) /
                  (24 * 60 * 60), // Convert seconds to days
                milestones: [],
                projectTitle: escrowSummary[13] || "",
                projectDescription: escrowSummary[14] || "No description",
                isOpenJob: true,
                applications,
                applicationCount: Number(applicationCount),
              };

              myJobs.push(job);
            }
          }
        } catch (error) {
          continue;
        }
      }

      setJobs(myJobs);
    } catch (error) {
      toast({
        title: "Failed to load jobs",
        description: "Could not fetch your job postings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveFreelancer = async () => {
    if (!selectedJobForApproval || !selectedFreelancer || !wallet.isConnected) {
      return;
    }

    setApproving(true);

    try {
      const contract = getContract(CONTRACTS.SECUREFLOW_ESCROW, SECUREFLOW_ABI);

      if (!contract) {
        throw new Error("Contract instance not found");
      }

      const txHash = await contract.send(
        "acceptFreelancer",
        "no-value",
        Number(selectedJobForApproval.id),
        selectedFreelancer.freelancerAddress
      );

      toast({
        title: "Freelancer Approved",
        description: "The freelancer has been approved for this job",
      });

      // Add notification for freelancer approval - notify the FREELANCER
      addNotification(
        createApplicationNotification(
          "approved",
          Number(selectedJobForApproval.id),
          selectedFreelancer.freelancerAddress,
          {
            jobTitle:
              selectedJobForApproval.projectDescription ||
              `Job #${selectedJobForApproval.id}`,
            freelancerName:
              selectedFreelancer.freelancerAddress.slice(0, 6) +
              "..." +
              selectedFreelancer.freelancerAddress.slice(-4),
          }
        ),
        [selectedFreelancer.freelancerAddress] // Notify the freelancer
      );

      // Close modals first
      setSelectedJob(null);
      setSelectedFreelancer(null);
      setSelectedJobForApproval(null);

      // Wait for transaction confirmation
      if (txHash && typeof window !== 'undefined' && window.ethereum) {
          const provider = new ethers.BrowserProvider(window.ethereum as any);
          await provider.waitForTransaction(txHash);
      }

      // Refresh the jobs list
      await fetchMyJobs();

      // Refresh pending approvals status to update navigation
      await refreshApprovals();

      // Force a re-render by updating a dummy state
      setLoading(true);
      setTimeout(() => setLoading(false), 100);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      toast({
        title: "Approval Failed",
        description: `There was an error approving the freelancer: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    if (wallet.isConnected && isJobCreator) {
      fetchMyJobs();
    }
  }, [wallet.isConnected, isJobCreator]);

  // Redirect if no pending approvals
  useEffect(() => {
    if (
      wallet.isConnected &&
      isJobCreator &&
      !loading &&
      !hasPendingApprovals
    ) {
      router.push("/dashboard");
    }
  }, [wallet.isConnected, isJobCreator, loading, hasPendingApprovals, router]);

  if (!wallet.isConnected) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground">
            Please connect your wallet to view your job postings and manage
            applications.
          </p>
        </div>
      </div>
    );
  }

  if (!isJobCreator) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">
            Job Creator Access Required
          </h2>
          <p className="text-muted-foreground">
            You need to be a job creator to access this page.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <ApprovalsLoading isConnected={wallet.isConnected} />;
  }

  const totalJobs = jobs.length;
  const totalApplications = jobs.reduce(
    (sum, job) => sum + job.applicationCount,
    0
  );
  const totalValue = jobs.reduce(
    (sum, job) => sum + Number(job.totalAmount) / 1e18,
    0
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <ApprovalsHeader />

      {/* Manual Refresh Button */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={async () => {
            setLoading(true);
            await fetchMyJobs();
            setLoading(false);
          }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          🔄 Refresh Jobs
        </button>
      </div>

      <ApprovalsStats jobs={jobs} />

      {jobs.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No Job Postings</h3>
          <p className="text-muted-foreground">
            You haven't created any job postings yet.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6">
          {jobs.map((job, index) => (
            <JobCard
              key={job.id}
              job={job}
              index={index}
              dialogOpen={selectedJob?.id === job.id}
              selectedJob={selectedJob}
              approving={approving}
              onJobSelect={(job: JobWithApplications) => setSelectedJob(job)}
              onDialogChange={(open: boolean) => {
                if (!open) {
                  setSelectedJob(null);
                  setSelectedFreelancer(null);
                }
              }}
              onApprove={(freelancer: string) => {
                const application = job.applications.find(
                  (app) => app.freelancerAddress === freelancer
                );
                if (application) {
                  setSelectedJobForApproval(job); // Store job data for approval
                  setSelectedJob(null); // Close the first modal
                  setSelectedFreelancer(application);
                  setIsApproving(true);
                } else {
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Application Review Modal */}
      {selectedJob && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedJob(null);
              setSelectedFreelancer(null);
            }
          }}
        >
          <div
            className="bg-background rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Review Applications - {selectedJob.projectDescription}
                </h3>
                <button
                  onClick={() => {
                    setSelectedJob(null);
                    setSelectedFreelancer(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              {selectedJob.applications.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No applications yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedJob.applications.map((application, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Freelancer Address:</p>
                            <p className="text-sm text-muted-foreground font-mono">
                              {application.freelancerAddress}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedJobForApproval(selectedJob); // Store job data for approval
                                setSelectedJob(null); // Close the Application Review Modal
                                setSelectedFreelancer(application);
                                setIsApproving(true);
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 cursor-pointer"
                            >
                              Approve
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className="font-medium">Cover Letter:</p>
                          <p className="text-sm text-muted-foreground">
                            {application.coverLetter}
                          </p>
                        </div>

                        <div>
                          <p className="font-medium">Proposed Timeline:</p>
                          <p className="text-sm text-muted-foreground">
                            {application.proposedTimeline} days
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approval/Rejection Confirmation Modal */}
      {(() => {
        return null;
      })()}
      {selectedFreelancer && (
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedFreelancer(null);
            }
          }}
        >
          {(() => {
            return null;
          })()}
          <div
            className="bg-background rounded-lg max-w-md w-full border shadow-2xl"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Approve Freelancer</h3>

              <div className="space-y-4">
                <div>
                  <p className="font-medium">Freelancer Address:</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {selectedFreelancer.freelancerAddress}
                  </p>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setSelectedFreelancer(null)}
                    className="px-4 py-2 border rounded-md hover:bg-muted"
                    disabled={approving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleApproveFreelancer();
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseUp={(e) => {
                      e.stopPropagation();
                    }}
                    className={`px-4 py-2 rounded-md text-white cursor-pointer bg-green-600 hover:bg-green-700 ${
                      approving ? "opacity-75" : ""
                    }`}
                    disabled={false}
                    style={{
                      pointerEvents: "auto",
                      zIndex: 1000,
                      position: "relative",
                    }}
                  >
                    Confirm Approval
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
