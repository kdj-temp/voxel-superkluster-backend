import { createConnection } from "typeorm";
import { getProvider } from "../config";
import * as cron from 'node-cron';
import { importTransferEvent_SK } from "../cron";

import redisHandle from "../models/redis";


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

    const getTransferEvent_SK = async () => {
        const chainId = 5;
        const provider = getProvider(chainId);
        var latestblockNumber = 0;
        var blockKey = "tarnsferEventBlock_SK";
        try {
            var onEvent = false;
            var latestblockNumber = await provider.getBlockNumber() - 10;
            const res = await redisClient.get(blockKey);
            if(res == null) {
                await redisClient.set(blockKey, latestblockNumber);
            } else {
                latestblockNumber = parseInt(res);
            }
            cron.schedule("* * * * * *", async () => {
                try {
                    if(onEvent == false) {
                        onEvent = true;
                        let blockNumber = await provider.getBlockNumber();
                        await importTransferEvent_SK(latestblockNumber, blockNumber, chainId);
                        await redisClient.set(blockKey, blockNumber);
                        latestblockNumber = blockNumber;
                        onEvent = false;
                    } 
                } catch (e) {
                    console.log('SK transfer event cron server error: ', e);
                }
            });
        } catch (e) {
            console.error("SK transfer cron server error: ", e);
        }
    }

    getTransferEvent_SK();
});
