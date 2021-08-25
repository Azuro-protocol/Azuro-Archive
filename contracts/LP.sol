// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interface/ICore.sol";
import "./interface/IAzuroBet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract LP is ERC20Upgradeable, OwnableUpgradeable {
    using SafeMath for uint256;

    uint256 public totalLiqudity;
    uint256 public lockedLiquidity; // pure reserve
    address public token;
    ICore public core;
    IAzuroBet public azuroBet;
    uint256 public bettingLiquidity; // reserve amounts + bets
    uint256 public reinforcementAbility; // should be 50%
    uint256 public oddsDecimals;
    uint public totalRewards;
    uint public totalBetsAmount;
    uint public rewardFeeOdds; // in decimals 10^9


    mapping(address => Affiliate) public affiliates;

    struct Affiliate {
        uint256 claimed;
        uint256 amount;
    }

    /**
     * @dev event NewBet created on new bet apeared
     * owner - message sender
     * betID - bet ID
     * conditionId - condition id
     * outcomeId - 1 or 2
     * amount - bet amount in payment tokens
     * odds - kef in decimals 10^9
     * fund1 - funds on 1st outcome
     * fund2 - funds on 2nd outcome
     */
    event NewBet(
        address indexed owner,
        uint256 indexed betID,
        uint256 indexed conditionId,
        uint256 outcomeId,
        uint256 amount,
        uint256 odds,
        uint256 fund1,
        uint256 fund2
    );

    event BetterWin(address better, uint256 amount);
    event LiquidityAdded(address account, uint256 amount);
    event LiquidityRemoved(address account, uint256 amount);

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "LP:EXPIRED");
        _;
    }

    modifier onlyCore() {
        require(msg.sender == address(core), "LP:onlyCore");
        _;
    }

    function changeCore(address addr) external onlyOwner {
        core = ICore(addr);
    }

    function changeRewardOdds(uint newOdds_) external onlyOwner {
        rewardFeeOdds = newOdds_;
    }

    function setAzuroBet(address addr) external onlyOwner {
        azuroBet = IAzuroBet(addr);
    }

    /**
     * init
     */

    function initialize(address token_, address azuroBetAddress)
        public
        virtual
        initializer
    {
        require(token_ != address(0), "LP:init");
        __ERC20_init("Azuro LP token", "lp-AZR");
        __Ownable_init();
        token = token_;
        azuroBet = IAzuroBet(azuroBetAddress);
        oddsDecimals = 1000000000;
        rewardFeeOdds = 40000000; // 4%
        reinforcementAbility = oddsDecimals / 2; // 50%
    }

    /**
     * add some liquidity and get LP tokens in return
     * @param amount - token's amount
     */
    function addLiquidity(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        // totalLiqudity decreased by locked Payouts by executing conditions
        _mint(
            msg.sender,
            totalSupply() == 0
                ? amount
                : (amount * totalSupply()) /
                    (totalLiqudity - core.getLockedPayout())
        );
        totalLiqudity += amount;
        emit LiquidityAdded(msg.sender, amount);
    }

    /**
     * withdraw back liquidity burning LP tokens
     * @param amountLP - LP tokens amount to burn
     */
    function withdrawLiquidity(uint256 amountLP) external {
        _burn(msg.sender, amountLP);
        uint256 withdrawValue =
            (IERC20(token).balanceOf(address(this)) * amountLP) / totalSupply();
        TransferHelper.safeTransfer(token, msg.sender, withdrawValue);
        totalLiqudity = totalLiqudity.sub(withdrawValue);

        emit LiquidityRemoved(msg.sender, withdrawValue);
    }

    function viewPayout(uint256 tokenId) external view returns (bool, uint256) {
        return (core.viewPayout(tokenId));
    }

    /**
     * @dev show on frontend amount of referral reward
     * @param affiliate_ - address of frontend
     * @return reward - amount of frontend reward fot its traffic
     */
    function pendingReward(address affiliate_) public view returns(uint256 reward) {
        Affiliate memory affiliate = affiliates[affiliate_];
        if (affiliate.amount == 0 ) return 0;
        uint toClaim = totalRewards * (affiliate.amount*oddsDecimals/totalBetsAmount) / oddsDecimals;
        reward = toClaim - affiliate.claimed;
    }

    /**
     * @dev claim frontend referral reward
     */
    function claimReward() external {
        Affiliate storage affiliate = affiliates[msg.sender];
        uint toClaim = totalRewards * (affiliate.amount * oddsDecimals / totalBetsAmount) / oddsDecimals;
        uint reward = toClaim - affiliate.claimed;
        affiliate.claimed = toClaim;
        TransferHelper.safeTransfer(token, msg.sender, reward);
    }

    function withdrawPayout(uint256 tokenId) external {
        require(azuroBet.ownerOftoken(tokenId) == msg.sender, "LP:not owner");
        (bool success, uint256 amount) = ICore(core).resolvePayout(tokenId);
        require(success, "No win no payout");
        bettingLiquidity = bettingLiquidity.sub(amount);
        TransferHelper.safeTransfer(token, msg.sender, amount);
        emit BetterWin(msg.sender, amount);
    }

    function bet(
        uint256 conditionID,
        uint256 amount,
        uint256 outcomeID,
        uint256 deadline,
        uint256 minOdds,
        address affiliate_
    ) external ensure(deadline) returns (uint256) {
        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        bettingLiquidity = bettingLiquidity.add(amount);
        (uint256 tokenId, uint256 odds, uint256 fund1, uint256 fund2) =
            ICore(core).putBet(conditionID, amount, outcomeID, minOdds);
        azuroBet.mint(msg.sender, tokenId);
        if (affiliate_ == address(0x0)) affiliate_ = address(this);
        affiliates[affiliate_].amount += amount;
        totalBetsAmount += amount;
        emit NewBet(
            msg.sender,
            tokenId,
            conditionID,
            outcomeID,
            amount,
            odds,
            fund1,
            fund2
        );
        return tokenId;
    }

    function addReserve(uint256 initReserve, uint256 profitReserve)
        external
        onlyCore
    {
        if (profitReserve >= initReserve) { // pool win
            uint profit = profitReserve - initReserve;
            uint affiliatesRewards = profit * rewardFeeOdds / oddsDecimals;
            totalLiqudity = totalLiqudity.add(profit - affiliatesRewards + pendingReward(address(this))); // and add to pool rewards from non-affiliate bets
            totalRewards += affiliatesRewards;
        } else { // pool lose
            totalLiqudity = totalLiqudity.sub(initReserve - profitReserve);
        }
        bettingLiquidity = bettingLiquidity.sub(profitReserve);
        lockedLiquidity = lockedLiquidity.sub(initReserve);
    }

    // reserve some reinforcement
    function lockReserve(uint256 amount) external onlyCore {
        lockedLiquidity = lockedLiquidity.add(amount);
        bettingLiquidity = bettingLiquidity.add(amount);
        require(lockedLiquidity < totalLiqudity);
    }

    // reserve some reinforcement
    function getReserve() external view returns (uint256 reserve) {
        return totalLiqudity;
    }

    function getPossibilityOfReinforcement(uint256 reinforcementAmount)
        external
        view
        returns (bool status)
    {
        return (lockedLiquidity + reinforcementAmount <=
            (reinforcementAbility * totalLiqudity) / oddsDecimals);
    }

    function getPossibilityOfReinforcementFromCore()
    external
    view
    returns (bool status)
    {
        uint256 reinforcementAmount = ICore(core).getCurrentReinforcement();
        return (lockedLiquidity + reinforcementAmount <=
        (reinforcementAbility * totalLiqudity) / oddsDecimals);
    }
}
