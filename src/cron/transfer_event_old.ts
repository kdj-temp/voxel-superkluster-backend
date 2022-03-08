import { createConnection } from "typeorm";
import { getCollectionListCount, getCollectionListPrefix, getProvider } from "../config";
import * as cron from 'node-cron';
import { importTransferEvent } from "../cron";

import redisHandle from "../models/redis";
import { setMailApiKey } from "../utils"

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

createConnection().then(async connection => {
    //set redis init
    let redisClient;
    try {
        await redisHandle.init();
        redisHandle.onConnect();
        redisHandle.onError();

        redisClient = redisHandle.getRedisClient();
    } catch (e) {
        console.error("redis server connection error: ", e);
    }

    setMailApiKey();

    const getTransferEvent = async () => {
        const chainId = 5;
        const listCount = getCollectionListCount(chainId);
        const listPrefix = getCollectionListPrefix(chainId);
        const provider = getProvider(chainId);
        var onEvent: boolean[] = new Array(listCount);
        var latestblockNumber: number[] = new Array(listCount);
        var blockKey: string[] = new Array(listCount);

        for(let id = 0; id < listCount; id ++) {
            if(id) await sleep(1000);

            try {
                onEvent[id] = false;
                latestblockNumber[id] = await provider.getBlockNumber() - 10;
                blockKey[id] = listPrefix + "tarnsferEventBlock_" + id.toString();
                const res = await redisClient.get(blockKey[id]);
                if(res == null) {
                    await redisClient.set(blockKey[id], latestblockNumber[id]);
                } else {
                    latestblockNumber[id] = parseInt(res);
                }
                cron.schedule("* * * * * *", async () => {

                    try {
                        if(onEvent[id] == false) {
                            onEvent[id] = true;
                            let blockNumber = await provider.getBlockNumber();
                            await importTransferEvent(id, latestblockNumber[id], blockNumber, chainId);
                            await redisClient.set(blockKey[id], blockNumber);
                            latestblockNumber[id] = blockNumber;
                            onEvent[id] = false;
                        } 
                    } catch (e) {
                        console.log('transfer event cron server error: ', e);
                    }
                });
            } catch (e) {
                console.error("rinkeby transfer cron server error: ", e);
            }
        }
    }

    getTransferEvent();
});
