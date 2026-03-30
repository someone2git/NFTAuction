// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./NFTAuction.sol";

contract NFTAuctionV2 is NFTAuction {

    constructor(address admin_) NFTAuction(admin_) {}

    function getVersion() external pure override returns (string memory) {
        return "MetaNFTAuctionV2";
    }

    function newFunction() external pure returns (string memory) {
        return "new function v2";
    }
}