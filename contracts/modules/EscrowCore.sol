// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "../interfaces/ISecureFlow.sol";

abstract contract EscrowCore is ReentrancyGuard, Ownable, Pausable, ISecureFlow {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ===== Constants =====
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant DISPUTE_PERIOD = 7 days;
    uint256 public constant EMERGENCY_REFUND_DELAY = 30 days;
    uint256 public constant MAX_PLATFORM_FEE_BP = 1000; // 10%
    uint256 public constant MAX_ARBITERS = 5;
    uint256 public constant MAX_MILESTONES = 20;
    uint256 public constant MAX_APPLICATIONS = 50;
    uint256 public constant REPUTATION_PER_MILESTONE = 10;
    uint256 public constant REPUTATION_PER_ESCROW = 25;
    uint256 public constant MIN_REP_ELIGIBLE_ESCROW_VALUE = 1e16; // 0.01 native or token base units

    // version
    string public constant CONTRACT_VERSION = "1.0.0";

    // ===== State (config) =====
    address public paymentToken;
    uint256 public platformFeeBP;
    address public feeCollector;
    bool public jobCreationPaused;

    // ===== State variables =====
    uint256 public nextEscrowId;
    mapping(uint256 => EscrowData) public escrows;
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;
    mapping(address => uint256[]) public userEscrows;
    mapping(address => bool) public authorizedArbiters;
    mapping(address => bool) public whitelistedTokens;
    mapping(address => uint256) public escrowedAmount;
    mapping(address => uint256) public totalFeesByToken;

    // Marketplace storage
    mapping(uint256 => Application[]) internal escrowApplications;
    mapping(uint256 => mapping(address => bool)) public hasApplied;

    // Reputation
    mapping(address => uint256) public reputation;
    mapping(address => uint256) public completedEscrows;

    // Verification Systems
    mapping(address => bool) public selfVerifiedUsers; // Self Protocol
    mapping(address => uint256) public verificationTimestamp;

    // ===== Modifiers =====
    modifier onlyEscrowParticipant(uint256 escrowId) {
        EscrowData storage e = escrows[escrowId];
        require(
            msg.sender == e.depositor || 
            msg.sender == e.beneficiary || 
            _isArbiterForEscrow(escrowId, msg.sender), 
            "Not authorized"
        );
        _;
    }

    modifier onlyDepositor(uint256 escrowId) {
        require(msg.sender == escrows[escrowId].depositor, "Only depositor");
        _;
    }

    modifier onlyBeneficiary(uint256 escrowId) {
        require(msg.sender == escrows[escrowId].beneficiary, "Only beneficiary");
        _;
    }

    modifier validEscrow(uint256 escrowId) {
        require(escrowId > 0 && escrowId < nextEscrowId, "Escrow not found");
        _;
    }

    modifier onlyWhitelistedToken(address token) {
        require(
            whitelistedTokens[token] || token == address(0), 
            "Token not whitelisted"
        );
        _;
    }

    modifier onlyAuthorizedArbiter(address arbiter) {
        require(authorizedArbiters[arbiter], "Arbiter not authorized");
        _;
    }

    modifier whenJobCreationNotPaused() {
        require(!jobCreationPaused, "Job creation paused");
        _;
    }

    constructor(address _paymentToken, address _feeCollector, uint256 _platformFeeBP) {
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_platformFeeBP <= MAX_PLATFORM_FEE_BP, "Fee too high");

        paymentToken = _paymentToken;
        feeCollector = _feeCollector;
        platformFeeBP = _platformFeeBP;
        nextEscrowId = 1;

        if (_paymentToken != address(0)) {
            whitelistedTokens[_paymentToken] = true;
            emit TokenWhitelisted(_paymentToken);
        }
    }

    // ===== Helper functions =====
    function isVerified(address user) public view returns (bool) {
        if (user == address(0)) return false;
        
        // Check Self Protocol verification (manual/backend)
        if (selfVerifiedUsers[user]) return true;

        return false;        
    }

    function _calculateFee(uint256 amount) internal view returns (uint256) {
        if (platformFeeBP == 0) return 0;
        return (amount * platformFeeBP) / 10000;
    }

    function _transferIn(address token, address from, uint256 amount, bool isNative) internal {
        if (isNative) {
            return;
        } else {
            IERC20(token).safeTransferFrom(from, address(this), amount);
        }
    }

    function _transferOut(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            require(ok, "Native transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _isArbiterForEscrow(uint256 escrowId, address arbiter) internal view returns (bool) {
        EscrowData storage e = escrows[escrowId];
        for (uint256 i = 0; i < e.arbiters.length; ++i) {
            if (e.arbiters[i] == arbiter) return true;
        }
        return false;
    }

    function _updateReputation(address user, uint256 points, string memory reason) internal {
        // Only update reputation for verified users to prevent Sybil attacks
        if (isVerified(user)) {
            reputation[user] += points;
            emit ReputationUpdated(user, reputation[user], reason);
        }
    }

    function isArbiterForEscrow(uint256 escrowId, address arbiter) external view validEscrow(escrowId) returns (bool) {
        return _isArbiterForEscrow(escrowId, arbiter);
    }

    receive() external payable {
        // Accept native tokens for hackathon demo
        // In production, this should be more restrictive
    }

    fallback() external payable {
        revert("SecureFlow: Fallback not allowed");
    }
}
