const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID } = require("../utils/utils");
const dbg = require("debug")("test:referal");

describe("Referral test", function () {
    let owner, adr1, lpOwner, oracle, ref;
    let Core, core, Usdt, usdt, LP, lp, math;
    let now;

    now = Date.now();

    const reinforcement = constants.WeiPerEther.mul(20000); // 10%
    const marginality = 50000000; // 5%

    const pool1 = 5000000;
    const pool2 = 5000000;

    before(async () => {
        [owner, adr1, lpOwner, oracle, ref] = await ethers.getSigners();
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
        await core.deployed();

        // setting up
        await core.connect(owner).setLP(lp.address);
        await lp.changeCore(core.address);
        const approveAmount = constants.WeiPerEther.mul(9999999);

        await usdt.approve(lp.address, approveAmount);
        dbg("Approve done ", approveAmount);

        const liquidity = constants.WeiPerEther.mul(2000000);
        await lp.addLiquidity(liquidity);
        expect(await lp.balanceOf(owner.address)).to.equal(liquidity);

        await lp.addLiquidity(constants.WeiPerEther.mul(1));
        expect(await lp.balanceOf(owner.address)).to.equal(constants.WeiPerEther.mul(2000001));
    });

    it("Should go through betting workflow with 2 users", async function () {
        const betAmount = constants.WeiPerEther.mul(100);
        const betAmount2 = constants.WeiPerEther.mul(100);
        const outcomeWin = 1;
        const outcomeLose = 2;
        const time = Date.now() + 1000000000;

        //  EVENT: create condition
        let condID = 345345323;
        await core.connect(oracle).createCondition(condID, pool2, pool1, time + 3600, ethers.utils.formatBytes32String("ipfs"));

        let approveAmount = constants.WeiPerEther.mul(9999999);

        await network.provider.send("evm_setNextBlockTimestamp", [time]);
        await network.provider.send("evm_mine");
        let deadline = time + 100;
        let minrate = 1000000000;

        // first player put the bet
        await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

        let txBet1 = await lp['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, lp.address);


        // accepted bet returns "event NewBet(bytes32 indexed id, uint outcome, uint amount, uint odds);"

        // todo get betID for first player
        let receipt1 = await txBet1.wait();
        let eBet1 = receipt1.events.filter((x) => {
            return x.event == "NewBet";
        });

        let tokenId1 = eBet1[0].args[1];
        let rate1 = eBet1[0].args[5];

        dbg("Total pending ref reward ", utils.formatUnits(await lp.pendingReward(ref.address), 18))

        //  a lot of lose bets
        await usdt.connect(adr1).approve(lp.address, approveAmount);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, ref.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, ref.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, ref.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, ref.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, lp.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, lp.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, lp.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, ref.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, ref.address);
        await lp.connect(adr1)['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, ref.address);


        await network.provider.send("evm_setNextBlockTimestamp", [time+9000]);
        await network.provider.send("evm_mine");
        // resolve condition by oracle
        await core.connect(oracle).resolveCondition(condID, outcomeWin);

        //  EVENT: first player get his payout
        const better1OldBalance = await usdt.balanceOf(owner.address);
        await azurobet.setApprovalForAll(lp.address, true);

        // try to withdraw stake #1 from owner - must be ok
        await lp.connect(owner).withdrawPayout(tokenId1);
        const better1NewBalance = await usdt.balanceOf(owner.address)

        // NFT not burns - try to withdraw again, must be reverted
        await expect(lp.withdrawPayout(tokenId1)).to.be.revertedWith("No win no payout");

        let better1OldBalance_plus_calculation = better1OldBalance
            .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
            .toString();
        expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        // referral checks
        dbg("Total pending ref reward ",utils.formatUnits(await lp.pendingReward(ref.address), 18))
        const totalRewards = await lp.totalRewards()
        const totalBetsAmount = await lp.totalBetsAmount()
        dbg("Total pool reward ",utils.formatUnits(totalRewards, 18))
        dbg("Total pool bets ",utils.formatUnits(totalBetsAmount, 18))

        dbg("Total ref balance ", utils.formatUnits(await usdt.balanceOf(ref.address), 18))
        // claim
        await lp.connect(ref).claimReward()
        dbg("Total ref balance  after claim", utils.formatUnits(await usdt.balanceOf(ref.address), 18))
        const frontAmount = (await lp.affiliates(ref.address)).amount
        dbg("Amount of referee bets ", frontAmount)

        dbg("Local calculated reward", frontAmount.div(totalBetsAmount).mul(totalRewards))

        expect(await usdt.balanceOf(ref.address)).to.equal((frontAmount.mul(BigNumber.from(1000000000))).div(totalBetsAmount).mul(totalRewards).div(BigNumber.from(1000000000)));
        // try to reclaim
        await lp.connect(ref).claimReward()
        dbg("Total ref balance  after reclaim", utils.formatUnits(await usdt.balanceOf(ref.address), 18))
    });

});
