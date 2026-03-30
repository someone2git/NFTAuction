import { expect } from "chai";
import { network } from "hardhat";
import type { NFTAuction } from "../typechain-types/index.js";
import type { Signer } from "ethers";

type SignerWithAddress = Signer;

describe("NFTAuction", function () {
    let auction: NFTAuction;
    let admin: SignerWithAddress;
    let seller: SignerWithAddress;
    let bidder1: SignerWithAddress;
    let bidder2: SignerWithAddress;
    let ethers: any;
    let connection: any;

    beforeEach(async function () {
        connection = await network.connect();
        ethers = connection.ethers;
        [admin, seller, bidder1, bidder2] = await ethers.getSigners();
    });

    async function increaseTime(seconds: number) {
        await connection.provider.send("evm_increaseTime", [seconds]);
        await connection.provider.send("hardhat_mine");
    }

    async function deployFixture() {
        const NFTAuction = await ethers.getContractFactory("NFTAuction");
        const implementation = await NFTAuction.deploy();
        await implementation.waitForDeployment();

        const ERC1967Proxy = await ethers.getContractFactory("ERC1967ProxyWrapper");
        const initData = implementation.interface.encodeFunctionData("initialize", [admin.address]);
        const proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
        await proxy.waitForDeployment();

        const auction = await ethers.getContractAt("NFTAuction", await proxy.getAddress());
        return auction;
    }

    async function setupAuctionWithTokens() {
        const auction = await deployFixture();

        const MockNFT = await ethers.getContractFactory("MockNFT");
        const mockNFT = await MockNFT.deploy();
        await mockNFT.waitForDeployment();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();

        const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
        const usdcOracle = await MockPriceOracle.deploy(100000000, 8);
        const ethOracle = await MockPriceOracle.deploy(200000000000, 8);
        await usdcOracle.waitForDeployment();
        await ethOracle.waitForDeployment();

        await auction.connect(admin).setTokenOracle(await mockUSDC.getAddress(), await usdcOracle.getAddress());
        await auction.connect(admin).setTokenOracle(ethers.ZeroAddress, await ethOracle.getAddress());

        await mockNFT.mint(seller.address);
        const tokenId = BigInt(0);

        await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

        await auction.connect(admin).startAuction(
            seller.address,
            tokenId,
            await mockNFT.getAddress(),
            100,
            3600,
            await mockUSDC.getAddress()
        );

        return { auction, mockNFT, mockUSDC, tokenId, auctionId: 0 };
    }

    describe("Deployment & Initialization", function () {
        it("Should initialize with correct admin", async function () {
            const auction = await deployFixture();
            expect(await auction.tokenToOracle(ethers.ZeroAddress)).to.equal(ethers.ZeroAddress);
        });

        it("Should reject zero address as admin", async function () {
            const NFTAuction = await ethers.getContractFactory("NFTAuction");
            const implementation = await NFTAuction.deploy();
            await implementation.waitForDeployment();

            const ERC1967Proxy = await ethers.getContractFactory("ERC1967ProxyWrapper");
            const initData = implementation.interface.encodeFunctionData("initialize", [ethers.ZeroAddress]);
            await expect(ERC1967Proxy.deploy(await implementation.getAddress(), initData))
                .to.be.revertedWith("invalid admin");
        });

        it("Should set token oracle correctly", async function () {
            const auction = await deployFixture();
            const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
            const oracle = await MockPriceOracle.deploy(100000000, 8);
            await oracle.waitForDeployment();

            const testToken = "0x1234567890123456789012345678901234567890";
            await auction.connect(admin).setTokenOracle(testToken, await oracle.getAddress());

            expect(await auction.tokenToOracle(testToken)).to.equal(await oracle.getAddress());
        });

        it("Should reject zero address as oracle", async function () {
            const auction = await deployFixture();
            await expect(
                auction.connect(admin).setTokenOracle(ethers.ZeroAddress, ethers.ZeroAddress)
            ).to.be.revertedWith("invalid oracle");
        });

        it("Should allow only admin to set oracle", async function () {
            const auction = await deployFixture();
            await expect(
                auction.connect(bidder1).setTokenOracle(ethers.ZeroAddress, bidder1.address)
            ).to.be.revertedWith("not admin");
        });
    });

    describe("Price Oracle", function () {
        it("Should get correct price", async function () {
            const auction = await deployFixture();
            const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
            const oracle = await MockPriceOracle.deploy(200000000000, 8);
            await oracle.waitForDeployment();

            const testToken = "0x1234567890123456789012345678901234567890";
            await auction.connect(admin).setTokenOracle(testToken, await oracle.getAddress());

            const price = await auction.getPriceInDollar(testToken);
            expect(price).to.equal(200000000000);
        });

        it("Should revert when oracle not set", async function () {
            const auction = await deployFixture();
            await expect(
                auction.getPriceInDollar("0x1234567890123456789012345678901234567890")
            ).to.be.revertedWith("oracle not set");
        });
    });

    describe("Create Auction", function () {
        it("Should create auction with valid parameters", async function () {
            const auction = await deployFixture();
            const MockNFT = await ethers.getContractFactory("MockNFT");
            const mockNFT = await MockNFT.deploy();
            await mockNFT.waitForDeployment();
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
            await mockUSDC.waitForDeployment();
            const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
            const oracle = await MockPriceOracle.deploy(100000000, 8);
            await oracle.waitForDeployment();

            await auction.connect(admin).setTokenOracle(await mockUSDC.getAddress(), await oracle.getAddress());

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await expect(
                auction.connect(admin).startAuction(
                    seller.address,
                    tokenId,
                    await mockNFT.getAddress(),
                    100,
                    60,
                    await mockUSDC.getAddress()
                )
            ).to.emit(auction, "StratBid").withArgs(1);

            const auctionData = await auction.auctions(0);
            expect(auctionData.seller).to.equal(seller.address);
            expect(auctionData.nftId).to.equal(tokenId);
        });

        it("Should transfer NFT to auction contract", async function () {
            const auction = await deployFixture();
            const MockNFT = await ethers.getContractFactory("MockNFT");
            const mockNFT = await MockNFT.deploy();
            await mockNFT.waitForDeployment();
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
            await mockUSDC.waitForDeployment();
            const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
            const oracle = await MockPriceOracle.deploy(100000000, 8);
            await oracle.waitForDeployment();

            await auction.connect(admin).setTokenOracle(await mockUSDC.getAddress(), await oracle.getAddress());

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await auction.connect(admin).startAuction(
                seller.address,
                tokenId,
                await mockNFT.getAddress(),
                100,
                60,
                await mockUSDC.getAddress()
            );

            expect(await mockNFT.ownerOf(tokenId)).to.equal(await auction.getAddress());
        });

        it("Should reject non-admin creating auction", async function () {
            const auction = await deployFixture();
            const MockNFT = await ethers.getContractFactory("MockNFT");
            const mockNFT = await MockNFT.deploy();
            await mockNFT.waitForDeployment();
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
            await mockUSDC.waitForDeployment();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await expect(
                auction.connect(bidder1).startAuction(
                    seller.address,
                    tokenId,
                    await mockNFT.getAddress(),
                    100,
                    60,
                    await mockUSDC.getAddress()
                )
            ).to.be.revertedWith("not admin");
        });

        it("Should reject zero address NFT", async function () {
            const auction = await deployFixture();
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
            await mockUSDC.waitForDeployment();

            await expect(
                auction.connect(admin).startAuction(
                    seller.address,
                    0,
                    ethers.ZeroAddress,
                    100,
                    60,
                    await mockUSDC.getAddress()
                )
            ).to.be.revertedWith("invalid nft");
        });

        it("Should reject duration less than 30 seconds", async function () {
            const auction = await deployFixture();
            const MockNFT = await ethers.getContractFactory("MockNFT");
            const mockNFT = await MockNFT.deploy();
            await mockNFT.waitForDeployment();
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
            await mockUSDC.waitForDeployment();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await expect(
                auction.connect(admin).startAuction(
                    seller.address,
                    tokenId,
                    await mockNFT.getAddress(),
                    100,
                    29,
                    await mockUSDC.getAddress()
                )
            ).to.be.revertedWith("invalid duration");
        });

        it("Should reject zero address payment token", async function () {
            const auction = await deployFixture();
            const MockNFT = await ethers.getContractFactory("MockNFT");
            const mockNFT = await MockNFT.deploy();
            await mockNFT.waitForDeployment();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await expect(
                auction.connect(admin).startAuction(
                    seller.address,
                    tokenId,
                    await mockNFT.getAddress(),
                    100,
                    60,
                    ethers.ZeroAddress
                )
            ).to.be.revertedWith("invalid payment token");
        });
    });

    describe("Bidding", function () {
        it("Should bid with ERC20", async function () {
            const { auction, mockUSDC, auctionId } = await setupAuctionWithTokens();

            const bidAmount = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);

            await expect(auction.connect(bidder1).bid(auctionId, bidAmount))
                .to.emit(auction, "Bid")
                .withArgs(bidder1.address, bidAmount);

            const auctionData = await auction.auctions(auctionId);
            expect(auctionData.highestBidder).to.equal(bidder1.address);
            expect(auctionData.highestBid).to.equal(bidAmount);
        });

        it("Should bid with ETH", async function () {
            const { auction, auctionId } = await setupAuctionWithTokens();

            const ethAmount = ethers.parseEther("0.075");
            await expect(auction.connect(bidder1).bid(auctionId, ethAmount, { value: ethAmount }))
                .to.emit(auction, "Bid")
                .withArgs(bidder1.address, ethAmount);

            const auctionData = await auction.auctions(auctionId);
            expect(auctionData.highestBidder).to.equal(bidder1.address);
            expect(auctionData.highestBid).to.equal(ethAmount);
            expect(auctionData.highestBidToken).to.equal(ethers.ZeroAddress);
        });

        it("Should reject bid below starting price", async function () {
            const { auction, mockUSDC, auctionId } = await setupAuctionWithTokens();

            const bidAmount = 50n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);

            await expect(auction.connect(bidder1).bid(auctionId, bidAmount))
                .to.be.revertedWith("invalid startingPrice");
        });

        it("Should reject bid below highest bid", async function () {
            const { auction, mockUSDC, auctionId } = await setupAuctionWithTokens();

            const bidAmount1 = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount1);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount1);
            await auction.connect(bidder1).bid(auctionId, bidAmount1);

            const bidAmount2 = 120n * 10n ** 6n;
            await mockUSDC.mint(bidder2.address, bidAmount2);
            await mockUSDC.connect(bidder2).approve(await auction.getAddress(), bidAmount2);

            await expect(auction.connect(bidder2).bid(auctionId, bidAmount2))
                .to.be.revertedWith("invalid highestBid");
        });

        it("Should refund previous highest bidder", async function () {
            const { auction, mockUSDC, auctionId } = await setupAuctionWithTokens();

            const bidAmount1 = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount1);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount1);
            await auction.connect(bidder1).bid(auctionId, bidAmount1);

            expect(await mockUSDC.balanceOf(bidder1.address)).to.equal(0);

            const bidAmount2 = 200n * 10n ** 6n;
            await mockUSDC.mint(bidder2.address, bidAmount2);
            await mockUSDC.connect(bidder2).approve(await auction.getAddress(), bidAmount2);
            await auction.connect(bidder2).bid(auctionId, bidAmount2);

            expect(await mockUSDC.balanceOf(bidder1.address)).to.equal(bidAmount1);
        });

        it("Should reject ETH bid with mismatched amount", async function () {
            const { auction, auctionId } = await setupAuctionWithTokens();

            await expect(
                auction.connect(bidder1).bid(auctionId, ethers.parseEther("0.1"), {
                    value: ethers.parseEther("0.05")
                })
            ).to.be.revertedWith("amount mismathc");
        });

        it("Should reject bid on non-existent auction", async function () {
            const { auction, mockUSDC } = await setupAuctionWithTokens();

            const bidAmount = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);

            await expect(auction.connect(bidder1).bid(999, bidAmount))
                .to.be.revertedWith("not started");
        });

        it("Should reject bid on ended auction", async function () {
            const { auction, mockUSDC, auctionId } = await setupAuctionWithTokens();

            await increaseTime(3601);

            const bidAmount = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);

            await expect(auction.connect(bidder1).bid(auctionId, bidAmount))
                .to.be.revertedWith("ended");
        });
    });

    describe("End Auction", function () {
        it("Should end auction after duration", async function () {
            const { auction, mockNFT, mockUSDC, auctionId, tokenId } = await setupAuctionWithTokens();

            const bidAmount = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);
            await auction.connect(bidder1).bid(auctionId, bidAmount);

            await increaseTime(3601);

            await expect(auction.end(auctionId))
                .to.emit(auction, "EndBid")
                .withArgs(auctionId);

            expect(await mockNFT.ownerOf(tokenId)).to.equal(bidder1.address);
            expect(await mockUSDC.balanceOf(seller.address)).to.equal(bidAmount);
        });

        it("Should reject ending auction before duration", async function () {
            const { auction, auctionId } = await setupAuctionWithTokens();
            await expect(auction.end(auctionId)).to.be.revertedWith("not ended");
        });

        it("Should reject ending auction with no bids", async function () {
            const auction = await deployFixture();
            const MockNFT = await ethers.getContractFactory("MockNFT");
            const mockNFT = await MockNFT.deploy();
            await mockNFT.waitForDeployment();
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
            await mockUSDC.waitForDeployment();
            const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
            const oracle = await MockPriceOracle.deploy(100000000, 8);
            await oracle.waitForDeployment();

            await auction.connect(admin).setTokenOracle(await mockUSDC.getAddress(), await oracle.getAddress());

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await auction.connect(admin).startAuction(
                seller.address,
                tokenId,
                await mockNFT.getAddress(),
                100,
                60,
                await mockUSDC.getAddress()
            );

            await increaseTime(61);
            await expect(auction.end(0)).to.be.revertedWith("no bids");
        });
    });

    describe("Auction Status", function () {
        it("Should return correct isEnded status", async function () {
            const auction = await deployFixture();
            const MockNFT = await ethers.getContractFactory("MockNFT");
            const mockNFT = await MockNFT.deploy();
            await mockNFT.waitForDeployment();
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
            await mockUSDC.waitForDeployment();
            const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
            const oracle = await MockPriceOracle.deploy(100000000, 8);
            await oracle.waitForDeployment();

            await auction.connect(admin).setTokenOracle(await mockUSDC.getAddress(), await oracle.getAddress());

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await auction.connect(admin).startAuction(
                seller.address,
                tokenId,
                await mockNFT.getAddress(),
                100,
                60,
                await mockUSDC.getAddress()
            );

            expect(await auction.isEnded(0)).to.be.false;
            await increaseTime(61);
            expect(await auction.isEnded(0)).to.be.true;
        });

        it("Should return false for non-existent auction", async function () {
            const auction = await deployFixture();
            expect(await auction.isEnded(999)).to.be.false;
        });
    });

    describe("Version", function () {
        it("Should return correct version", async function () {
            const auction = await deployFixture();
            expect(await auction.getVersion()).to.equal("MetaNFTAuctionV1");
        });
    });
});
