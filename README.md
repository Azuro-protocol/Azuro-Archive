# Azuro-v1

## Compile

```
npm compile
```

## Test

```
npm test
```

## make .env

fill up networks keys you are going to use:
- **ALCHEMY_API_KEY_RINKEBY=** for node connection
- **ALCHEMY_API_KEY_KOVAN=** for node connection
- **KOVAN_PRIVATE_KEY=**
- **RINKEBY_PRIVATE_KEY=**
- **MAINNET_PRIVATE_KEY=**
- **BSC_PRIVATE_KEY=**
- **ETHERSCAN_API_KEY=** for contract verification

## testnet deploy

run script `deploy-rinkeby`
returned result will contain smartcontract addresses:
- **usdt deployed to** - usdt mock token address
- **Math deployed to** - Math library address
- **azurobet deployed to** - azurobet - (nft) token address
- **lp deployed to** - lp smartcontract address
- **core deployed to** - core smartcontract address


# Rinkeby latest addresses:
```
CORE: 0x95e2aD6e0BC5bfB8964D144ab049CD8042D88aC2

LP: 0x3048A40032B8dd36E1de58acD6A5b03d338EB505

AZURO_BET: 0x5D963BFD5e25233F29c899fa7AB0952b2608e9aA

TEST_USDT: 0x71BAe6022b61fA06DACfB6cc099f68C62D852c8A

MATH: 0xA3141ACCaF1666EFf57dccd105CfE30Ff593Eb1B
```

## Docs

https://htmlpreview.github.io/?https://github.com/Azuro-protocol/Azuro-V1/master/docs/index.html#/
