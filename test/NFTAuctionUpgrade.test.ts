import { expect } from "chai";
import { network } from "hardhat";
import type { NFTAuctionUUPS, NFTAuctionUUPSV2 } from "../typechain-types/index.js";
import type { Contract } from "ethers";
import type { Signer } from "ethers";

type SignerWithAddress = Signer;

describe("NFTAuction UUPS Upgrade", function () {
    let auction: NFTAuctionUUPS;
    let proxy: Contract;
    let proxyAddress: string;
    let owner: SignerWithAddress;
    let seller: SignerWithAddress;
    let bidder1: SignerWithAddress;
    let ethers: any;
    let connection: any;

    beforeEach(async function () {
        connection = await network.connect();
        ethers = connection.ethers;
        [owner, seller, bidder1] = await ethers.getSigners();
    });

    async function increaseTime(seconds: number) {
        await connection.provider.send("evm_increaseTime", [seconds]);
        await connection.provider.send("hardhat_mine");
    }

    async function deployUpgradeableFixture() {
        // Deploy Mock contracts
        const MockNFT = await ethers.getContractFactory("MockNFT");
        const mockNFT = await MockNFT.deploy();
        await mockNFT.waitForDeployment();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();

        const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
        const ethOracle = await MockPriceOracle.deploy(200000000000, 8);
        const usdcOracle = await MockPriceOracle.deploy(100000000, 8);
        await ethOracle.waitForDeployment();
        await usdcOracle.waitForDeployment();

        // Deploy V1 implementation
        const NFTAuctionUUPS = await ethers.getContractFactory("NFTAuctionUUPS");
        const auctionImpl = await NFTAuctionUUPS.deploy();
        await auctionImpl.waitForDeployment();

        // Deploy ERC1967Proxy
        const ERC1967Proxy = await ethers.getContractFactory("ERC1967ProxyWrapper");
        const initData = auctionImpl.interface.encodeFunctionData("initialize", [owner.address]);
        proxy = await ERC1967Proxy.deploy(await auctionImpl.getAddress(), initData);
        await proxy.waitForDeployment();

        // Connect to proxy
        auction = await ethers.getContractAt("NFTAuctionUUPS", await proxy.getAddress());

        // Configure oracles
        await auction.connect(owner).setTokenOracle(await mockUSDC.getAddress(), await usdcOracle.getAddress());
        await auction.connect(owner).setTokenOracle(ethers.ZeroAddress, await ethOracle.getAddress());

        // Create an auction for testing data persistence
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

        // Bidder1 bids
        const bidAmount = 150n * 10n ** 6n;
        await mockUSDC.mint(bidder1.address, bidAmount);
        await mockUSDC.connect(bidder1).approve(await auction.getAddress(), bidAmount);
        await auction.connect(bidder1).bid(0, bidAmount);

        proxyAddress = await proxy.getAddress();

        return { auctionImpl, mockNFT, mockUSDC, ethOracle, usdcOracle, tokenId, bidAmount };
    }

    describe("Basic Upgrade Functionality", function () {
        it("Should upgrade to V2", async function () {
            await deployUpgradeableFixture();

            // Deploy V2 implementation
            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();

            // Upgrade to V2
            const upgradeTx = await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");
            await upgradeTx.wait();

            // Verify upgrade success
            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            expect(await auctionV2.getVersion()).to.equal("NFTAuctionUUPSV2");
        });

        it("Should retain V2 new features after upgrade", async function () {
            await deployUpgradeableFixture();

            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();

            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            expect(await auctionV2.newFunction()).to.equal("new function v2");
        });

        it("Should allow only owner to upgrade", async function () {
            await deployUpgradeableFixture();

            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();

            await expect(
                auction.connect(bidder1).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x")
            ).to.revertedWith("not owner");
        });

        it("Should retain owner after upgrade", async function () {
            await deployUpgradeableFixture();

            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();

            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            expect(await auctionV2.owner()).to.equal(owner.address);
        });
    });

    describe("Data Persistence After Upgrade", function () {
        it("Should retain auction data after upgrade", async function () {
            const { tokenId, bidAmount } = await deployUpgradeableFixture();

            // Record data before upgrade
            const auctionDataBefore = await auction.auctions(0);

            // Upgrade
            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();
            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            // Verify data persistence
            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            const auctionDataAfter = await auctionV2.auctions(0);

            expect(auctionDataAfter.seller).to.equal(auctionDataBefore.seller);
            expect(auctionDataAfter.highestBidder).to.equal(auctionDataBefore.highestBidder);
            expect(auctionDataAfter.highestBid).to.equal(auctionDataBefore.highestBid);
            expect(auctionDataAfter.startingPriceInDollar).to.equal(auctionDataBefore.startingPriceInDollar);
        });

        it("Should retain auctionId after upgrade", async function () {
            await deployUpgradeableFixture();

            const auctionIdBefore = await auction.auctionId();

            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();
            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            const auctionIdAfter = await auctionV2.auctionId();

            expect(auctionIdAfter).to.equal(auctionIdBefore);
        });

        it("Should retain tokenToOracle mapping after upgrade", async function () {
            const { mockUSDC } = await deployUpgradeableFixture();

            const oracleBefore = await auction.tokenToOracle(await mockUSDC.getAddress());

            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();
            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            const oracleAfter = await auctionV2.tokenToOracle(await mockUSDC.getAddress());

            expect(oracleAfter).to.equal(oracleBefore);
        });

        it("Should continue auction operations after upgrade", async function () {
            const { mockNFT, mockUSDC } = await deployUpgradeableFixture();

            // Upgrade
            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();
            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);

            // Create new auction - mint a new token (tokenId will be 1 since tokenId 0 was used in fixture)
            const mintTx = await mockNFT.mint(seller.address);
            const mintReceipt = await mintTx.wait();
            // Extract tokenId from the Transfer event (topic[2] is tokenId for ERC721 Transfer)
            const transferLog = mintReceipt?.logs[0];
            const tokenId2 = ethers.toNumber(transferLog?.topics[3]);

            await mockNFT.connect(seller).approve(await auctionV2.getAddress(), tokenId2);

            // After deployUpgradeableFixture, auctionId is 1, so new auction will be 2
            await auctionV2.connect(owner).startAuction(
                seller.address,
                tokenId2,
                await mockNFT.getAddress(),
                200,
                3600,
                await mockUSDC.getAddress()
            );

            // Verify auctionId is now 2
            expect(await auctionV2.auctionId()).to.equal(2);

            const newAuction = await auctionV2.auctions(1);
            expect(newAuction.seller).to.equal(seller.address);
        });

        it("Should end previous auction after upgrade", async function () {
            const { mockNFT, tokenId } = await deployUpgradeableFixture();

            // Upgrade
            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();
            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            const auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);

            // Time travel
            await increaseTime(3601);

            // End previous auction
            await expect(auctionV2.end(0))
                .to.emit(auctionV2, "EndBid")
                .withArgs(0);

            // Verify NFT transferred to bidder1
            expect(await mockNFT.ownerOf(tokenId)).to.equal(bidder1.address);
        });
    });

    describe("Upgrade Events", function () {
        it("Should emit Upgraded event on upgrade", async function () {
            await deployUpgradeableFixture();

            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();

            await expect(auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x"))
                .to.emit(auction, "Upgraded")
                .withArgs(await auctionV2Impl.getAddress());
        });
    });

    describe("Multiple Upgrades", function () {
        it("Should support multiple upgrades", async function () {
            await deployUpgradeableFixture();

            // First upgrade to V2
            const NFTAuctionUUPSV2 = await ethers.getContractFactory("NFTAuctionUUPSV2");
            const auctionV2Impl = await NFTAuctionUUPSV2.deploy();
            await auctionV2Impl.waitForDeployment();
            await auction.connect(owner).upgradeToAndCall(await auctionV2Impl.getAddress(), "0x");

            let auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            expect(await auctionV2.getVersion()).to.equal("NFTAuctionUUPSV2");

            // Second upgrade back to V1
            const NFTAuctionUUPS = await ethers.getContractFactory("NFTAuctionUUPS");
            const auctionV1Impl = await NFTAuctionUUPS.deploy();
            await auctionV1Impl.waitForDeployment();
            await auctionV2.connect(owner).upgradeToAndCall(await auctionV1Impl.getAddress(), "0x");

            auctionV2 = await ethers.getContractAt("NFTAuctionUUPSV2", proxyAddress);
            // Note: After downgrading to V1, calling V2-specific functions will fail
            // but data should persist
            expect(await auctionV2.auctionId()).to.equal(1);
        });
    });

    describe("Initialization Protection", function () {
        it("Implementation should not be reinitializable", async function () {
            const { auctionImpl } = await deployUpgradeableFixture();

            // Implementation is initialized on deployment via _disableInitializers
            await expect(auctionImpl.initialize("0x1234567890123456789012345678901234567890"))
                .to.be.rejected;
        });

        it("Proxy should not be reinitializable", async function () {
            await deployUpgradeableFixture();

            await expect(auction.initialize(owner.address))
                .to.be.rejected;
        });
    });
});
