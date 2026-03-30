// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

///逻辑于NFTAuction类似，主要uups部分不同
contract NFTAuctionUUPS is Initializable, UUPSUpgradeable {

    // /// 管理员地址
    // address admin;

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
    ///uups相关属性
    address private _owner; 

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner(), "not owner");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin_) external initializer {
        require(admin_ != address(0), "invalid admin");
        _owner = admin_;
        emit OwnershipTransferred(address(0), admin_);
    }
    ///uups相关
    ///真正升级的方法再UUPSUpgradeable实现，这里重写，主要是做onlyowner权限验证
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function owner() public view returns (address) {
        return _owner;
    }
    ///转换owner，可能有多种情况，所以单独方法
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "invalid new owner");
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /// 预言机 相关方法
    function setTokenOracle(address token, address oracle) external onlyOwner {
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
        uint256 scale = 10 ** amountDecimals;
        return (amount * price) / scale;
    } 

    ///拍卖相关方法
    function startAuction(
        address seller, 
        uint256 nftId, 
        address nft, 
        uint256 startPriceInDollar, 
        uint256 duration, 
        address paymentToken) external onlyOwner {
        require(nft != address(0), "invalid nft");
        require(duration >= 30, "invalid duration");
        require(paymentToken != address(0), "invalid payment token");
        require(auctions[auctionId].seller == address(0), "auction started");

        /// storage	链上持久存储，直接影响 auctions[auctionId]
        Auction storage auction = auctions[auctionId];
        auction.nft = IERC721(nft);
        auction.nftId = nftId;
        auction.seller = payable(seller);
        auction.startingTime = block.timestamp;
        // 将美元价格转换为8位小数格式（Chainlink标准）
        auction.startingPriceInDollar = startPriceInDollar * 10**8;
        auction.duration = duration;
        auction.paymentToken = IERC20(paymentToken);
        auction.highestBid = 0;
        auction.highestBidder = address(0);
        auction.highestBidInDollar = 0;
        auction.highestBidToken = address(0);

        IERC721(nft).transferFrom(seller, address(this), nftId);
        auctionId++;

        emit StratBid(auctionId);
    }

    function isEnded(uint256 auctionId_) public view returns (bool) {
        Auction storage auction = auctions[auctionId_];
        return auction.startingTime > 0 && block.timestamp >= auction.startingTime + auction.duration;
    }

    function end(uint256 auctionId_) external {
        Auction storage auction = auctions[auctionId_];
        require(isEnded(auctionId_), "not ended");
        require(auction.highestBidder != address(0), "no bids");

        auction.nft.transferFrom(address(this), auction.highestBidder, auction.nftId);

        if (auction.highestBid > 0) {
            if (auction.highestBidToken == address(0)) {
                payable(auction.seller).transfer(auction.highestBid);
            } else {
                IERC20(auction.highestBidToken).transfer(auction.seller, auction.highestBid);
            }
        }
        emit EndBid(auctionId_);
    }

    function bid(uint256 auctionId_, uint256 amount) external payable {
        Auction storage auction = auctions[auctionId_];
        require(auction.startingTime > 0, "not started");
        require(!isEnded(auctionId_), "ended");

        uint256 bidPrice;
        bool isEthBid = msg.value > 0;
        if (isEthBid) {
            require(amount == msg.value, "amount mismathc");
            uint256 price = getPriceInDollar(address(0));
            bidPrice = toUsd(msg.value, 18, price);
        } else {
            require(amount > 0, "invalid amount");
            uint256 price = getPriceInDollar(address(auction.paymentToken));
            uint8 tokenDecimals = IERC20Metadata(address(auction.paymentToken)).decimals();
            bidPrice = toUsd(amount, tokenDecimals, price);
            IERC20(address(auction.paymentToken)).transferFrom(msg.sender, address(this), amount);
        }
        require(auction.startingPriceInDollar < bidPrice, "invalid startingPrice");
        require(auction.highestBidInDollar < bidPrice, "invalid highestBid");

        if (auction.highestBidder != address(0) && auction.highestBidder != msg.sender) {
            uint256 refundAmount = auction.highestBid;
            if (refundAmount > 0) {
                if (auction.highestBidToken == address(0)) {
                    payable(auction.highestBidder).transfer(refundAmount);
                } else {
                    IERC20(address(auction.paymentToken)).transfer(auction.highestBidder, refundAmount);
                }
            }
        }
        if (isEthBid) {
            auction.highestBid = msg.value;
            auction.highestBidToken = address(0);
        } else {
            auction.highestBid = amount;
            auction.highestBidToken = address(auction.paymentToken);
        }
        auction.highestBidder = msg.sender;
        auction.highestBidInDollar = bidPrice;

        emit Bid(msg.sender, isEthBid ? msg.value : amount);
    }
    
    function getVersion() external pure virtual returns (string memory) {
        return "MetaNFTAuctionV1";
    }
}