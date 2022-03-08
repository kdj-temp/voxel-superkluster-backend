import { createConnection } from "typeorm";
import * as cron from 'node-cron';
import { importAssetFromUser } from "../cron";
import redisHandle from "../models/redis";

createConnection().then(async connection => {

    let redisClient;
    try {
        await redisHandle.init();
        redisHandle.onConnect();
        redisHandle.onError();

        redisClient = redisHandle.getRedisClient();
    } catch (e) {
        console.error("redis server connection error: ", e);
    }

    const importUserAsset = async () => {
        var isProcess = false;
        cron.schedule('*/5 * * * * *', (async () => {
            try {
                if (isProcess) return;
                isProcess = true;
                let isExist = await redisClient.exists('new_user');
                if(!isExist) {
                    isProcess = false;
                } else {
                    let userAddress:string = await redisClient.LINDEX('new_user', 0);

                    // this need to fix in the later (second paramter is chain_id)
                    await importAssetFromUser(userAddress, 1);
                    
                    await redisClient.LPOP('new_user');
                    isProcess = false;
                }
            } catch (e) {
                console.error("import user asset cron server error: ", e);
            }
        }));
    }

    importUserAsset();

}).catch(error => console.log(error));