import { ethers } from "ethers";
import { createConnection } from "typeorm";
import { setVXLUsdPrice } from "../utils/getVXLPrice";
import { setETHUsdPrice } from "../utils/getETHPrice";
import { CONTRACT, provider } from "../config";
import * as marketplaceAbi from '../core/abis/abi.json';
import * as cron from 'node-cron';

import { buyItemFunc } from "./../utils/buyItem";
import { acceptItemFunc } from "./../utils/acceptItem";
import { buyCartFunc } from "../utils/buyCart";

import redisHandle from "../models/redis";
import { setMailApiKey } from "../utils";

const contract = new ethers.Contract(CONTRACT.MARKETPLACE_CONTRACT_ADDR, marketplaceAbi, provider);

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
     
    setMailApiKey();
    
    await setVXLUsdPrice();
    await setETHUsdPrice();

    const getBuyItemEvent = async () => {
        let latestblockNumber = await provider.getBlockNumber() - 10;

        try {
            const res = await redisClient.get('buyItemBlock');
            if(res == null) {
                await redisClient.set('buyItemBlock', latestblockNumber);
            } else {
                latestblockNumber = parseInt(res);
            }
        } catch (e) {
            console.error("redis server error: ", e);
        }

        var flag = false;
        cron.schedule("* * * * * *", async () => {
            try {
                if(flag == false) {
                    flag = true;
                    let blockNumber = await provider.getBlockNumber();
                    if(blockNumber < latestblockNumber) latestblockNumber = blockNumber;
                    const events = await contract.queryFilter(
                        contract.filters.BuyItem(),
                        latestblockNumber,
                        blockNumber
                    )

                    if (events.length > 0) {
                        for (const ev of events) {
                            let key = 'buy_' + ev.transactionHash.toLowerCase();

                            if( (await redisClient.exists(key)) ) {
                                continue;
                            }
                            else {
                                await redisClient.set(key, 'true');
                            }

                            var collection = ev.args.collection;
                            var buyer = ev.args.buyer;
                            var seller = ev.args.seller;
                            var tokenId = ev.args.tokenId;
                            var quantity = ev.args.quantity;
                            var mintQty = ev.args.mintQty;
                            var price = ev.args.price;
                            var currency = ev.args.currency;
                            var timestamp = ev.args.timestamp;

                            await buyItemFunc(collection, buyer, seller, tokenId, quantity, mintQty, price, currency, timestamp, ev);
                            await redisClient.del(key);
                        }
                    }
                    latestblockNumber = blockNumber;
                    await redisClient.set('buyItemBlock', blockNumber);
                    flag = false;
                }
            } catch (e) {
                console.error("BuyItem event error: ", e);
                flag = false;
            }
        });
    }

    const getAcceptItemEvent = async () => {
        let latestblockNumber = await provider.getBlockNumber() - 10;
        
        try {
            const res = await redisClient.get('acceptItemBlock');
            if(res == null) {
                await redisClient.set('acceptItemBlock', latestblockNumber);
            } else {
                latestblockNumber = parseInt(res);
            }
        } catch (e) {
            console.error("redis server error: ", e);
        }

        var flag = false;
        cron.schedule("* * * * * *", async () => {
            try {
                if(flag == false) {
                    flag = true;
                    let blockNumber = await provider.getBlockNumber();
                    if(blockNumber < latestblockNumber) latestblockNumber = blockNumber;
                    const events = await contract.queryFilter(
                        contract.filters.AcceptItem(),
                        latestblockNumber,
                        blockNumber
                    )
                    if (events.length > 0) {
                        for (const ev of events) {
                            let key = 'accept_' + ev.transactionHash.toLowerCase();
                            let res = await redisClient.exists(key);
                            if(res === 1) {
                                continue;
                            } else {
                                await redisClient.set(key, 'true');
                            }
                            var collection = ev.args.collection;
                            var buyer = ev.args.buyer;
                            var seller = ev.args.seller;
                            var tokenId = ev.args.tokenId;
                            var quantity = ev.args.quantity;
                            var mintQty = ev.args.mintQty;
                            var price = ev.args.price;
                            var timestamp = ev.args.timestamp;
                            await acceptItemFunc(collection, seller, buyer, tokenId, quantity, mintQty, price, timestamp, ev);
                            await redisClient.del(key);
                        }
                    }
                    latestblockNumber = blockNumber;
                    await redisClient.set('acceptItemBlock', blockNumber + 1);
                    flag = false;
                }
            } catch (e) {
                console.error("AcceptItem Event error: ", e);
                flag = false;
            }
        })
    }

    const getBuyCartEvent = async () => {
        var latestblockNumber = await provider.getBlockNumber() - 10;
        try {
            const res = await redisClient.get('buyCartBlock');
            if(res == null) {
                await redisClient.set('buyCartBlock', latestblockNumber);
            } else {
                latestblockNumber = parseInt(res);
            }
        } catch (e) {
            console.error("redis server error: ", e);
        }
        var flag = false;

        cron.schedule("* * * * * *", async () => {
            try {
                if(flag == true) return;
                flag = true;
                let blockNumber = await provider.getBlockNumber();
                if(blockNumber < latestblockNumber) latestblockNumber = blockNumber;

                const events = await contract.queryFilter(
                    contract.filters.BuyCart(),
                    latestblockNumber,
                    blockNumber
                )
                if(events.length > 0) {
                    for (const ev of events) {
                        let key = 'cart_' + ev.transactionHash.toLowerCase();
                        if( (await redisClient.exists(key)) ) continue;
                        else await redisClient.set(key, 'true');

                        var buyer = ev.args.buyer;
                        var payload = ev.args.payload;
                        var currency = ev.args.currency;
                        var timestamp = ev.args.timestamp;

                        await buyCartFunc(buyer, payload, currency, timestamp, ev);

                        await redisClient.del(key);
                    }
                }
                latestblockNumber = blockNumber;
                await redisClient.set('buyCartBlock', blockNumber);
                flag = false;

            } catch (e) {
                console.error("BuyCart Event error:", e);
                flag = false;
            }
        })
    }

    getBuyItemEvent();
    getAcceptItemEvent();
    getBuyCartEvent();
});