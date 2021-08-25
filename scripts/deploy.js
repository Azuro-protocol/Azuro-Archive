const { constants, Contract, Signer, utils } = require("ethers");
// core
//  npx hardhat verify 0x2B85474A59a16d646cED7173aeCd1af682CC3D49 100000000 0x834DD1699F7ed641b8FED8A57D1ad48A9B6Adb4E 50000000 --network rinkeby

// lp
// npx hardhat verify 0xa6428fff7800BE2d38F6317D0E345c696340F8E4 0x9A5c3d67c3Da4707109CE85724c6fC146cbe6e11 --network rinkeby
async function main() {
    const [deployer] = await ethers.getSigners();
    const oracle = deployer;
    const reinforcement = 100000000; // 10%
    const marginality = 50000000; // 5%

    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    // test USDT
    const Usdt = await ethers.getContractFactory("TestERC20");
    const usdt = await Usdt.deploy();
    console.log("usdt deployed to:", usdt.address);
    const mintableAmount = constants.WeiPerEther.mul(8000000);
    await usdt.mint(deployer.address, mintableAmount);

    // lp
    const LP = await ethers.getContractFactory("LP");
    const lp = await LP.deploy(usdt.address);
    console.log("lp deployed to:", lp.address);

    // CORE
    const CORE = await ethers.getContractFactory("Core");
    const core = await CORE.deploy(reinforcement, oracle.address, marginality);
    console.log("core deployed to:", core.address);

    await core.setLP(lp.address);
    await lp.changeCore(core.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
