// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./EscrowCore.sol";

abstract contract WorkLifecycle is EscrowCore {
    // ===== Work lifecycle =====
    function startWork(uint256 escrowId) 
        external 
        onlyBeneficiary(escrowId) 
        validEscrow(escrowId) 
        nonReentrant 
        whenNotPaused 
    {
        EscrowData storage e = escrows[escrowId];
        require(e.status == EscrowStatus.Pending, "Invalid status");
        require(!e.workStarted, "Work started");

        e.workStarted = true;
        e.status = EscrowStatus.InProgress;

        if (e.platformFee > 0) {
            totalFeesByToken[e.token] += e.platformFee;
        }

        emit WorkStarted(escrowId, msg.sender, block.timestamp);
        emit EscrowUpdated(escrowId, EscrowStatus.InProgress, block.timestamp);
    }

    function submitMilestone(
        uint256 escrowId, 
        uint256 milestoneIndex, 
        string calldata description
    ) 
        external 
        onlyBeneficiary(escrowId) 
        validEscrow(escrowId) 
        nonReentrant 
        whenNotPaused 
    {
        EscrowData storage e = escrows[escrowId];
        require(e.status == EscrowStatus.InProgress, "Invalid status");
        require(milestoneIndex < e.milestoneCount, "Invalid milestone");

        Milestone storage m = milestones[escrowId][milestoneIndex];
        require(
            m.status == MilestoneStatus.NotStarted, 
            "Already submitted/processed"
        );

        m.status = MilestoneStatus.Submitted;
        m.submittedAt = block.timestamp;
        if (bytes(description).length > 0) m.description = description;

        emit MilestoneSubmitted(
            escrowId, 
            milestoneIndex, 
            msg.sender, 
            m.description, 
            block.timestamp
        );
    }

    function approveMilestone(
        uint256 escrowId, 
        uint256 milestoneIndex,
        uint256 validUntilBlock,
        bytes calldata signature
    ) 
        external 
        onlyDepositor(escrowId) 
        validEscrow(escrowId) 
        nonReentrant 
        whenNotPaused 
    {
        EscrowData storage e = escrows[escrowId];
        require(e.status == EscrowStatus.InProgress, "Escrow not active");
        require(milestoneIndex < e.milestoneCount, "Invalid milestone");

        Milestone storage m = milestones[escrowId][milestoneIndex];
        require(m.status == MilestoneStatus.Submitted, "Not submitted");

        uint256 amount = m.amount;
        m.status = MilestoneStatus.Approved;
        m.approvedAt = block.timestamp;

        e.paidAmount += amount;
        escrowedAmount[e.token] -= amount;

        _transferOut(e.token, e.beneficiary, amount);

        emit MilestoneApproved(escrowId, milestoneIndex, msg.sender, amount, block.timestamp);

        // GoodDollar Reward Claim
        if (address(engagementRewards) != address(0)) {
            try engagementRewards.appClaim(
                msg.sender, // user (Client)
                address(0), // inviter (none)
                validUntilBlock,
                signature
            ) returns (bool success) {
                if (!success) {
                    emit RewardClaimFailed("Claim returned false");
                }
            } catch Error(string memory reason) {
                emit RewardClaimFailed(reason);
            } catch {
                emit RewardClaimFailed("Unknown error");
            }
        }

        if (e.totalAmount >= MIN_REP_ELIGIBLE_ESCROW_VALUE) {
            _updateReputation(e.beneficiary, REPUTATION_PER_MILESTONE, "Milestone approved");
        }

        if (e.paidAmount == e.totalAmount) {
            e.status = EscrowStatus.Released;
            if (e.totalAmount >= MIN_REP_ELIGIBLE_ESCROW_VALUE) {
                _updateReputation(e.beneficiary, REPUTATION_PER_ESCROW, "Escrow completed");
                _updateReputation(e.depositor, REPUTATION_PER_ESCROW, "Escrow completed");
            }
            completedEscrows[e.beneficiary] += 1;
            completedEscrows[e.depositor] += 1;
            emit EscrowCompleted(escrowId, e.beneficiary, e.paidAmount);
            emit EscrowUpdated(escrowId, EscrowStatus.Released, block.timestamp);
        }
    }

    function rejectMilestone(
        uint256 escrowId, 
        uint256 milestoneIndex, 
        string calldata reason
    ) 
        external 
        onlyDepositor(escrowId) 
        validEscrow(escrowId) 
        nonReentrant 
        whenNotPaused 
    {
        EscrowData storage e = escrows[escrowId];
        require(e.status == EscrowStatus.InProgress, "Escrow not active");
        require(milestoneIndex < e.milestoneCount, "Invalid milestone");

        Milestone storage m = milestones[escrowId][milestoneIndex];
        require(m.status == MilestoneStatus.Submitted, "Not submitted");

        // Mark milestone as rejected
        m.status = MilestoneStatus.Rejected;
        m.disputedAt = block.timestamp; // Reuse disputedAt field for rejectedAt
        m.disputedBy = msg.sender; // Reuse disputedBy field for rejectedBy
        m.disputeReason = reason; // Reuse disputeReason field for rejectionReason

        emit MilestoneRejected(escrowId, milestoneIndex, msg.sender, reason, block.timestamp);
    }

    function resubmitMilestone(
        uint256 escrowId, 
        uint256 milestoneIndex, 
        string calldata description
    ) 
        external 
        onlyBeneficiary(escrowId) 
        validEscrow(escrowId) 
        nonReentrant 
        whenNotPaused 
    {
        EscrowData storage e = escrows[escrowId];
        require(e.status == EscrowStatus.InProgress, "Escrow not active");
        require(milestoneIndex < e.milestoneCount, "Invalid milestone");

        Milestone storage m = milestones[escrowId][milestoneIndex];
        require(m.status == MilestoneStatus.Rejected, "Not rejected");

        // Reset milestone to submitted status
        m.status = MilestoneStatus.Submitted;
        m.submittedAt = block.timestamp;
        if (bytes(description).length > 0) m.description = description;

        emit MilestoneResubmitted(
            escrowId, 
            milestoneIndex, 
            msg.sender, 
            m.description, 
            block.timestamp
        );
    }

    function disputeMilestone(
        uint256 escrowId, 
        uint256 milestoneIndex, 
        string calldata reason
    ) 
        external 
        onlyDepositor(escrowId) 
        validEscrow(escrowId) 
        nonReentrant 
        whenNotPaused 
    {
        EscrowData storage e = escrows[escrowId];
        Milestone storage m = milestones[escrowId][milestoneIndex];
        require(m.status == MilestoneStatus.Submitted, "Not submitted");
        require(
            block.timestamp <= m.submittedAt + DISPUTE_PERIOD, 
            "Dispute period expired"
        );

        m.status = MilestoneStatus.Disputed;
        m.disputedAt = block.timestamp;
        m.disputedBy = msg.sender;
        m.disputeReason = reason;

        e.status = EscrowStatus.Disputed;

        emit MilestoneDisputed(escrowId, milestoneIndex, msg.sender, reason, block.timestamp);
        emit EscrowUpdated(escrowId, EscrowStatus.Disputed, block.timestamp);
    }

    function resolveDispute(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 beneficiaryAmount,
        string calldata resolutionReason
    ) external onlyEscrowParticipant(escrowId) validEscrow(escrowId) nonReentrant whenNotPaused {
        EscrowData storage e = escrows[escrowId];
        require(e.status == EscrowStatus.Disputed, "Not in dispute");

        Milestone storage m = milestones[escrowId][milestoneIndex];
        require(m.status == MilestoneStatus.Disputed, "Not disputed");

        uint256 milestoneAmount = m.amount;
        require(beneficiaryAmount <= milestoneAmount, "Invalid allocation");

        uint256 refundAmount = milestoneAmount - beneficiaryAmount;

        m.status = MilestoneStatus.Resolved;
        m.approvedAt = block.timestamp;
        
        // Store resolution details
        m.disputeReason = resolutionReason; // Reuse disputeReason field to store resolution reason
        
        // Determine winner: if beneficiaryAmount > refundAmount, freelancer wins, else client wins
        address winner = beneficiaryAmount > refundAmount ? e.beneficiary : e.depositor;
        m.disputedBy = winner; // Reuse disputedBy field to store winner

        if (beneficiaryAmount > 0) {
            e.paidAmount += beneficiaryAmount;
            escrowedAmount[e.token] -= beneficiaryAmount;
            _transferOut(e.token, e.beneficiary, beneficiaryAmount);
        }

        if (refundAmount > 0) {
            escrowedAmount[e.token] -= refundAmount;
            _transferOut(e.token, e.depositor, refundAmount);
        }

        e.status = EscrowStatus.InProgress;

        emit DisputeResolved(escrowId, milestoneIndex, msg.sender, beneficiaryAmount, refundAmount, block.timestamp);
        emit EscrowUpdated(escrowId, EscrowStatus.InProgress, block.timestamp);

        if (e.paidAmount == e.totalAmount) {
            e.status = EscrowStatus.Released;
            emit EscrowCompleted(escrowId, e.beneficiary, e.paidAmount);
            emit EscrowUpdated(escrowId, EscrowStatus.Released, block.timestamp);
        }
    }
}
