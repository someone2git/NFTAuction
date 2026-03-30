// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./NFTAuctionUUPS.sol";

contract NFTAuctionUUPSV2 is NFTAuctionUUPS {
    
    function getVersion() external pure override returns (string memory) {
        return "NFTAuctionUUPSV2";
    }

    function newFunction() external pure returns (string memory) {
        return "new function v2";
    }
}