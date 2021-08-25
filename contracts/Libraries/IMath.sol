// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

interface IMath {
    function getOddsFromBanks(
        uint256 fund1Bank_,
        uint256 fund2Bank_,
        uint256 amount_,
        uint256 team_,
        uint256 marginality_,
        uint256 decimals_
    ) external pure returns (uint256);

    function ceil(
        uint256 a,
        uint256 m,
        uint256 decimals
    ) external pure returns (uint256);

    function sqrt(uint256 x) external pure returns (uint256);

    function addMargin(
        uint256 odds,
        uint256 marginality,
        uint256 decimals
    ) external pure returns (uint256);
}
