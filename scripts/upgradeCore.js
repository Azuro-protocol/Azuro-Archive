const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { constants, Contract, Signer, utils } = require("ethers");
const { makeid, timeout } = require("../utils/utils");

async function main() {
    const [deployer] = await ethers.getSigners();
    const oracle = deployer;
    const coreAddr = "0xDDB6ed54F227920ba2F503B9b09AA5D7b292c3d4"; // 5%

    console.log("Deployer wallet: ", deployer.address);
    console.log("Deployer balance:", (await deployer.getBalance()).toString());



    // lp
    const Core = await ethers.getContractFactory("Core");
    const upgraded = await upgrades.upgradeProxy(coreAddr, Core);
    console.log("upgraded");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
