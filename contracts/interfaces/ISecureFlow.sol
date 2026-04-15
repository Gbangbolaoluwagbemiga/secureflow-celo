// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ISecureFlow {
    // ===== Enums =====
    enum EscrowStatus { Pending, InProgress, Released, Refunded, Disputed, Expired }
    enum MilestoneStatus { NotStarted, Submitted, Approved, Disputed, Resolved, Rejected }

    // ===== Structs =====
    struct Milestone {
        string description;
        uint256 amount;
        MilestoneStatus status;
        uint256 submittedAt;
        uint256 approvedAt;
        uint256 disputedAt;
        address disputedBy;
        string disputeReason;
    }

    struct Application {
        address freelancer;
        string coverLetter;
        uint256 proposedTimeline;
        uint256 appliedAt;
        bool exists;
        uint256 averageRating; // Average rating * 100 (for precision)
        uint256 totalRatings; // Total number of ratings
    }

    struct EscrowData {
        address depositor;
        address beneficiary;
        address[] arbiters;
        uint8 requiredConfirmations;
        address token;
        uint256 totalAmount;
        uint256 paidAmount;
        uint256 platformFee;
        uint256 deadline;
        EscrowStatus status;
        bool workStarted;
        uint256 createdAt;
        uint256 milestoneCount;
        bool isOpenJob;
        string projectTitle;
        string projectDescription;
    }

    // ===== Events =====
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed depositor,
        address indexed beneficiary,
        address[] arbiters,
        uint256 totalAmount,
        uint256 platformFee,
        address token,
        uint256 deadline,
        bool isOpenJob
    );

    event EscrowUpdated(uint256 indexed escrowId, EscrowStatus indexed newStatus, uint256 timestamp);
    event WorkStarted(uint256 indexed escrowId, address indexed beneficiary, uint256 startedAt);
    event MilestoneSubmitted(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed beneficiary,
        string description,
        uint256 submittedAt
    );
    event MilestoneApproved(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed depositor,
        uint256 amount,
        uint256 approvedAt
    );
    event MilestoneRejected(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed depositor,
        string reason,
        uint256 rejectedAt
    );

    event MilestoneResubmitted(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed beneficiary,
        string description,
        uint256 resubmittedAt
    );
    event MilestoneDisputed(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed depositor,
        string reason,
        uint256 disputedAt
    );
    event DisputeResolved(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed arbiter,
        uint256 beneficiaryAmount,
        uint256 refundAmount,
        uint256 resolvedAt
    );
    event FundsRefunded(uint256 indexed escrowId, address indexed depositor, uint256 amount);
    event EmergencyRefundExecuted(uint256 indexed escrowId, address indexed depositor, uint256 amount);
    event EscrowCompleted(uint256 indexed escrowId, address indexed beneficiary, uint256 totalPaid);
    event ArbiterAuthorized(address indexed arbiter);
    event ArbiterRevoked(address indexed arbiter);
    event TokenWhitelisted(address indexed token);
    event TokenBlacklisted(address indexed token);
    event PlatformFeeUpdated(uint256 newFeeBP);
    event FeeCollectorUpdated(address indexed newFeeCollector);
    event FeesWithdrawn(address indexed token, uint256 amount, address indexed recipient);
    event EmergencyWithdrawn(address indexed token, uint256 amount, address indexed to);
    event DeadlineExtended(uint256 indexed escrowId, uint256 newDeadline);
    event ApplicationSubmitted(
        uint256 indexed escrowId,
        address indexed freelancer,
        string coverLetter,
        uint256 proposedTimeline
    );
    event FreelancerAccepted(uint256 indexed escrowId, address indexed freelancer);
    event ReputationUpdated(address indexed user, uint256 newReputation, string reason);
    event JobCreationPaused();
    event JobCreationUnpaused();
    event UserVerified(address indexed user, uint256 timestamp);
    // ===== Core Functions =====
    function createEscrow(
        address beneficiary,
        address[] calldata arbiters,
        uint8 requiredConfirmations,
        uint256[] calldata milestoneAmounts,
        string[] calldata milestoneDescriptions,
        address token,
        uint256 duration,
        string calldata projectTitle,
        string calldata projectDescription
    ) external returns (uint256);

    function createEscrowNative(
        address beneficiary,
        address[] calldata arbiters,
        uint8 requiredConfirmations,
        uint256[] calldata milestoneAmounts,
        string[] calldata milestoneDescriptions,
        uint256 duration,
        string calldata projectTitle,
        string calldata projectDescription
    ) external payable returns (uint256);

    function startWork(uint256 escrowId) external;
    function submitMilestone(
        uint256 escrowId,
        uint256 milestoneIndex,
        string calldata description
    ) external;
    function approveMilestone(
        uint256 escrowId, 
        uint256 milestoneIndex
    ) external;
    function rejectMilestone(
        uint256 escrowId,
        uint256 milestoneIndex,
        string calldata reason
    ) external;

    function resubmitMilestone(
        uint256 escrowId,
        uint256 milestoneIndex,
        string calldata description
    ) external;
    function disputeMilestone(
        uint256 escrowId,
        uint256 milestoneIndex,
        string calldata reason
    ) external;
    function resolveDispute(uint256 escrowId, uint256 milestoneIndex, uint256 beneficiaryAmount, string calldata resolutionReason) external;
    function refundEscrow(uint256 escrowId) external;
    function emergencyRefundAfterDeadline(uint256 escrowId) external;

    // ===== Marketplace Functions =====
    function applyToJob(uint256 escrowId, string calldata coverLetter, uint256 proposedTimeline) external;
    function acceptFreelancer(uint256 escrowId, address freelancer) external;

    // ===== View Functions =====
    function getEscrowSummary(uint256 escrowId) external view returns (
        address depositor,
        address beneficiary,
        address[] memory arbiters,
        EscrowStatus status,
        uint256 totalAmount,
        uint256 paidAmount,
        uint256 remaining,
        address token,
        uint256 deadline,
        bool workStarted,
        uint256 createdAt,
        uint256 milestoneCount,
        bool isOpenJob,
        string memory projectTitle,
        string memory projectDescription
    );

    function getMilestones(uint256 escrowId) external view returns (Milestone[] memory);
    function getUserEscrows(address user) external view returns (uint256[] memory);
    function getApplicationsPage(
        uint256 escrowId,
        uint256 offset,
        uint256 limit
    ) external view returns (Application[] memory);
    function getApplicationCount(uint256 escrowId) external view returns (uint256);
    function hasUserApplied(uint256 escrowId, address user) external view returns (bool);
    function getReputation(address user) external view returns (uint256);
    function getCompletedEscrows(address user) external view returns (uint256);
    function getWithdrawableFees(address token) external view returns (uint256);
}
