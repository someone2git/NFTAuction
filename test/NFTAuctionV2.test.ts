import { expect } from "chai";
import { network } from "hardhat";
import type { NFTAuction, NFTAuctionV2, NFTAuctionUUPS, NFTAuctionUUPSV2 } from "../typechain-types/index.js";
import type { Signer } from "ethers";

type SignerWithAddress = Signer;

describe("NFTAuctionV2", function () {
    let auctionV1: NFTAuction;
    let auctionV2: NFTAuctionV2;
    let admin: SignerWithAddress;
    let seller: SignerWithAddress;
    let bidder1: SignerWithAddress;
    let ethers: any;
    let connection: any;

    beforeEach(async function () {
        connection = await network.connect();
        ethers = connection.ethers;
        [admin, seller, bidder1] = await ethers.getSigners();
    });

    async function deployV2Fixture() {
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

        // Deploy V1 implementation and proxy
        const NFTAuction = await ethers.getContractFactory("NFTAuction");
        const v1Implementation = await NFTAuction.deploy();
        await v1Implementation.waitForDeployment();

        const ERC1967Proxy = await ethers.getContractFactory("ERC1967ProxyWrapper");
        const v1InitData = v1Implementation.interface.encodeFunctionData("initialize", [admin.address]);
        const v1Proxy = await ERC1967Proxy.deploy(await v1Implementation.getAddress(), v1InitData);
        await v1Proxy.waitForDeployment();
        auctionV1 = await ethers.getContractAt("NFTAuction", await v1Proxy.getAddress());

        // Configure oracles on V1
        await auctionV1.connect(admin).setTokenOracle(await mockUSDC.getAddress(), await usdcOracle.getAddress());
        await auctionV1.connect(admin).setTokenOracle(ethers.ZeroAddress, await ethOracle.getAddress());

        // Deploy V2 implementation and proxy
        const NFTAuctionV2 = await ethers.getContractFactory("NFTAuctionV2");
        const v2Implementation = await NFTAuctionV2.deploy();
        await v2Implementation.waitForDeployment();

        const v2InitData = v2Implementation.interface.encodeFunctionData("initialize", [admin.address]);
        const v2Proxy = await ERC1967Proxy.deploy(await v2Implementation.getAddress(), v2InitData);
        await v2Proxy.waitForDeployment();
        auctionV2 = await ethers.getContractAt("NFTAuctionV2", await v2Proxy.getAddress());

        return { mockNFT, mockUSDC, ethOracle, usdcOracle };
    }

    describe("Version", function () {
        beforeEach(async function () {
            await deployV2Fixture();
        });

        it("V1 should return correct version", async function () {
            expect(await auctionV1.getVersion()).to.equal("MetaNFTAuctionV1");
        });

        it("V2 should return correct version", async function () {
            expect(await auctionV2.getVersion()).to.equal("MetaNFTAuctionV2");
        });
    });

    describe("New Features", function () {
        beforeEach(async function () {
            await deployV2Fixture();
        });

        it("V2 should have newFunction", async function () {
            expect(await auctionV2.newFunction()).to.equal("new function v2");
        });

        it("V1 should not have newFunction", async function () {
            expect(typeof (auctionV1 as any).newFunction).to.equal("undefined");
        });
    });

    describe("Inheritance", function () {
        it("V2 should inherit V1 functionality", async function () {
            const { mockNFT, mockUSDC } = await deployV2Fixture();

            await mockNFT.mint(seller.address);
            const tokenId = BigInt(0);
            await mockNFT.connect(seller).approve(await auctionV2.getAddress(), tokenId);

            await expect(
                auctionV2.connect(admin).startAuction(
                    seller.address,
                    tokenId,
                    await mockNFT.getAddress(),
                    100,
                    60,
                    await mockUSDC.getAddress()
                )
            ).to.emit(auctionV2, "StratBid").withArgs(1);

            const auctionData = await auctionV2.auctions(0);
            expect(auctionData.seller).to.equal(seller.address);
        });

        it("V2 should inherit V1 access control", async function () {
            await deployV2Fixture();

            await expect(
                auctionV2.connect(bidder1).setTokenOracle(
                    ethers.ZeroAddress,
                    "0x1234567890123456789012345678901234567890"
                )
            ).to.be.revertedWith("not admin");
        });
    });
});
