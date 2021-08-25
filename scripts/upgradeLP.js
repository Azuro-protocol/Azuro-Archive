const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { constants, Contract, Signer, utils } = require("ethers");
const { makeid, timeout } = require("../utils/utils");

async function main() {
    const [deployer] = await ethers.getSigners();
    const oracle = deployer;
    const lpAdr = "0x21F617a964146C8db9EBc0D1D06b12862335ace1"; // 5%

    console.log("Deployer wallet: ", deployer.address);
    console.log("Deployer balance:", (await deployer.getBalance()).toString());



    // lp
    const LP = await ethers.getContractFactory("LP");
    const upgraded = await upgrades.upgradeProxy(lpAdr, LP);
    console.log("upgraded");


}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
