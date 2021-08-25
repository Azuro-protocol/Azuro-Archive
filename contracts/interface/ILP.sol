// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

interface ILP {
    function changeCore(address addr_) external;

    function addLiquidity(uint256 _amount) external;

    function withdrawLiquidity(uint256 _amount) external;

    function viewPayout(uint256 tokenId) external view returns (bool, uint256);

    function withdrawPayout(uint256 conditionID, uint256 betID) external;

    function bet(
        uint256 conditionID_,
        uint256 amount_,
        uint256 teamID_
    ) external;

    function getReserve() external view returns (uint256);

    function lockReserve(uint256 amount) external;

    function addReserve(uint256 initReserve, uint256 profitReserve) external;

    function getPossibilityOfReinforcement(uint256 reinforcementAmount)
        external
        view
        returns (bool);

    function getLiquidity() external view returns (uint256, uint256);
}
