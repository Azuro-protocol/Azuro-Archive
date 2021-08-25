const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { constants, Contract, Signer, utils } = require("ethers");
const { makeid, timeout } = require("../utils/utils");

async function main() {
    const [deployer] = await ethers.getSigners();
    const oracle = deployer;
    const AzuroBetAdr = "0x1eeef1fA1Ac6126B700AB0911eb48950a76DCF4f"; // 5%

    console.log("Deployer wallet: ", deployer.address);
    console.log("Deployer balance:", (await deployer.getBalance()).toString());



    const AzuroBet = await ethers.getContractFactory("AzuroBet");
    const upgraded = await upgrades.upgradeProxy(AzuroBetAdr, AzuroBet);
    console.log("upgraded");


}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
