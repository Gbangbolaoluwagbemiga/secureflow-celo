// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IIdentity {
    function isWhitelisted(address user) external view returns (bool);
}
