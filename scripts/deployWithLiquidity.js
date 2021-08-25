const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { constants, Contract, Signer, utils } = require("ethers");
const { makeid, timeout } = require("../utils/utils");
// test USDT
// npx hardhat verify 0xd2A3Eb388823835E2C54087f62fBC80F2Ebcc36E --network kovan

// core implementation
// npx hardhat verify 0xc7e860869375c4a622ab16b35c48956357fc118f --network kovan

// lp implementation
// npx hardhat verify 0xeb1f5e8dff3093dfe4d533ffa672b4924e72a7c1 --network kovan
/*
deploy 2021-06-02 20:42
-------------------------------------------------------------
Deployer wallet:  0x2c33fEe397eEA9a3573A31a2Ea926424E35584a1
Deployer balance: 1841430450000000000
usdt deployed to: 0xF4C1E4c6F5dec214806733E1805a5F4Cb1341f2C
lp deployed to  : 0x07bd2f30C251a567E9F7B28e17659318f662D8e6
lp impl         : 0x5b3704a7aFaf0bEaBEcf62d2663980af10A769E1
core deployed to: 0xad4b375c1190e892C7E334aF8Dc34f31A1CAb908
core impl       : 0xc66205EE473F76804f29dA58a2aaFC2F1d848F67
CORE: LP address set to 0x07bd2f30C251a567E9F7B28e17659318f662D8e6
LP: core address set to 0x0000000000000000000000000000000000000000
Approve done  9999999000000000000000000
LP tokens supply 0

deploy 2021-06-09 00:54
-------------------------------------------------------------
> btts-v1-core@1.0.0 deploy-kovan /home/maksim/BTTS-protocol/BTTS-v1-core
> npx hardhat run scripts/deployWithLiquidity.js --network kovan

Deployer wallet:  0x2c33fEe397eEA9a3573A31a2Ea926424E35584a1
Deployer balance: 1791772094000000000
usdt deployed to: 0xd2A3Eb388823835E2C54087f62fBC80F2Ebcc36E
lp deployed to  : 0x375D5318e38D3Dfca82034968beDFdE5F7aC8F9e
lp impl         : 0xeb1f5e8dff3093dfe4d533ffa672b4924e72a7c1
core deployed to: 0xd685A144d5E33551e40c8E1A7f4815f81A8db339
core impl       : 0xc7e860869375c4a622ab16b35c48956357fc118f
CORE: LP address set to 0x375D5318e38D3Dfca82034968beDFdE5F7aC8F9e
LP: core address set to 0x0000000000000000000000000000000000000000
Approve done  9999999000000000000000000
LP tokens supply 0
*/
async function main() {

    const [deployer] = await ethers.getSigners();
    const oracleAddr = deployer.address;
    const reinforcement = constants.WeiPerEther.mul(20000); // 20000
    const marginality = 50000000; // 5%

    console.log("Deployer wallet: ", deployer.address);
    console.log("Deployer balance:", (await deployer.getBalance()).toString());

    // test USDT
    const Usdt = await ethers.getContractFactory("TestERC20");
    const usdt = await Usdt.deploy();
    await usdt.deployed();
    await timeout(8000);
    console.log("usdt deployed to:", usdt.address);
    const mintableAmount = constants.WeiPerEther.mul(8000000);
    await usdt.mint(deployer.address, mintableAmount);
    await timeout(8000);

    // Math
    const MathContract = await ethers.getContractFactory("Math");
    math = await upgrades.deployProxy(MathContract);
    console.log("Math deployed to:", math.address);

    // nft
    AzuroBet = await ethers.getContractFactory("AzuroBet");
    azurobet = await upgrades.deployProxy(AzuroBet);
    console.log("azurobet deployed to:", azurobet.address);
    await azurobet.deployed();
    await timeout(8000);

    // lp
    const LP = await ethers.getContractFactory("LP");
    const lp = await upgrades.deployProxy(LP, [usdt.address, azurobet.address]);
    await lp.deployed();
    await timeout(8000);
    console.log("lp deployed to  :", lp.address);


    // CORE
    const Core = await ethers.getContractFactory("Core");
    const core = await upgrades.deployProxy(Core, [reinforcement, oracleAddr, marginality, math.address]);
    await core.deployed();
    await timeout(8000);
    console.log("core deployed to:", core.address);

    await core.setLP(lp.address);
    await timeout(8000);
    console.log("CORE: LP address set to", await core.lpAddress());
    await lp.changeCore(core.address);
    console.log("LP: core address set to", await lp.core());
    await timeout(8000);

    await azurobet.setLP(lp.address);
    console.log("azurobet: LP address set to");

    const approveAmount = constants.WeiPerEther.mul(9999999);
    await usdt.approve(lp.address, approveAmount);
    console.log("Approve done ", approveAmount.toString());
    await timeout(9000);

    const liquidity = constants.WeiPerEther.mul(2000000);
    await lp.addLiquidity(liquidity);
    console.log("LP tokens supply", (await lp.totalSupply()).toString());
    await timeout(8000);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
