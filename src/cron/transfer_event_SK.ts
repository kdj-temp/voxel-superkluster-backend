import { createConnection } from "typeorm";
import { Collection } from "../entity/Collection";
import * as erc721Abi from './../core/abis/erc721Abi.json';
import * as erc1155Abi from './../core/abis/erc1155Abi.json';
import redisHandle from "../models/redis";
import { ethers } from "ethers";
import { getProvider, provider, SK_COLLECTIONS } from "./../config";
import { setMailApiKey } from "../utils";
import { transferItemFunc_SK } from "./../utils/transferItem";
import * as cron from 'node-cron';

createConnection().then(async connection => {
    //set redis init
    let redisClient;
    let contracts = [];
    let contractTypes = [];
    let collections = [];

    const chainId = 5;
    try {
        await redisHandle.init();
        redisHandle.onConnect();
        redisHandle.onError();

        redisClient = redisHandle.getRedisClient();

        setMailApiKey();

        for(let i = 0; i < SK_COLLECTIONS.length; i ++) {
            let collection = new Collection();
            collection.contract_address = SK_COLLECTIONS[i]['contract_addr'];
            collection.is_voxel = true;
            collection.is_721 = (SK_COLLECTIONS[i]['erc721'] == true);
            collection.is_1155 = (SK_COLLECTIONS[i]['erc721'] == false);

            collections.push(collection);

            if(collection.is_721) {
                const contract = new ethers.Contract(SK_COLLECTIONS[i]['contract_addr'], erc721Abi, getProvider(chainId));
                contractTypes.push(1);
                contracts.push(contract);
            }
            else {
                const contract = new ethers.Contract(SK_COLLECTIONS[i]['contract_addr'], erc1155Abi, getProvider(chainId));
                contractTypes.push(0);
                contracts.push(contract);
            }
        }
    } catch (e) {
        console.error("redis server connection error: ", e);
    }

    const getTransferEvent_SK = async () => {
        let latestblockNumber = await provider.getBlockNumber() - 10;

        try {
            const res = await redisClient.get('transferItemBlock_SK');
            if(res == null) {
                await redisClient.set('transferItemBlock_SK', latestblockNumber);
            } else {
                latestblockNumber = parseInt(res);
            }
        } catch (e) {
            console.error("redis server error: ", e);
        }

        var flag = false;

        cron.schedule("*/2 * * * * *", async () => {
            try {
                if(flag == false) {
                    flag = true;
                    let blockNumber = await provider.getBlockNumber();
                    if(blockNumber < latestblockNumber) latestblockNumber = blockNumber;
                    
                    for(let i = 0; i < contractTypes.length; i ++) {

                        if(contractTypes[i] == 1) {
                            const events = await contracts[i].queryFilter(
                                contracts[i].filters.Transfer(),
                                latestblockNumber,
                                blockNumber
                            );
    
                            if(events.length > 0) {
                                for (const ev of events) {
                                    await transferItemFunc_SK(collections[i], ev.args.from, ev.args.to, ev.args.tokenId, 1, ev);
                                }
                            }
                        }
                        else {
                            const events = await contracts[i].queryFilter(
                                contracts[i].filters.TransferSingle(),
                                latestblockNumber,
                                blockNumber
                            );
    
                            if(events.length > 0) {
                                for (const ev of events) {
                                    await transferItemFunc_SK(collections[i], ev.args.from, ev.args.to, ev.args.id, ev.args.value, ev);
                                }
                            }
                        }
                    }

                    latestblockNumber = blockNumber;
                    await redisClient.set('transferItemBlock', blockNumber);
                    flag = false;                    
                }
            }
            catch (e) {
                console.error("getTransferEvent_SK error: ", e);
                flag = false;
            }
        });
    }    
    
    getTransferEvent_SK();
});