// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

interface IAzuroBet {
    function setLP(address lpAddress_) external;

    function burn(uint256 id) external;

    function mint(address account, uint256 id) external;

    function ownerOftoken(uint256 tokenId) external view returns (address);
}
