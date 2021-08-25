// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";
import "./Libraries/IMath.sol";
import "./interface/ILP.sol";
import "./interface/ICore.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title This contract register bets and create conditions
contract Core is OwnableUpgradeable, ICore {
    struct Bet {
        uint256 conditionID;
        uint256 amount;
        uint256 odds;
        uint256 outcome;
        bool payed;
        uint256 createdAt;
    }

    struct Condition {
        uint256 reinforcement;
        uint256[2] fundBank;
        uint256[2] payouts;
        uint256 margin;
        bytes32 ipfsHash;
        uint256 outcomeWin;
        uint256 maxPayout; // maximum sum of payouts to be paid on some result
        uint256 timestamp; // after this time user cant put bet on condition
    }

    uint256 public decimals;
    address public oracle;
    uint256 public conditionsReinforcementFix; // should be 20k
    uint256 public conditionsMargin;

    address public lpAddress;
    address public mathAddress;

    mapping(uint256 => Condition) public conditions;
    mapping(uint256 => Bet) public bets; // tokenID -> BET

    uint256 public lastBetID; //start from 1

    // total payout's locked value - sum of maximum payouts of all execution Condition.
    // on each Condition at betting calculate sum of maximum payouts and put it here
    // after Condition finished on each user payout decrease its value
    uint256 public totalLockedPayout;

    modifier onlyOracle {
        require(msg.sender == oracle, "Core:Only Oracle");
        _;
    }

    modifier OnlyLP() {
        require(msg.sender == lpAddress, "Core:Only LP");
        _;
    }

    /**
     * init
     */
    function initialize(
        uint256 reinforcement_,
        address oracle_,
        uint256 margin_,
        address math_
    ) public virtual initializer {
        __Ownable_init();
        oracle = oracle_;
        conditionsMargin = margin_; // in decimals ^9
        conditionsReinforcementFix = reinforcement_; // in token decimals
        decimals = 10**9;
        mathAddress = math_;
    }

    function getLockedPayout() external view override returns (uint256) {
        return totalLockedPayout;
    }

    /**
      * @dev create condition from oracle
      * @param oracleConditionID_ the current match or game id
      * @param odds1_ start odds for team 1
      * @param odds2_ start odds for team 2
      * @param timestamp_ time when match starts and bets stopped accepts
      * @param ipfsHash_ detailed info about math stored in IPFS
      */
    function createCondition(
        uint256 oracleConditionID_,
        uint256 odds1_,
        uint256 odds2_,
        uint256 timestamp_,
        bytes32 ipfsHash_
    ) onlyOracle external override {
        require(timestamp_ > 0, "Core: timestamp can not be zero");
        require(
            ILP(lpAddress).getPossibilityOfReinforcement(
                conditionsReinforcementFix
            ),
            "Not enough liquidity"
        );

        Condition storage newCondition = conditions[oracleConditionID_];
        require(newCondition.timestamp == 0, "Core: condition already set");

        newCondition.fundBank[0] = (conditionsReinforcementFix * odds2_) /
        (odds1_ + odds2_);
        newCondition.fundBank[1] = (conditionsReinforcementFix * odds1_) /
        (odds1_ + odds2_);

        newCondition.reinforcement = conditionsReinforcementFix;
        newCondition.timestamp = timestamp_;
        newCondition.ipfsHash = ipfsHash_;
        ILP(lpAddress).lockReserve(conditionsReinforcementFix);

        // save new condition link
        newCondition.margin = conditionsMargin; //not used yet
        emit ConditionCreated(oracleConditionID_, timestamp_);
    }

    /**
     * @dev register the bet in the core
     * @param conditionID_ the current match or game
     * @param amount_ bet amount in tokens
     * @param outcomeWin_ bet outcome
     * @param minOdds_ odds slippage
     * @return betID with odds of this bet and updated funds
     * @return odds
     * @return fund1 after bet
     * @return fund2 after bet
     */
    function putBet(
        uint256 conditionID_,
        uint256 amount_,
        uint256 outcomeWin_,
        uint256 minOdds_
    )
        external
        override
        OnlyLP
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        Condition storage condition = conditions[conditionID_];
        require(
            (condition.fundBank[1] + amount_) / condition.fundBank[0] < 10000 &&
        (condition.fundBank[0] + amount_)/ condition.fundBank[1] < 10000,
            "Core: Big difference"
        );
        require(
            block.timestamp < condition.timestamp,
            "Core: bet's time exceeded"
        );

        require(outcomeWin_ == 1 || outcomeWin_ == 2, "Core: Wrong bet outcome");
        lastBetID += 1;

        uint256 odds =
            IMath(mathAddress).getOddsFromBanks(
                condition.fundBank[0],
                condition.fundBank[1],
                    amount_,
                    outcomeWin_,
                condition.margin,
                decimals
            );
        require(odds >= minOdds_, "Core: odds too small");
        require(amount_ > decimals, "Core: small bet");

        Bet storage newBet = bets[lastBetID];

        newBet.odds = odds;
        newBet.amount = amount_;
        newBet.outcome = outcomeWin_;
        newBet.conditionID = conditionID_;
        newBet.createdAt = block.timestamp;

        condition.fundBank[outcomeWin_ - 1] =
            condition.fundBank[outcomeWin_ - 1] +
            amount_;
        condition.payouts[outcomeWin_ - 1] += (odds * amount_) / decimals;

        // calc maximum payout's value
        uint256 maxPayout =
            (
                condition.payouts[0] > condition.payouts[1]
                    ? condition.payouts[0]
                    : condition.payouts[1]
            );
        if (maxPayout > condition.maxPayout) {
            // if new maxPayout greater than previouse saved -> save new value
            // and add greater delta to global totalLockedPayout
            totalLockedPayout += (maxPayout - condition.maxPayout);
            condition.maxPayout = maxPayout;
        }
        //emit FundsChange(newBet.conditionID,condition.fund1Bank, condition.fund2Bank);

        return (
            lastBetID,
            odds,
            condition.fundBank[0],
            condition.fundBank[1]
        );
    }

    /**
      * @dev resolve the payout
      * @param tokenID it is betID
      * @return success
      * @return amount of better win
      */
    function resolvePayout(uint256 tokenID)
        external
        override
        OnlyLP
        returns (bool success, uint256 amount)
    {
        Bet storage currentBet = bets[tokenID];

        Condition storage condition = conditions[currentBet.conditionID];

        require(condition.outcomeWin != 0, "Event not happened yet");

        // if condition resulted (any result)
        // and exists amount of locked payout -> release locked payout from global state
        if (condition.maxPayout != 0) {
            // decrease global totalLockedPayout on payout paid value
            totalLockedPayout -= condition.maxPayout;
            condition.maxPayout = 0;
        }

        (success, amount) = _viewPayout(tokenID);

        if (success && amount > 0) {
            currentBet.payed = true;
        }

        return (success, amount);
    }

    /**
    * @dev resolve condition from oracle
    * @param conditionID_ - id of the game
    * @param outcomeWin_ - team win outcome
    */
    function resolveCondition(uint256 conditionID_, uint256 outcomeWin_) external override onlyOracle {

        Condition storage condition = conditions[conditionID_];
        require(condition.timestamp > 0, "Azuro: condition not exists");
        require(block.timestamp >= condition.timestamp, "Azuro: condition cant be resolve before timelimit");
        require(condition.outcomeWin == 0, "Condition already set");
        require(outcomeWin_ == 1 || outcomeWin_ == 2, "Outcome is Invalid");
        uint256 bettersPayout;
        condition.outcomeWin = outcomeWin_;
        if (outcomeWin_ == 1) {
            bettersPayout = condition.payouts[0];
        } else {
            bettersPayout = condition.payouts[1];
        }

        uint256 profitReserve =
            (condition.fundBank[0] + condition.fundBank[1]) - bettersPayout;
        ILP(lpAddress).addReserve(condition.reinforcement, profitReserve);
        emit ConditionResolved(conditionID_, outcomeWin_, profitReserve);
    }

    function setLP(address lpAddress_) external override onlyOwner {
        lpAddress = lpAddress_;
    }

    // for test MVP
    function setOracle(address oracle_) external onlyOwner {
        oracle = oracle_;
    }

    function viewPayout(uint256 tokenID_)
        external
        view
        override
        returns (bool success, uint256 amount)
    {
        return (_viewPayout(tokenID_));
    }

    function getCondition(uint256 id)
        external
        view
        returns (Condition memory)
    {
        return (conditions[id]);
    }

    /**
     * internal view, used resolve payout and external views
     * @param tokenID - NFT token id
     */

    function _viewPayout(uint256 tokenID)
        internal
        view
        returns (bool success, uint256 amount)
    {
        Bet storage currentBet = bets[tokenID];
        Condition storage condition = conditions[currentBet.conditionID];

        if (
            !currentBet.payed &&
            (condition.outcomeWin == 1) &&
            (currentBet.outcome == 1)
        ) {
            uint256 winAmount =
                (currentBet.odds * currentBet.amount) / decimals;
            return (true, winAmount);
        }

        if (
            !currentBet.payed &&
            (condition.outcomeWin == 2) &&
            (currentBet.outcome == 2)
        ) {
            uint256 winAmount =
                (currentBet.odds * currentBet.amount) / decimals;
            return (true, winAmount);
        }
        return (false, 0);
    }

    /**
    * @dev resolve condition from oracle
    * @param conditionID_ - id of the game
    * @param amount_ - tokens to bet
    * @param outcomeWin_ - team win outcome
    * @return odds for this bet
    */
    function calculateOdds(
        uint256 conditionID_,
        uint256 amount_,
        uint256 outcomeWin_
    ) public view returns(uint256)
    {
        uint256 odds =
        IMath(mathAddress).getOddsFromBanks(
            conditions[conditionID_].fundBank[0],
            conditions[conditionID_].fundBank[1],
                amount_,
                outcomeWin_,
            conditions[conditionID_].margin,
            decimals
        );
        return odds;
    }

    function getCurrentReinforcement() external view override returns(uint256) {
        return conditionsReinforcementFix;
    }
}
