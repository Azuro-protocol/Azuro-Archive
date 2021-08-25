// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "./interface/IAzuroBet.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract AzuroBet is
    OwnableUpgradeable,
    ERC721EnumerableUpgradeable,
    IAzuroBet
{
    address public lpAddress;

    modifier OnlyLP() {
        require(msg.sender == lpAddress, "NFT:OnlyLP");
        _;
    }

    /**
     * init function after it, need to call setLP
     */

    function initialize() public virtual initializer {
        __Ownable_init();
        __ERC721_init("AzuroBet-NFT", "BET");
    }

    /**
     * @dev set lp address
     * @param lpAddress_ lp contract address
     */

    function setLP(address lpAddress_) external override onlyOwner {
        lpAddress = lpAddress_;
    }

    function burn(uint256 id) external override OnlyLP {
        super._burn(id);
    }

    function mint(address account, uint256 id) external override OnlyLP {
        super._mint(account, id);
    }

    function ownerOftoken(uint256 tokenId)
        external
        view
        override
        returns (address)
    {
        return (super.ownerOf(tokenId));
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        return "QmaEyc9HEuj4rjg3NQerqqrC5T9BfEyaC829uw3yL6aMwT";
    }
}
