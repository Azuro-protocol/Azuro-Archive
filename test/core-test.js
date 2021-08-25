const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID } = require("../utils/utils");
const dbg = require("debug")("test:core");

describe("Core test", function () {
    let owner, adr1, lpOwner, oracle;
    let Core, core, Usdt, usdt, LP, lp, math;
    let now;

    now = Date.now();

    const reinforcement = constants.WeiPerEther.mul(20000); // 10%
    const marginality = 50000000; // 5%

    let condID = 13253453;
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
        await core.deployed();

        //dbg('balanceOf', await core.connect(adr1).balanceOf(0, owner));

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

    it("upgrade works", async () => {
        mathLibrary = await ethers.getContractFactory("Math");
        math = await mathLibrary.deploy();
        dbg(math.address);
        const CoreV2 = await ethers.getContractFactory("Core");
        const upgraded = await upgrades.upgradeProxy(core.address, CoreV2);
        expect(await upgraded.oracle()).to.equal(oracle.address);
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

        //dbg("1 for 1 Bet outcome1 = %s with 5% newOdds = (bank1=%s bank2=%s)",100, utils.formatUnits(await core.getOddsFromBanks(100000000000000000000000,100000000000000000000000, 100, 1, 50000000),9), 100000000000000000000000,100000000000000000000000);
    });

    describe("Should go through betting extending limits", async function () {
        let time, deadline, minrate, outcomeWin;
        let betAmount = constants.WeiPerEther.mul(100);
        beforeEach(async function () {
            // create condition
            time = Date.now() + 10000;

            condID++;
            await core.connect(oracle).createCondition(condID, pool2, pool1, time + 3600,  ethers.utils.formatBytes32String("ipfs")); // add timelimit to 1 hour after this time

            let approveAmount = constants.WeiPerEther.mul(9999999);

            await network.provider.send("evm_setNextBlockTimestamp", [time]);
            await network.provider.send("evm_mine");

            await usdt.approve(lp.address, approveAmount);
        });
        it("Should except deadline outdated", async function () {
            outcomeWin = 1;
            deadline = time - 10;
            minrate = 0;
            await expect(lp['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, lp.address)).to.be.revertedWith("LP:EXPIRED");
        });
        it("Should except minrate extended", async function () {
            outcomeWin = 1;
            deadline = time + 10;
            minrate = 9000000000;
            await expect(lp['bet(uint256,uint256,uint256,uint256,uint256,address)'](condID, betAmount, outcomeWin, deadline, minrate, lp.address)).to.be.revertedWith(
                "Core: odds too small"
            );
        });
    });

    it("Should go through betting workflow with 2 users", async function () {
        const betAmount = constants.WeiPerEther.mul(100);
        const betAmount2 = constants.WeiPerEther.mul(100);
        const outcomeWin = 1;
        const outcomeLose = 2;
        const time = Date.now();

        //  EVENT: create condition
        condID++;
        await core.connect(oracle).createCondition(condID, pool2, pool1, time + 3600, ethers.utils.formatBytes32String("ipfs"));

        let approveAmount = constants.WeiPerEther.mul(9999999);

        await network.provider.send("evm_setNextBlockTimestamp", [time]);
        await network.provider.send("evm_mine");
        let deadline = time + 10;
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

        expect((await azurobet.balanceOf(owner.address)).toString()).to.equal("1")
        await azurobet.connect(owner).transferFrom(owner.address, adr1.address, tokenId1)
        expect((await azurobet.balanceOf(adr1.address)).toString()).to.equal("1")

        //  EVENT: second player put the bet
        await usdt.connect(adr1).approve(lp.address, approveAmount);
        let txBet2 = await lp.connect(adr1).bet(condID, betAmount2, outcomeLose, deadline, minrate, lp.address);
        let receipt2 = await txBet2.wait();
        let eBet2 = receipt2.events.filter((x) => {
            return x.event == "NewBet";
        });
        let tokenId2 = eBet2[0].args[1]
        let rate2 = eBet2[0].args[5];

        await network.provider.send("evm_setNextBlockTimestamp", [time+9000]);
        await network.provider.send("evm_mine");
        // resolve condition by oracle
        await core.connect(oracle).resolveCondition(condID, outcomeWin);

        //  EVENT: first player get his payout
        const better1OldBalance = await usdt.balanceOf(owner.address);
        await azurobet.setApprovalForAll(lp.address, true);

        // try to withdraw stake #1 (adr1 hold it now)
        await expect(lp.withdrawPayout(tokenId1)).to.be.revertedWith("LP:not owner");

        // transfer back to owner
        expect((await azurobet.balanceOf(adr1.address)).toString()).to.equal("2")
        await azurobet.connect(adr1).transferFrom(adr1.address, owner.address, tokenId1);
        expect((await azurobet.balanceOf(owner.address)).toString()).to.equal("1")

        // try to withdraw stake #1 from owner - must be ok
        await lp.withdrawPayout(tokenId1);
        const better1NewBalance = await usdt.balanceOf(owner.address)

        expect((await azurobet.balanceOf(adr1.address)).toString()).to.equal("1")
        expect((await azurobet.balanceOf(owner.address)).toString()).to.equal("1") // no NFT burn

        // NFT not burns - try to withdraw again, must be reverted
        await expect(lp.withdrawPayout(tokenId1)).to.be.revertedWith("No win no payout");

        let better1OldBalance_plus_calculation = better1OldBalance
            .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
            .toString();
        expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        // if second player go for payout he does not got anything because he lose the bet
        let token2Payout = await lp.viewPayout(tokenId2);
        dbg("payouts for token2 isWin =", token2Payout[0], "Payout value", token2Payout[1].toString());

        // call will be reverted with `No win no payout` message
        await expect(lp.connect(adr1).withdrawPayout(tokenId2)).to.be.revertedWith("No win no payout");
    });

    describe("Check restrictions", () => {

      //Only Oracle create
      it("Should NOT create condition from not oracle", async () => {
        condID++;
        try {
          await core.connect(adr1)
            .createCondition(condID, pool2, pool1, now + 3600, ethers.utils.formatBytes32String("ipfs"));
          throw new Error("Success transaction from not oracle");
        } catch(e) {
          //console.log("catched err:", e);
          assert(e.message.includes("Only Oracle"), e.message);
        }
      });

      //Non zero timestamp
      it("Should NOT create condition with zero timestamp", async () => {
        condID++;
        try {
          await core.connect(oracle)
            .createCondition(condID, pool2, pool1, 0, ethers.utils.formatBytes32String("ipfs"));
          throw new Error("Success transaction with zero time");
        } catch(e) {
          //console.log("catched err:", e);
          assert(e.message.includes("timestamp can not be zero"), e.message);
        }
      });

      //Resolve only created
      it("Should NOT resolve condition than not been created before", async() => {
        condID++;
        const outcomeWin = 1;
        try {
          await core.connect(oracle)
            .resolveCondition(condID, outcomeWin);
          throw new Error("Success resolve transaction for unknown condition");
        } catch(e) {
          //console.log("catched err:", e);
          assert(e.message.includes("not exists"), e.message);
        }
      });

      //Only oracle resolve
      it("Should NOT resolve condition from not oracle", async () => {
        condID++;
        const outcomeWin = 1;
        await core.connect(oracle)
          .createCondition(condID, pool2, pool1, now + 3600, ethers.utils.formatBytes32String("ipfs"));
        try {
          await core.connect(adr1)
            .resolveCondition(condID, outcomeWin);
          throw new Error("Success transaction from not oracle");
        } catch(e) {
          //console.log("catched err:", e);
          assert(e.message.includes("Only Oracle"), e.message);
        }
      });
    });
});
