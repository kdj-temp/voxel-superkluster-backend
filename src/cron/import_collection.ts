import { createConnection } from "typeorm";
import * as cron from 'node-cron';
import { import_collection_new, import_assets } from "../cron";
import redisHandle from "../models/redis";
import { getCollectionListCount, getCollectionListPrefix } from '../config';

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

    const importCollection_rinkeby = async () => {
        const chainId = 5;
        const service_count = getCollectionListCount(chainId);
        const listPrefix = getCollectionListPrefix(chainId);
        var bImportCollection: boolean[] = new Array(service_count);
        for(let i = 0; i < service_count; i++) {
            bImportCollection[i] = false;
            cron.schedule('*/' + ((i + 1) * 2 + 1).toString() + ' * * * * *', (async () => {
                try {
                    if (bImportCollection[i]) {
                        return;
                    }
                    bImportCollection[i] = true;
                    let targetKey = listPrefix + "list_" + i.toString();
                    let isExist = await redisClient.exists(targetKey);
                    if(!isExist) {
                        bImportCollection[i] = false;
                    } else {
                        const collectionInfo:string = await redisClient.LINDEX(targetKey, 0);
                        const collectionData = collectionInfo.split("&");
                        let addr = null;
                        if(collectionData.length == 5) addr = collectionData[4];
                        await import_collection_new(parseInt(collectionData[0]), addr);
                        await redisClient.LPOP(targetKey);
                        bImportCollection[i] = false;
                    }
                } catch (e) {
                    console.error("import colelction cron server error: ", e);
                }
            }));
        }
    }

    const import_assetImage = async () => {
        var bImportAssets = false;
        cron.schedule('* * * * *', (async () => {
            if (bImportAssets) {
                return;
            }

            bImportAssets = true;
            await import_assets();
            bImportAssets = false;
        }));
    }

    importCollection_rinkeby();
    import_assetImage();

}).catch(error => console.log(error));