// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is Ownable, ERC20 {
    uint256 public ethBalance;
    uint256 public price;

    receive() external payable {
        ethBalance += msg.value;
    }

    function changePrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
    }

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function getTokens() external payable {
        uint256 tokenAmount = msg.value * price;
        _mint(msg.sender, tokenAmount);
        ethBalance += msg.value;
    }

    function burn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }

    function withdraw() external onlyOwner {
        address payable payer = payable(msg.sender);
        payer.transfer((address(this).balance));
    }

    constructor() ERC20("USDT test token", "USDT") {
        price = 2000;
    }
}
