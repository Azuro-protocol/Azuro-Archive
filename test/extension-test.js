const { expect, assert } = require("chai");
const { constants, utils, BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");
const { getRandomConditionID } = require("../utils/utils");
const dbg = require("debug")("test:extension");

describe("Extension test", function () {
    let owner, adr1, lpOwner, oracle;
    let Core, core, Usdt, usdt, LP, lp, math;
    let now;

    now = Date.now() + 30000;

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
        const mintableAmount = constants.WeiPerEther.mul(500000000000);
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


    it("Should go through betting workflow with 2 users with slippage", async function () {
        const betAmount = constants.WeiPerEther.mul(6000);
        const betAmount2 = constants.WeiPerEther.mul(6000);
        const outcomeWin = 1;
        const outcomeLose = 2;

        //  EVENT: create condition
        let condID = 345345323;
        await core.connect(oracle).createCondition(condID, pool2, pool1, now + 3600, ethers.utils.formatBytes32String("ipfs"));
        dbg("Condition created", condID);

        let approveAmount = constants.WeiPerEther.mul(9999999);

        await network.provider.send("evm_setNextBlockTimestamp", [now+1]);
        await network.provider.send("evm_mine");
        dbg("Block mined");
        let deadline = now + 10;
        let minrate = 1000000000;

        // first player put the bet
        await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP
        dbg("LP approved");

        let txBet1 = await lp.bet(
            condID, // event
            betAmount, // bet amount value
            outcomeWin, // stake on
            deadline, // max actual datetime (unixtime)
            minrate, // user set minimal odds of stake to be accepted
            lp.address // referral address(?)
        );
        dbg("tx bet1 sent");

        // accepted bet returns "event NewBet(bytes32 indexed id, uint outcome, uint amount, uint odds);"

        // todo get betID for first player
        let receipt1 = await txBet1.wait();
        dbg("bet1 receipt recieved");
        let eBet1 = receipt1.events.filter((x) => {
            return x.event == "NewBet";
        });

        let tokenId1 = eBet1[0].args[1];
        let rate1 = eBet1[0].args[5];


        dbg(
            "NFT balance==================>",
            (await azurobet.connect(owner).balanceOf(owner.address)).toString()
        );

        await azurobet.connect(owner).transferFrom(owner.address, adr1.address, tokenId1);

        dbg(
            "NFT balance==================>",
            (await azurobet.balanceOf(owner.address)).toString(),
            (await azurobet.balanceOf(adr1.address)).toString()
        );

        //  EVENT: second player put the bet
        await usdt.connect(adr1).approve(lp.address, approveAmount);
        let txBet2 = await lp.connect(adr1).bet(
            condID,
            betAmount2,
            outcomeLose,
            deadline,
            minrate,
            lp.address
        );
        let receipt2 = await txBet2.wait();
        let eBet2 = receipt2.events.filter((x) => {
            return x.event == "NewBet";
        });
        let tokenId2 = eBet2[0].args[1];
        //let bet2ID = eBet2[0].args[0];
        let rate2 = eBet2[0].args[5];
        //dbg("BET ID 2 = ", bet2ID)
        //dbg("RATE BET ID 2 = ", utils.formatUnits(rate2, 9)) // todo hardcode check
        now+=36001
        await network.provider.send("evm_setNextBlockTimestamp", [now]);
        await network.provider.send("evm_mine")
        // resolve condition by oracle
        await core.connect(oracle).resolveCondition(condID, outcomeWin);


        //  EVENT: first player get his payout
        const better1OldBalance = await usdt.balanceOf(owner.address);
        await azurobet.setApprovalForAll(lp.address, true);

        // try to withdraw stake #1 (adr1 hold it now)
        //await lp.withdrawPayout(tokenId1)
        await expect(lp.withdrawPayout(tokenId1)).to.be.revertedWith("LP:not owner");

        // transfer back to owner
        await azurobet.connect(adr1).transferFrom(adr1.address, owner.address, tokenId1);

        // try to withdraw stake #1 from owner - must be ok
        await lp.withdrawPayout(tokenId1);
        const better1NewBalance = await usdt.balanceOf(owner.address);

        dbg(
            "NFT balance after withdraw==================>",
            (await azurobet.balanceOf(owner.address)).toString(),
            (await azurobet.balanceOf(adr1.address)).toString()
        );

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

    it("Should go through betting workflow with 2 users with bid more than pool", async function () {
        const betAmount = constants.WeiPerEther.mul(60000);
        const betAmount2 = constants.WeiPerEther.mul(6000);
        const outcomeWin = 1;
        const outcomeLose = 2;
        now +=4000;

        //  EVENT: create condition
        let condID = 345345324;
        await core.connect(oracle).createCondition(condID, pool2, pool1, now + 3600, ethers.utils.formatBytes32String("ipfs"));

        let approveAmount = constants.WeiPerEther.mul(9999999);

        await network.provider.send("evm_setNextBlockTimestamp", [now]);
        await network.provider.send("evm_mine");
        let deadline = now + 10;
        let minrate = 1000000000;

        // first player put the bet
        await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

        let txBet1 = await lp.bet(
            condID, // event
            betAmount, // bet amount value
            outcomeWin, // stake on
            deadline, // max actual datetime (unixtime)
            minrate, // user set minimal odds of stake to be accepted
            lp.address
        );

        let receipt1 = await txBet1.wait();
        let eBet1 = receipt1.events.filter((x) => {
            return x.event == "NewBet";
        });

        let tokenId1 = eBet1[0].args[1];
        let rate1 = eBet1[0].args[5];


        //  EVENT: second player put the bet
        await usdt.connect(adr1).approve(lp.address, approveAmount);
        let txBet2 = await lp.connect(adr1).bet(condID, betAmount2, outcomeLose, deadline, minrate, lp.address);
        let receipt2 = await txBet2.wait();
        let eBet2 = receipt2.events.filter((x) => {
            return x.event == "NewBet";
        });
        let tokenId2 = eBet2[0].args[1];
        //let bet2ID = eBet2[0].args[0];
        let rate2 = eBet2[0].args[5];
        //dbg("BET ID 2 = ", bet2ID)
        //dbg("RATE BET ID 2 = ", utils.formatUnits(rate2, 9)) // todo hardcode check
        now+=3601
        await network.provider.send("evm_setNextBlockTimestamp", [now]);
        await network.provider.send("evm_mine")
        // resolve condition by oracle
        await core.connect(oracle).resolveCondition(condID, outcomeWin);

        //  EVENT: first player get his payout
        const better1OldBalance = await usdt.balanceOf(owner.address);
        await azurobet.setApprovalForAll(lp.address, true);

        // try to withdraw stake #1 from owner - must be ok
        await lp.withdrawPayout(tokenId1);
        const better1NewBalance = await usdt.balanceOf(owner.address);

        dbg(
            "NFT balance after withdraw==================>",
            (await azurobet.balanceOf(owner.address)).toString(),
            (await azurobet.balanceOf(adr1.address)).toString()
        );

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

    describe("Detailed tests", function () {
        let conditionA, conditionB, conditionC
        conditionA = 100000323;
        conditionB = 200000323;
        conditionC = 300000323;
        let approveAmount = constants.WeiPerEther.mul(4000000000);
        let minrate = 1000000000;
        let deadline = now + 999999999;



        beforeEach(async () => {
            now = now + 9600
            conditionA++
            await core.connect(oracle).createCondition(conditionA, 19800, 200, now, ethers.utils.formatBytes32String("ipfs"));
            conditionB++
            await core.connect(oracle).createCondition(conditionB, 10000, 10000, now, ethers.utils.formatBytes32String("ipfs"));
            conditionC++
            await core.connect(oracle).createCondition(conditionC, 200, 19800, now, ethers.utils.formatBytes32String("ipfs"));
        });
        it("Should register bet with no slippage with bet 1/100", async function () {

            let betAmount = constants.WeiPerEther.mul(1)
            let betAmount2 = constants.WeiPerEther.mul(99)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionA, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9))
            expect(utils.formatUnits(rate1, 9)).to.equal( "19.282000541");

            // bet 2
            let txBet2 = await lp.bet(
                conditionA, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET A = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.001883332");
            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine");
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionA, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("Should register bet with no slippage with bet 1/2", async function () {

            let betAmount = constants.WeiPerEther.mul(200)
            let betAmount2 = constants.WeiPerEther.mul(200)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionB, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("BET ID A = ", tokenId1)
            dbg("RATE BET A = ", utils.formatUnits(rate1, 9)) // todo hardcode check
            expect(utils.formatUnits(rate1, 9)).to.equal( "1.904761904");

            // bet 2
            let txBet2 = await lp.bet(
                conditionB, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let rate2 = eBet2[0].args[5];

            dbg("RATE BET  = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.922848098");
            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionB, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("Should register bet with no slippage with bet 99/100", async function () {

            let betAmount = constants.WeiPerEther.mul(99)
            let betAmount2 = constants.WeiPerEther.mul(4)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionC, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9)) // todo hardcode check
            expect(utils.formatUnits(rate1, 9)).to.equal("1.001865319");

            // bet 2
            let txBet2 = await lp.bet(
                conditionC, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET A = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "19.288612022");
            //now += 4000
            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionC, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });

        it("Should register bet with slippage with bet 1/100", async function () {

            let betAmount = constants.WeiPerEther.mul(10)
            let betAmount2 = constants.WeiPerEther.mul(990)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionA, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
            lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9))
            expect(utils.formatUnits(rate1, 9)).to.equal( "19.241636897");

            // bet 2
            let txBet2 = await lp.bet(
                conditionA, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.001937809");
            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionA, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("Should register bet with slippage with bet 1/2", async function () {

            let betAmount = constants.WeiPerEther.mul(500)
            let betAmount2 = constants.WeiPerEther.mul(500)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionB, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9)) // todo hardcode check
            expect(utils.formatUnits(rate1, 9)).to.equal( "1.878644185");

            // bet 2
            let txBet2 = await lp.bet(
                conditionB, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let rate2 = eBet2[0].args[5];

            dbg("RATE BET  = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.922580943");
            //now += 4000
            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionB, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("Should register bet with slippage with bet 99/100", async function () {

            let betAmount = constants.WeiPerEther.mul(1000)
            let betAmount2 = constants.WeiPerEther.mul(10)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionC, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9)) // todo hardcode check
            expect(utils.formatUnits(rate1, 9)).to.equal("1.001751678");

            // bet 2
            let txBet2 = await lp.bet(
                conditionC, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "19.307814426");
            //now += 4000
            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionC, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });

        it("Should register bet with huge slippage with bet 1/100", async function () {

            let betAmount = constants.WeiPerEther.mul(200)
            let betAmount2 = constants.WeiPerEther.mul(19800)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionA, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9))
            expect(utils.formatUnits(rate1, 9)).to.equal( "17.661824031");

            // bet 2
            let txBet2 = await lp.bet(
                conditionA, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.001937121");

            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionA, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("Should register bet with huge slippage with bet 1/2", async function () {

            let betAmount = constants.WeiPerEther.mul(10000)
            let betAmount2 = constants.WeiPerEther.mul(10000)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionB, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9)) // todo hardcode check
            expect(utils.formatUnits(rate1, 9)).to.equal( "1.453749596");

            // bet 2
            let txBet2 = await lp.bet(
                conditionB, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let rate2 = eBet2[0].args[5];

            dbg("RATE BET  = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.916902285");

            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionB, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("Should register bet with huge slippage with bet 99/100", async function () {

            let betAmount = constants.WeiPerEther.mul(19800)
            let betAmount2 = constants.WeiPerEther.mul(200)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionC, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9))
            expect(utils.formatUnits(rate1, 9)).to.equal("1.000498887");

            // bet 2
            let txBet2 = await lp.bet(
                conditionC, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "19.295330939");

            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionC, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });

        it("attack on pool with bet 1/100", async function () {

            let betAmount = constants.WeiPerEther.mul(1000)
            let betAmount2 = constants.WeiPerEther.mul(100000)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionA, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9))
            expect(utils.formatUnits(rate1, 9)).to.equal( "11.506500724");

            // bet 2
            let txBet2 = await lp.bet(
                conditionA, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.001903263");
            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionA, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("attack on pool  with huge slippage with bet 1/2", async function () {

            let betAmount = constants.WeiPerEther.mul(50000)
            let betAmount2 = constants.WeiPerEther.mul(50000)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionB, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9)) // todo hardcode check
            expect(utils.formatUnits(rate1, 9)).to.equal( "1.137756248");

            // bet 2
            let txBet2 = await lp.bet(
                conditionB, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let rate2 = eBet2[0].args[5];

            dbg("RATE BET  = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "1.909946045");

            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionB, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });
        it("attack on pool  with huge slippage with bet 99/100", async function () {

            let betAmount = constants.WeiPerEther.mul(100000)
            let betAmount2 = constants.WeiPerEther.mul(1000)

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                conditionC, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9))
            expect(utils.formatUnits(rate1, 9)).to.equal("1.000055007");

            // bet 2
            let txBet2 = await lp.bet(
                conditionC, // event
                betAmount2, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "19.297487648");

            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(conditionC, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });

        it("should check with super low bet", async function () {

            let betAmount = constants.WeiPerEther.mul(50)

            // first player put the bet
            let condID = 21312435323;
            now += 3600
            await core.connect(oracle).createCondition(condID, 150, 260, now, ethers.utils.formatBytes32String("ipfs"));

            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            let txBet1 = await lp.bet(
                condID, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt1 = await txBet1.wait();
            let eBet1 = receipt1.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId1 = eBet1[0].args[1];
            let rate1 = eBet1[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate1, 9))
            expect(utils.formatUnits(rate1, 9)).to.equal("1.517945827");

            // bet 2
            let txBet2 = await lp.bet(
                condID, // event
                betAmount, // bet amount value
                2, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            );

            let receipt2 = await txBet2.wait();
            let eBet2 = receipt2.events.filter((x) => {
                return x.event == "NewBet";
            });

            let tokenId2 = eBet2[0].args[1];
            let rate2 = eBet2[0].args[5];

            dbg("RATE BET = ", utils.formatUnits(rate2, 9))
            expect(utils.formatUnits(rate2, 9)).to.equal( "2.562095923");

            await network.provider.send("evm_setNextBlockTimestamp", [now]);
            await network.provider.send("evm_mine")
            // resolve condition by oracle
            await core.connect(oracle).resolveCondition(condID, 1);


            //  EVENT: first player get his payout
            const better1OldBalance = await usdt.balanceOf(owner.address);
            await azurobet.setApprovalForAll(lp.address, true);


            // try to withdraw stake #1 from owner - must be ok
            await lp.withdrawPayout(tokenId1);
            const better1NewBalance = await usdt.balanceOf(owner.address);



            let better1OldBalance_plus_calculation = better1OldBalance
                .add(BigNumber.from(rate1).mul(BigNumber.from(betAmount).div(BigNumber.from(1000000000))))
                .toString();
            expect(better1OldBalance_plus_calculation).to.equal(better1NewBalance);

        });

        it("should check bet less than min", async function () {

            let betAmount = 2

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            await expect(lp.bet(
                conditionC, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            )).to.be.revertedWith("Core: small bet");

        });

        it("Should check user slippage limit", async function () {

            let betAmount = constants.WeiPerEther.mul(10)
            minrate = 19251636897 // bet will be accepted with 19.241636897 current odds is 19,2820

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            await expect(lp.bet(
                conditionA, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            )).to.be.revertedWith("Core: odds too small");


        });
        it("Should revert on big difference", async function () {

            let betAmount = constants.WeiPerEther.mul(300000000)
            let betAmount2 = constants.WeiPerEther.mul(30)


            minrate = 0

            // first player put the bet
            await usdt.approve(lp.address, approveAmount); // approve usdt for the contract LP

            await expect(lp.bet(
                conditionC, // event
                betAmount, // bet amount value
                1, // stake on
                deadline, // max actual datetime (unixtime)
                minrate, // user set minimal odds of stake to be accepted
                lp.address
            )).to.be.revertedWith("Core: Big difference");
        });
    });
});
