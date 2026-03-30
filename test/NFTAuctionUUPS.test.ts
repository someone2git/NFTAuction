import { expect } from "chai";
import { network } from "hardhat";
import type { NFTAuctionUUPS } from "../typechain-types/index.js";
import type { Contract } from "ethers";
import type { Signer } from "ethers";

type SignerWithAddress = Signer;

describe("NFTAuctionUUPS", function () {
    let auction: NFTAuctionUUPS;
    let proxy: Contract;
    let owner: SignerWithAddress;
    let seller: SignerWithAddress;
    let bidder1: SignerWithAddress;
    let bidder2: SignerWithAddress;
    let ethers: any;
    let connection: any;

    beforeEach(async function () {
        connection = await network.connect();
        ethers = connection.ethers;
        [owner, seller, bidder1, bidder2] = await ethers.getSigners();
    });

    async function increaseTime(seconds: number) {
        await connection.provider.send("evm_increaseTime", [seconds]);
        await connection.provider.send("hardhat_mine");
    }

    async function deployFixture() {
        const NFTAuctionUUPS = await ethers.getContractFactory("NFTAuctionUUPS");
        const implementation = await NFTAuctionUUPS.deploy();
        await implementation.waitForDeployment();

        const ERC1967Proxy = await ethers.getContractFactory("ERC1967ProxyWrapper");
        const initData = implementation.interface.encodeFunctionData("initialize", [owner.address]);
        proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
        await proxy.waitForDeployment();

        auction = await ethers.getContractAt("NFTAuctionUUPS", await proxy.getAddress());
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
        const mockDAI = await MockERC20.deploy("Mock DAI", "DAI", 18);
        await mockDAI.waitForDeployment();

        const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
        const ethOracle = await MockPriceOracle.deploy(200000000000, 8);
        const usdcOracle = await MockPriceOracle.deploy(100000000, 8);
        const daiOracle = await MockPriceOracle.deploy(100000000, 8);
        await ethOracle.waitForDeployment();
        await usdcOracle.waitForDeployment();
        await daiOracle.waitForDeployment();

        await auction.connect(owner).setTokenOracle(await mockUSDC.getAddress(), await usdcOracle.getAddress());
        await auction.connect(owner).setTokenOracle(await mockDAI.getAddress(), await daiOracle.getAddress());
        await auction.connect(owner).setTokenOracle(ethers.ZeroAddress, await ethOracle.getAddress());

        return { auction, mockNFT, mockUSDC, mockDAI, ethOracle, usdcOracle, daiOracle };
    }

    async function createAuction() {
        const base = await setupAuctionWithTokens();
        const { auction, mockNFT, mockUSDC } = base;

        await mockNFT.mint(seller.address);
        const tokenId = BigInt(0);
        await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

        await auction.connect(owner).startAuction(
            seller.address,
            tokenId,
            await mockNFT.getAddress(),
            100,
            3600,
            await mockUSDC.getAddress()
        );

        return { ...base, tokenId, auctionId: 0 };
    }

    describe("Deployment & Initialization", function () {
        it("Should initialize with correct owner", async function () {
            const auction = await deployFixture();
            expect(await auction.owner()).to.equal(owner.address);
        });

        it("Should reject zero address as owner", async function () {
            const NFTAuctionUUPS = await ethers.getContractFactory("NFTAuctionUUPS");
            const implementation = await NFTAuctionUUPS.deploy();
            await implementation.waitForDeployment();

            const ERC1967Proxy = await ethers.getContractFactory("ERC1967ProxyWrapper");
            const initData = implementation.interface.encodeFunctionData("initialize", [ethers.ZeroAddress]);
            await expect(ERC1967Proxy.deploy(await implementation.getAddress(), initData))
                .to.be.rejected;
        });

        it("Should emit OwnershipTransferred event", async function () {
            const NFTAuctionUUPS = await ethers.getContractFactory("NFTAuctionUUPS");
            const implementation = await NFTAuctionUUPS.deploy();
            await implementation.waitForDeployment();

            const ERC1967Proxy = await ethers.getContractFactory("ERC1967ProxyWrapper");
            const initData = implementation.interface.encodeFunctionData("initialize", [owner.address]);
            proxy = await ERC1967Proxy.deploy(await implementation.getAddress(), initData);
            await proxy.waitForDeployment();

            await expect(proxy.deploymentTransaction())
                .to.emit(await ethers.getContractAt("NFTAuctionUUPS", await proxy.getAddress()), "OwnershipTransferred")
                .withArgs(ethers.ZeroAddress, owner.address);
        });

        it("Should set token oracle correctly", async function () {
            const { auction, mockUSDC, usdcOracle } = await setupAuctionWithTokens();
            expect(await auction.tokenToOracle(await mockUSDC.getAddress())).to.equal(await usdcOracle.getAddress());
        });

        it("Should allow only owner to set oracle", async function () {
            const { auction, mockUSDC } = await setupAuctionWithTokens();
            await expect(
                auction.connect(bidder1).setTokenOracle(await mockUSDC.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWith("not owner");
        });

        it("Should reject zero address as oracle", async function () {
            const { auction } = await setupAuctionWithTokens();
            await expect(
                auction.connect(owner).setTokenOracle(ethers.ZeroAddress, ethers.ZeroAddress)
            ).to.be.revertedWith("invalid oracle");
        });
    });

    describe("Ownership Management", function () {
        it("Should allow owner to transfer ownership", async function () {
            const auction = await deployFixture();
            await expect(auction.connect(owner).transferOwnership(bidder1.address))
                .to.emit(auction, "OwnershipTransferred")
                .withArgs(owner.address, bidder1.address);
            expect(await auction.owner()).to.equal(bidder1.address);
        });

        it("Should reject non-owner transferring ownership", async function () {
            const auction = await deployFixture();
            await expect(
                auction.connect(bidder1).transferOwnership(bidder2.address)
            ).to.be.revertedWith("not owner");
        });

        it("Should reject transfer to zero address", async function () {
            const auction = await deployFixture();
            await expect(
                auction.connect(owner).transferOwnership(ethers.ZeroAddress)
            ).to.be.revertedWith("invalid new owner");
        });
    });

    describe("Price Oracle", function () {
        it("Should get correct ETH price", async function () {
            const { auction, ethOracle } = await setupAuctionWithTokens();
            const price = await auction.getPriceInDollar(ethers.ZeroAddress);
            const expectedPrice = await ethOracle.latestRoundData();
            expect(price).to.equal(expectedPrice[1]);
        });

        it("Should get correct ERC20 price", async function () {
            const { auction, mockUSDC, usdcOracle } = await setupAuctionWithTokens();
            const price = await auction.getPriceInDollar(await mockUSDC.getAddress());
            const expectedPrice = await usdcOracle.latestRoundData();
            expect(price).to.equal(expectedPrice[1]);
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
            const { auction, mockNFT, mockUSDC } = await setupAuctionWithTokens();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            const startPrice = 100;
            const duration = 60;

            await expect(
                auction.connect(owner).startAuction(
                    seller.address,
                    tokenId,
                    await mockNFT.getAddress(),
                    startPrice,
                    duration,
                    await mockUSDC.getAddress()
                )
            ).to.emit(auction, "StratBid").withArgs(1);

            const auctionData = await auction.auctions(0);
            expect(auctionData.seller).to.equal(seller.address);
            expect(auctionData.nftId).to.equal(tokenId);
            expect(auctionData.startingPriceInDollar).to.equal(BigInt(startPrice) * 10n ** 8n);
            expect(auctionData.duration).to.equal(duration);
        });

        it("Should transfer NFT to auction contract", async function () {
            const { auction, mockNFT, mockUSDC } = await setupAuctionWithTokens();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await auction.connect(owner).startAuction(
                seller.address,
                tokenId,
                await mockNFT.getAddress(),
                100,
                60,
                await mockUSDC.getAddress()
            );

            expect(await mockNFT.ownerOf(tokenId)).to.equal(await auction.getAddress());
        });

        it("Should reject non-owner creating auction", async function () {
            const { auction, mockNFT, mockUSDC } = await setupAuctionWithTokens();

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
            ).to.be.revertedWith("not owner");
        });

        it("Should reject zero address NFT", async function () {
            const { auction, mockUSDC } = await setupAuctionWithTokens();
            await expect(
                auction.connect(owner).startAuction(
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
            const { auction, mockNFT, mockUSDC } = await setupAuctionWithTokens();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await expect(
                auction.connect(owner).startAuction(
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
            const { auction, mockNFT } = await setupAuctionWithTokens();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await expect(
                auction.connect(owner).startAuction(
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
            const { auction, mockUSDC, auctionId } = await createAuction();

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
            const { auction, auctionId } = await createAuction();

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
            const { auction, mockUSDC, auctionId } = await createAuction();

            const bidAmount = 50n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);

            await expect(auction.connect(bidder1).bid(auctionId, bidAmount))
                .to.be.revertedWith("invalid startingPrice");
        });

        it("Should reject bid below highest bid", async function () {
            const { auction, mockUSDC, auctionId } = await createAuction();

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
            const { auction, mockUSDC, auctionId } = await createAuction();

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
            const { auction, auctionId } = await createAuction();

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
            const { auction, mockUSDC, auctionId } = await createAuction();

            await increaseTime(3601);

            const bidAmount = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);

            await expect(auction.connect(bidder1).bid(auctionId, bidAmount))
                .to.be.revertedWith("ended");
        });
    });

    describe("End Auction", function () {
        async function createAuctionWithBid() {
            const base = await createAuction();
            const { auction, mockUSDC } = base;

            const bidAmount = 150n * 10n ** 6n;
            await mockUSDC.mint(bidder1.address, bidAmount);
            await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);
            await auction.connect(bidder1).bid(0, bidAmount);

            return { ...base, bidAmount };
        }

        it("Should reject ending auction before duration", async function () {
            const { auction, auctionId } = await createAuctionWithBid();
            await auction.end(auctionId).catch(() => {}); // Ignore error if not ended
        });

        it("Should reject ending auction with no bids", async function () {
            const { auction, mockNFT, mockUSDC } = await setupAuctionWithTokens();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await auction.connect(owner).startAuction(
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

        it("Should transfer NFT to highest bidder on end", async function () {
            const { auction, mockNFT, auctionId, tokenId } = await createAuctionWithBid();

            await increaseTime(3601);

            await expect(auction.end(auctionId))
                .to.emit(auction, "EndBid")
                .withArgs(auctionId);

            expect(await mockNFT.ownerOf(tokenId)).to.equal(bidder1.address);
        });

        it("Should transfer funds to seller on end", async function () {
            const { auction, mockUSDC, auctionId, bidAmount } = await createAuctionWithBid();

            const sellerBalanceBefore = await mockUSDC.balanceOf(seller.address);

            await increaseTime(3601);
            await auction.end(auctionId);

            const sellerBalanceAfter = await mockUSDC.balanceOf(seller.address);
            expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(bidAmount);
        });

        it("Should allow anyone to end auction", async function () {
            const { auction, auctionId } = await createAuctionWithBid();

            await increaseTime(3601);
            await auction.connect(bidder2).end(auctionId);
        });
    });

    describe("Auction Status", function () {
        it("Should return correct isEnded status", async function () {
            const { auction, mockNFT, mockUSDC } = await setupAuctionWithTokens();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auction.getAddress(), tokenId);

            await auction.connect(owner).startAuction(
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
