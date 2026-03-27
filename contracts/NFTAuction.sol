// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract NFTAuction is Initializable {

    /// 管理员地址
    address admin;

    struct Auction{
        IERC721 nft;
        uint256 nftId;
        address payable seller;
        uint256 startingTime;
        address highestBidder;
        uint256 startingPriceInDollar;
        uint256 duration;
        IERC20 paymentToken;
        uint256 highestBid;
        uint256 highestBidInDollar;
        address highestBidToken;
    }

    mapping(address => address) public tokenToOracle;

    mapping(uint256 => Auction) public auctions;

    event StratBid(uint256 startingBid);

    event Bid(address indexed sender, uint256 amount);

    event EndBid(uint256 indexed auctionId);

    uint256 public auctionId;

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin_) external initializer {
        require(admin_ != address(0), "invalid admin");
        admin = admin_;
    }

    function setTokenOracle(address token, address oracle) external onlyAdmin {
        require(oracle != address(0), "invalid oracle");
        tokenToOracle[token] = oracle;
    }

    function getPriceInDollar(address token) public view returns (uint256) {
        address oracle = tokenToOracle[token];
        require(oracle != address(0), "oracle not set");
        AggregatorV3Interface dataFeed = AggregatorV3Interface(oracle);
        (,int256 answer, , , ) = dataFeed.latestRoundData();
        return uint256(answer);
    }

    function toUsd(uint256 amount, uint256 amountDecimals, uint256 price) internal pure returns(uint256) {
        uint256 scale = 109 ** amountDecimals;
        return (amount * price) / scale;
    } 

}