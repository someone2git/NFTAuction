import { expect } from "chai";
import { network } from "hardhat";

describe("Simple Test", function () {
    it("should access ethers", async function () {
        const connection = await network.connect();
        const ethers = connection.ethers;
        console.log("Connection keys:", Object.keys(connection));
        const signers = await ethers.getSigners();
        console.log("Signers:", signers.length);
    });
});
