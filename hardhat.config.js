require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-ganache");
require('@openzeppelin/hardhat-upgrades');
require('hardhat-contract-sizer');
require("solidity-coverage");
require('hardhat-docgen');


require('dotenv').config();

const ALCHEMY_API_KEY_RINKEBY = process.env.ALCHEMY_API_KEY_RINKEBY || "";
const ALCHEMY_API_KEY_KOVAN = process.env.ALCHEMY_API_KEY_KOVAN || "";
const KOVAN_PRIVATE_KEY = process.env.KOVAN_PRIVATE_KEY || "";
const RINKEBY_PRIVATE_KEY = process.env.RINKEBY_PRIVATE_KEY || "";
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const BSC_PRIVATE_KEY = process.env.BSC_PRIVATE_KEY || "";


// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const exportNetworks = {
  hardhat: {
  },
  ganache: {
    url: "http://127.0.0.1:8545",
    gasLimit: 6000000000,
    defaultBalanceEther: 10
  },
}
if (ALCHEMY_API_KEY_KOVAN != "" && KOVAN_PRIVATE_KEY != "") {
  exportNetworks["kovan"] = {
    url: `https://eth-kovan.alchemyapi.io/v2/${ALCHEMY_API_KEY_KOVAN}`,
    accounts: [`${KOVAN_PRIVATE_KEY}`]
  }
}
if (ALCHEMY_API_KEY_RINKEBY != "" && RINKEBY_PRIVATE_KEY != "") {
  exportNetworks["rinkeby"] = {
    url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_API_KEY_RINKEBY}`,
    accounts: [`${RINKEBY_PRIVATE_KEY}`]
  }
} 

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.0",
        settings: {}
      }
    ]
  },
  defaultNetwork: "hardhat",
  networks: exportNetworks,
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: ETHERSCAN_API_KEY
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },

  docgen: {
    path: './docs',
    clear: true,
    runOnCompile: true,
  }
};

