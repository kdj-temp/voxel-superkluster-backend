import { createConnection, getRepository } from "typeorm";
import { Collection } from "../entity/Collection";
import * as erc721Abi from './../core/abis/erc721Abi.json';
import * as erc1155Abi from './../core/abis/erc1155Abi.json';
import redisHandle from "../models/redis";
import { ethers } from "ethers";
import { getProvider, provider } from "./../config";
import { setMailApiKey } from "../utils";
import { transferItemFunc } from "./../utils/transferItem";
import * as cron from 'node-cron';

createConnection().then(async connection => {
    //set redis init
    let redisClient;
    let contracts = [];
    let contractTypes = [];
    let contractAddresses = [];
    let collections = [];
    const chainId = 5;

    try {
        await redisHandle.init();
        redisHandle.onConnect();
        redisHandle.onError();

        redisClient = redisHandle.getRedisClient();


        const collectionRepo = getRepository(Collection);

        collections = await collectionRepo.createQueryBuilder('collection')
        .where('collection.chain_id = :id and is_voxel = 0', {id:chainId})
        .getMany();


        for(let i = 0; i < collections.length; i ++) {
            let collection = collections[i];
            let address = collection.contract_address;
            let is_721 = collection.is_721;

            if(is_721) {
                const contract = new ethers.Contract(address, erc721Abi, getProvider(chainId));
                contractTypes.push(1);
                contracts.push(contract);
                contractAddresses.push(address);
            }
            else {
                const contract = new ethers.Contract(address, erc1155Abi, getProvider(chainId));
                contractTypes.push(0);
                contracts.push(contract);
                contractAddresses.push(address);
            }
        }

        setMailApiKey();
    } catch (e) {
        console.error("transfer_event error: ", e);
    }

    const getTransferEvent = async () => {
        let latestblockNumber = 8075562;

        var flag = false;

        cron.schedule("*/2 * * * * *", async () => {
            try {
                if( (await redisClient.exists("new_collection")) ) {

                    const colRepo = getRepository(Collection);

                    collections = await colRepo.createQueryBuilder('collection')
                    .where('collection.chain_id = :id and is_voxel = 0', {id:chainId})
                    .getMany();

                    for(let i = 0; i < collections.length; i ++) {
                        if(contractAddresses.indexOf(collections[i].contract_address) < 0) {
                            if(collections[i].is_721) {
                                const contract = new ethers.Contract(collections[i].contract_address, erc721Abi, getProvider(chainId));
                                contractTypes.push(1);
                                contracts.push(contract);
                                contractAddresses.push(collections[i].contract_address);
                            }
                            else {
                                const contract = new ethers.Contract(collections[i].contract_address, erc1155Abi, getProvider(chainId));
                                contractTypes.push(0);
                                contracts.push(contract);
                                contractAddresses.push(collections[i].contract_address);
                            }
                        }
                    }                    
                    
                    await redisClient.del("new_collection");
                    return;
                }

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
                                    await transferItemFunc(collections[i], ev.args.from, ev.args.to, ev.args.tokenId, 1, ev);
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
                                    await transferItemFunc(collections[i], ev.args.from, ev.args.to, ev.args.id, ev.args.value, ev);
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
                console.error("getTransferEvent event error: ", e);
                flag = false;
            }
        });        
    }    

    getTransferEvent();
});