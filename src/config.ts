import { ethers } from "ethers";

export const supportChainId = 4;
const RPCS = {
    4: "https://eth-goerli.g.alchemy.com/v2/VmUYTX6cCOriZUksvlrrHpaxQPivUyBE",
    5: "https://eth-goerli.g.alchemy.com/v2/VmUYTX6cCOriZUksvlrrHpaxQPivUyBE",
    250: "https://rough-dark-violet.fantom.quiknode.pro/c98cc970e3148d509e4b106b5e2e1860f019b838/",
    4002: "https://rpc.testnet.fantom.network",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    43113: "https://api.avax-test.network/ext/bc/C/rpc",
}
const providers = {
    1: new ethers.providers.JsonRpcProvider(RPCS[4]),
    4: new ethers.providers.JsonRpcProvider(RPCS[4]),
    5: new ethers.providers.JsonRpcProvider(RPCS[5]),
    250: new ethers.providers.JsonRpcProvider(RPCS[250]),
    4002: new ethers.providers.JsonRpcProvider(RPCS[4002]),
    43114: new ethers.providers.JsonRpcProvider(RPCS[43114]),
    43113: new ethers.providers.JsonRpcProvider(RPCS[43113])
}
export const provider = providers[supportChainId];
export const getProvider = (chainID: number) => {
    return providers[chainID];
}
const ETH_CHAIN = [1, 2, 3, 4, 5];
const BSC_CHAIN = [56, 97];
const AVAX_CHAIN = [43114, 43113];
const FTM_CHAIN = [250, 4002];
const ARB_CHAIN = [42161, 421611];
const POL_CHAIN = [137, 80001];

export const chainFilterKey = {
    '1': ETH_CHAIN,
    '2': POL_CHAIN,
    '3': ARB_CHAIN,
    '4': BSC_CHAIN,
    '5': FTM_CHAIN,
    '6': AVAX_CHAIN
};

export const SK_COLLECTIONS = [
    {
        "contract_addr": '0x330d51f619F2BEEa09Fd6996c1a0b6dA9A9BF0D0',
        "erc721": true,
        "current_use": true
    },
    {
        "contract_addr": '0x2956bF379DFB40DB219772BD7aE8727D201a1876',
        "erc721": false,
        "current_use": true
    }
];

export const MULTI_CHAIN = {
    'chainIds': [1, 2, 3, 4, 5, 56, 97, 43114, 43113, 250, 4002, 42161, 421611, 137, 80001]
};

/**
 * JWT config.
 */
export const jwt_config = {
    algorithms: ['HS256'],
    secret: 'TIAHX7DyZNeMQmr4'
};

export const morlias_config = {
    serverUrl: 'https://iwsmtvg6erwl.usemoralis.com:2053/server',
    appId: 'JbYcOtXWU0v6lyZZgbgmcpRSsaV1sMEm9ETnSz9m',
    masterKey: 'epjslpQWSl7IfLDkBm1v1rIHLYIz4zFtOMIWUapi',
    // apiKey: "iMtxzUcYaFbnsCqR40WZLmCP3NLwKezDa549OW2KChVQJKdYWwL8AP1TM5oGfUy4",
    apiKey: "MsMPBQgzy7nZ1KwKV3ECT0YLPpJJnjM0grsUGfqRfGdwW9wWN4GrZaX34Ae2fcp4",
    network: "goerli",
    providerUrl: "wss://eth-goerli.g.alchemy.com/v2/VmUYTX6cCOriZUksvlrrHpaxQPivUyBE",
    xApiKey: "MsMPBQgzy7nZ1KwKV3ECT0YLPpJJnjM0grsUGfqRfGdwW9wWN4GrZaX34Ae2fcp4"
};

export const pinata_config = {
    apiKey: "33c52f50f2cc036ddf9f",
    apiSecret: "72f52478c2411efe538b643d00217dde0758ff1f873beda3ee6b38ba3b1d8817",
    accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmZGNjNzNmNi0xMTMwLTQ4ZDYtYTA4OC05Mjk1NjdhOTFmZjciLCJlbWFpbCI6ImluZm9Adm94ZWx4bmV0d29yay5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJpZCI6IkZSQTEiLCJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MX1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlfSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiMzNjNTJmNTBmMmNjMDM2ZGRmOWYiLCJzY29wZWRLZXlTZWNyZXQiOiI3MmY1MjQ3OGMyNDExZWZlNTM4YjY0M2QwMDIxN2RkZTA3NThmZjFmODczYmVkYTNlZTZiMzhiYTNiMWQ4ODE3IiwiaWF0IjoxNjQ1MDkwMjg3fQ.rJEHNXqEbDDVHfcAb-YF2rhghJQYsjeD6qRgN5xHcgk",
}

export const FRONTEND_URL = 'https://testnet.superkluster.io';

//ethereum mainnet
export const VOXELX_CONTRACT_ADDR = '0x16CC8367055aE7e9157DBcB9d86Fd6CE82522b31';
export const VOXELX_EXCHANGE_ADDR = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
export const WETH_ADDR = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
//
export const ETHERSCAN_API_KEY = 'D2I9Y535K31QTD6RG3FAY7DMZ833S8CBHM';
export const CONTRACT = {
    'MARKETPLACE_CONTRACT_ADDR': '0x04ee3A27D77AB9920e87dDc0A87e90144F6a278C',
    'VXL_TOKEN_ADDR': '0x69a0C61Df0ea2d481696D337A09A3e2421a06051'
};

/*
export const AUCTION_CONFIG = {
    'SEVEN': 604800,
    'FIVE': 432000
};
*/

export const AUCTION_CONFIG = {
    'SEVEN': 240,
    'FIVE': 120
};

export const BAN_PERIOD = [
    604800, // 7days
    2592000,  // 30 days
    7776000, // 90 days
    31536000 // 365 days - 1 year
];

export const SEND_GRID = {
    'API_KEY': 'SG.RCuc0K8aRsSyr_FqBLZDQQ.7_72bMF2_DLmL7WCC4sRNFBrLXL9mo_0hs_SeIEGsF4',
    'EMAIL': 'noreply@superkluster.io'
}

export const SOCKET_SERVER_URI = 'http://3.210.66.71:5001/Socket_Api';

export const REDIS_HOST = 'redis://127.0.0.1:6379';

export const REDIS_CONFIG = {
    HOST: 'redis://127.0.0.1:6379',
    TXN_DB: 1,
    BLOCKNUMBER_DB: 2
};

const apiEndpoint = {
    1: 'api.etherscan.io',
    3: 'api-ropsten.etherscan.io',
    4: 'api-rinkeby.etherscan.io',
    5: 'api-goerli.etherscan.io',
    42: 'api-kovan.etherscan.io',
    137: 'api.polygonscan.com',
    42161: 'api.arbiscan.io',
    56: 'api.bscscan.com',
    250: 'api.ftmscan.com',
    43114: 'api.snowtrace.io'
    // add more api endpoints
};

export const getApiEndpoint = (chainId: number) => {
    return apiEndpoint[chainId];
}

const ETH_API_KEY = [
    'D2I9Y535K31QTD6RG3FAY7DMZ833S8CBHM', 
    '4X4I6JZFUP374PTJ64YQFFY2YC2NIM6KAM', 
    'NPIT4183DK8BMGVZDT9C4R14S1QMEHIT88',
    'GEHZ6CAF7Y6V37RMTSBH6VZDABHMG9US3Y',
    'DFW8T8JBHWYRSPQ2GISV32AF56PFSQ38QN',
    'RPHB7P8CR6638GGPMNJUKFNHPHKZVBRJTM',
    'V84NZCN1RP2CWHPG3NFQYMDA1JVKUQU2RP',
    'XXM6AJJRUW9C39MSF8PIMECJ5VVT69KZBV',
    'JM29Z7F584HRR1XRTGSSF69H54AMZZIIFW',
    '7997XK6H87ZQXGINE9R1V2ZS3UAIH9PGA3',
    '1YKCI829TYZPV63HVJ52GYVRIJI8M9HN8S',
    'SSGM7NK5UC5UWKZA82T4IRUW1GPE9XEEPS',
    'S94FKCH4YPVDU2GRGTTDU22WUZQTMIGBG5'
];

const BSC_API_KEY = [''];
const AVAX_API_KEY = [''];
const FTM_API_KEY = [''];
const ARB_API_KEY = [''];
const POL_API_KEY = [''];

export const getApiKey = (chainId: number) => {
    if(chainId in ETH_CHAIN) return ETH_API_KEY;
    if(chainId in BSC_CHAIN) return BSC_API_KEY;
    if(chainId in AVAX_CHAIN) return AVAX_API_KEY;
    if(chainId in FTM_CHAIN) return FTM_API_KEY;
    if(chainId in ARB_CHAIN) return ARB_API_KEY;
    if(chainId in POL_CHAIN) return POL_API_KEY;
    // add more api keys...
    return "";
}

export const ROYALTY_FEE_CAP = 25;
export const ETH_CHAIN_ID = 5;
export const collectionsPerService = 150;   // collection count per cron service when 
export const bunnyVerseCollectionId = 31;

export const signerKey = '0xcd6d86b3c0d01a494cd7a96cac17b411569ca56becc4a2859d96f7b2b8abb665';

export const getCollectionListPrefix = (chainId: number) => {
    if(chainId == 4) return "rinkeby_";
    if(chainId == 5) return "goerli_";
    if(chainId == 1) return "ethereum_";
    return "_";
}

export const getCollectionListCount = (chainId: number) => {
    if(chainId == 4 || chainId == 5) return 5;
    return 0;
}