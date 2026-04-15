// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./EscrowCore.sol";

abstract contract AdminFunctions is EscrowCore {
    using SafeERC20 for IERC20;
    
    // ===== Modifiers =====
    modifier onlyOwnerOrArbiter() {
        require(
            msg.sender == owner() || authorizedArbiters[msg.sender],
            "Not owner or arbiter"
        );
        _;
    }
    
    // ===== Owner functions =====
    function setPlatformFeeBP(uint256 _bp) external onlyOwner {
        require(_bp <= MAX_PLATFORM_FEE_BP, "Fee too high");
        platformFeeBP = _bp;
        emit PlatformFeeUpdated(_bp);
    }

    function setFeeCollector(address _collector) external onlyOwner {
        require(_collector != address(0), "Invalid collector");
        feeCollector = _collector;
        emit FeeCollectorUpdated(_collector);
    }

    function whitelistToken(address token) external onlyOwnerOrArbiter {
        require(token != address(0), "Invalid token");
        whitelistedTokens[token] = true;
        emit TokenWhitelisted(token);
    }

    function blacklistToken(address token) external onlyOwnerOrArbiter {
        whitelistedTokens[token] = false;
        emit TokenBlacklisted(token);
    }

    function authorizeArbiter(address arbiter) external onlyOwner {
        require(arbiter != address(0), "Invalid arbiter");
        authorizedArbiters[arbiter] = true;
        emit ArbiterAuthorized(arbiter);
    }

    function revokeArbiter(address arbiter) external onlyOwner {
        authorizedArbiters[arbiter] = false;
        emit ArbiterRevoked(arbiter);
    }

    function pauseJobCreation() external onlyOwner {
        jobCreationPaused = true;
        emit JobCreationPaused();
    }

    function unpauseJobCreation() external onlyOwner {
        jobCreationPaused = false;
        emit JobCreationUnpaused();
    }

    function withdrawFees(address token) external nonReentrant {
        require(msg.sender == feeCollector || msg.sender == owner(), "Not authorized");
        uint256 amount = totalFeesByToken[token];
        require(amount > 0, "No fees");

        totalFeesByToken[token] = 0;

        address recipient = feeCollector;
        if (msg.sender == owner()) recipient = owner();

        if (token == address(0)) {
            (bool ok, ) = recipient.call{value: amount}("");
            require(ok, "Native fee transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }

        emit FeesWithdrawn(token, amount, recipient);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Invalid amount");
        uint256 balance;
        if (token == address(0)) {
            balance = address(this).balance;
            uint256 reserved = escrowedAmount[address(0)] + totalFeesByToken[address(0)];
            require(balance > reserved, "Nothing withdrawable");
            uint256 available = balance - reserved;
            require(amount <= available, "Amount exceeds available native balance");
            (bool ok, ) = owner().call{value: amount}("");
            require(ok, "Native withdraw failed");
        } else {
            balance = IERC20(token).balanceOf(address(this));
            uint256 reserved = escrowedAmount[token] + totalFeesByToken[token];
            require(balance >= reserved + amount, "Insufficient non-escrow balance");
            IERC20(token).safeTransfer(owner(), amount);
        }
        emit EmergencyWithdrawn(token, amount, owner());
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ===== Self Protocol Verification Functions =====
    
    /**
     * @dev Mark a user as verified by Self Protocol
     * @param user The user address to verify
     * @notice Can only be called by owner or verified backend service
     */
    function verifyUserIdentity(address user) external onlyOwnerOrArbiter {
        require(user != address(0), "Invalid user address");
        require(!selfVerifiedUsers[user], "User already verified");
        
        selfVerifiedUsers[user] = true;
        verificationTimestamp[user] = block.timestamp;
        
        emit UserVerified(user, block.timestamp);
    }

    /**
     * @dev Revoke user verification (for fraud cases)
     * @param user The user address to revoke verification from
     */
    function revokeUserVerification(address user) external onlyOwner {
        require(user != address(0), "Invalid user address");
        require(selfVerifiedUsers[user], "User not verified");
        
        selfVerifiedUsers[user] = false;
        verificationTimestamp[user] = 0;
    }
}
