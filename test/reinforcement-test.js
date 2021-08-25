const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID } = require("../utils/utils");
const dbg = require("debug")("test:reinforcement");

describe("Reinforcement test", async function () {
    // redeploy
    const reinforcement = constants.WeiPerEther.mul(20000); // 10%
    const marginality = 50000000; // 5%
    let now;

    const pool1 = 5000000;
    const pool2 = 5000000;

    before(async () => {
        [owner, adr1, lpOwner, oracle] = await ethers.getSigners();
        /* Core   = await ethers.getContractFactory("Core")
    core = await upgrades.deployProxy(Core, [0.1*10^9, oracle.address, 0.05*10^9]) */


        now = Date.now();

        // test USDT
        Usdt = await ethers.getContractFactory("TestERC20");
        usdt = await Usdt.deploy();
        dbg("usdt deployed to:", usdt.address);
        const mintableAmount = constants.WeiPerEther.mul(8000000);
        await usdt.deployed();
        await usdt.mint(owner.address, mintableAmount);
        await usdt.mint(adr1.address, mintableAmount);

        // nft
        AzuroBet = await ethers.getContractFactory("AzuroBet");
        azurobet = await upgrades.deployProxy(AzuroBet);
        dbg("azurobet deployed to:", azurobet.address);
        await azurobet.deployed();
        dbg(await azurobet.owner(), "-----1", owner.address);

        // lp
        LP = await ethers.getContractFactory("LP");
        lp = await upgrades.deployProxy(LP, [usdt.address, azurobet.address]);
        dbg("lp deployed to:", lp.address);
        await lp.deployed();
        dbg(await lp.owner(), "-----2", owner.address);
        await azurobet.setLP(lp.address);

        // Math
        const MathContract = await ethers.getContractFactory("Math");
        math = await upgrades.deployProxy(MathContract);
        dbg("Math deployed to:", math.address);

        Core = await ethers.getContractFactory("Core");
        core = await upgrades.deployProxy(Core, [reinforcement, oracle.address, marginality, math.address]);
        dbg("core deployed to:", core.address);
        await core.deployed()

        //dbg('balanceOf', await core.connect(adr1).balanceOf(0, owner));

        // setting up
        await core.connect(owner).setLP(lp.address);
        await lp.changeCore(core.address);
        const approveAmount = constants.WeiPerEther.mul(9999999);

        await usdt.approve(lp.address, approveAmount);
        dbg("Approve done ", approveAmount);

        const liquidity = constants.WeiPerEther.mul(2000000);
        await lp.addLiquidity(liquidity);
    });
    it("Should check reinforcement limits", async function () {
        let condID = 3454364475358;
        fund1Should = reinforcement.mul(pool1).div(pool1 + pool2)
        for(let i = 0; i < 50; i++) {
            condID++;
            await core.connect(oracle).createCondition(condID, pool2, pool1, now + 3600, ethers.utils.formatBytes32String("ipfs"))
            let condition = await core.getCondition(condID)
            expect(condition.fundBank[0]).to.equal(fund1Should)
        }
        let condID2 = 6579767;
        await expect(core.connect(oracle).createCondition(condID2, pool2, pool1, now + 3600, ethers.utils.formatBytes32String("ipfs"))).to.be.revertedWith("Not enough liquidity");
    });
});
