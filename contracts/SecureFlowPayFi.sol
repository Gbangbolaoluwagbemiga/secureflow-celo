// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./modules/EscrowCore.sol";
import "./modules/EscrowManagement.sol";
import "./modules/WorkLifecycle.sol";
import "./modules/AdminFunctions.sol";
import "./modules/RefundSystem.sol";
import "./modules/ViewFunctions.sol";

/**
 * @title SecureFlowPayFi
 * @notice Size-optimized PayFi escrow contract for HashKey Chain deployments.
 * @dev Omits marketplace/job application + rating modules to fit EVM code size limits.
 */
contract SecureFlowPayFi is
    EscrowCore,
    EscrowManagement,
    WorkLifecycle,
    AdminFunctions,
    RefundSystem,
    ViewFunctions
{
    constructor(address _paymentToken, address _feeCollector, uint256 _platformFeeBP)
        EscrowCore(_paymentToken, _feeCollector, _platformFeeBP)
    {}

    // ===== Marketplace stubs (not supported in PayFi build) =====
    function applyToJob(
        uint256, /* escrowId */
        string calldata, /* coverLetter */
        uint256 /* proposedTimeline */
    ) external pure {
        revert("Marketplace disabled");
    }

    function acceptFreelancer(uint256, /* escrowId */ address /* freelancer */)
        external
        pure
    {
        revert("Marketplace disabled");
    }

    function getApplicationCount(uint256 /* escrowId */) external pure returns (uint256) {
        return 0;
    }

    function getApplicationsPage(
        uint256, /* escrowId */
        uint256, /* offset */
        uint256 /* limit */
    ) external pure returns (ISecureFlow.Application[] memory) {
        return new ISecureFlow.Application[](0);
    }

    function hasUserApplied(uint256, /* escrowId */ address /* user */)
        external
        pure
        returns (bool)
    {
        return false;
    }
}

