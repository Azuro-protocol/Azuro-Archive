const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID } = require("../utils/utils");
const dbg = require("debug")("test:math");

describe("Math test", function () {
    let owner, adr1, lpOwner, oracle;
    let Core, core, Usdt, usdt, LP, lp, math;

    const reinforcement = constants.WeiPerEther.mul(20000); // 10%
    const marginality = 50000000; // 5%

    const pool1 = 5000000;
    const pool2 = 5000000;

    before(async () => {
        [owner, adr1, lpOwner, oracle] = await ethers.getSigners();
        /* Core   = await ethers.getContractFactory("Core")
    core = await upgrades.deployProxy(Core, [0.1*10^9, oracle.address, 0.05*10^9]) */

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

    it("Should calculate margin", async function () {
        var a = await math.addMargin(1730000000, 50000000, 1e9);
        dbg("1.73 with 5% newOdds = ", utils.formatUnits(a, 9));
        expect(a).to.equal(1658829423);

        a = await math.addMargin(1980000000, 50000000, 1e9);
        dbg("1.98 with 5% newOdds = ", utils.formatUnits(a, 9));
        expect(a).to.equal(1886657619);

        a = await math.addMargin(1980000000, 100000000, 1e9);
        dbg("1.98 with 10% newOdds = ", utils.formatUnits(a, 9));
        expect(a).to.equal(1801801818);
    });

    it("Should calculate rates", async function () {
        // getOddsFromBanks must be without marginality
        var a = await math.getOddsFromBanks(1500000000, 3000000000, 100000, 1, 50000000, 1e9);
        dbg(
            "1.73 for 3.0 Bet outcome1 = %s with 5% newOdds = %s, (bank1=%s bank2=%s)",
            100000,
            utils.formatUnits(a, 9),
            1730000000,
            3000000000
        );
        expect(a).to.equal(2787053105);

        a = await math.getOddsFromBanks(50000000, 50000000, 100000, 1, 50000000, 1e9);
        dbg(
            "1 for 1 Bet outcome1 = %s with 5% newOdds = %s, (bank1=%s bank2=%s)",
            100000,
            utils.formatUnits(a, 9),
            50000000,
            50000000
        );
        expect(a).to.equal(1904761904);

        a = await math.getOddsFromBanks(50000000, 50000000, 25000000, 1, 50000000, 1e9);
        dbg(
            "1 for 1 Bet outcome1 = %s with 5% newOdds = %s (bank1=%s bank2=%s)",
            25000000,
            utils.formatUnits(a, 9),
            50000000,
            50000000
        );
        expect(a).to.equal(1610952313);
    });
});
