import { ethers, utils } from "ethers";
import { createConnection, getRepository, Raw } from "typeorm";
import { CONTRACT, morlias_config, AUCTION_CONFIG, getProvider, supportChainId } from "../config";
import { User } from "../entity/User";
import { Bid } from "../entity/Bid";
import { SaleType } from "../models/enums";
import { getVXLUsdPrice } from "../utils/getVXLPrice";
import * as cron from 'node-cron';

import axios from 'axios';

const vxlAbi = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[{"internalType":"string","name":"_name2","type":"string"}],"name":"SetVDex","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"_name1","type":"string"}],"name":"SetVNetwork","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"VDex","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"VNetwork","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"_owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"towner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"subtractedValue","type":"uint256"}],"name":"decreaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"addedValue","type":"uint256"}],"name":"increaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}];

const webSocketProvider = new ethers.providers.WebSocketProvider(morlias_config.providerUrl, morlias_config.network);
const contract = new ethers.Contract(CONTRACT.VXL_TOKEN_ADDR, vxlAbi, webSocketProvider);
import redisHandle from "../models/redis";

createConnection().then(async connection => {

    async function checkBidHistory(user_address, balance) {
        try {
            // get bid history
            let bids = await getRepository(Bid)
            .createQueryBuilder('bid')
            .leftJoinAndSelect("bid.asset", "asset")
            .where("LOWER(bidder)=LOWER(:bidder)", {bidder: user_address})
            .getMany();

            let vxltoUsdPrice = getVXLUsdPrice();

            let _balance = ethers.BigNumber.from(balance);

            bids.forEach(async function(item) {
                try {
                    if(item.asset.sale_type == SaleType.Auction
                        && item.asset.on_sale) {
                        let cur_time = Math.floor(Date.now() / 1000);

                        if(cur_time > item.asset.auction_end_date
                            && cur_time <= item.asset.auction_end_date + AUCTION_CONFIG.SEVEN) {
                        }
                        else {
                            //item.price is usd price
                            let bidVxlPrice = item.price / vxltoUsdPrice;

                            let bid_amount = utils.parseEther(bidVxlPrice.toString());
                            if(_balance.lt(bid_amount)) {
                                // remove
                                await getRepository(Bid).createQueryBuilder("bid")
                                .where("id = :id", {id: item.id})
                                .delete()
                                .execute();
                            }
                        }
                    }
                    else {
                        //item.price is usd price
                        let bidVxlPrice = item.price / vxltoUsdPrice;

                        let bid_amount = utils.parseEther(bidVxlPrice.toString());
                        if(_balance.lt(bid_amount)) {
                            // remove
                            await getRepository(Bid).createQueryBuilder("bid")
                            .where("id = :id", {id: item.id})
                            .delete()
                            .execute();
                        }
                    }
                }
                catch(ex) {
                }
            })            
        }
        catch(err) {
            console.error("checkBidHistory: ", err);
        }
    }

    const get_voxel_tracking_event = async () => {
        let redisClient;
        try {
            await redisHandle.init();
            redisHandle.onConnect();
            redisHandle.onError();

            redisClient = redisHandle.getRedisClient();
        } catch (e) {
            console.error("redis server connection error: ", e);
        }
        try {
            const provider = getProvider(supportChainId);

            var onProcess = false;
            var latestblockNumber = await provider.getBlockNumber();
            const res = await redisClient.get("vxl_tracking_block");
            if(res == null) {
                await redisClient.set("vxl_tracking_block", latestblockNumber);
            } else {
                latestblockNumber = parseInt(res);
            }

            cron.schedule("*/5 * * * * *", async () => {
                if(onProcess) return;
                onProcess = true;
                let blockNumber = await provider.getBlockNumber();
                if(latestblockNumber > blockNumber) latestblockNumber = blockNumber;
                const events = await contract.queryFilter(
                    contract.filters.Transfer(),
                    latestblockNumber,
                    blockNumber
                );

                if (events.length > 0) {
                    for (const ev of events) {
                        let from = ev.args.from;
                        let to = ev.args.to;
                        let value = ev.args.value;
                        const userRepository = getRepository(User);
                        const _from = await userRepository.findOne({
                            where: {
                                public_address: Raw(alias => `LOWER(${alias}) = '${from.toLowerCase()}'`)
                            }
                        });

                        const _to = await userRepository.findOne({
                            where: {
                                public_address: Raw(alias => `LOWER(${alias}) = '${to.toLowerCase()}'`)
                            }
                        });

                        if(_from) {
                            let url = `https://deep-index.moralis.io/api/v2/${from}/erc20?chain=goerli&token_addresses=${CONTRACT.VXL_TOKEN_ADDR}`

                            const resp = await axios({
                                url: url,
                                method: "GET",
                                headers: {
                                    "X-API-Key": morlias_config.apiKey
                                }
                            });

                            if(resp.status != 200) {
                            }
                            else {
                                _from.vxl_balance = (resp.data.length == 0 ? "0" : resp.data[0].balance);
                            }

                            await userRepository.save(_from);
                            await checkBidHistory(from, _from.vxl_balance);
                        }

                        if(_to) {
                            let url = `https://deep-index.moralis.io/api/v2/${to}/erc20?chain=goerli&token_addresses=${CONTRACT.VXL_TOKEN_ADDR}`

                            const resp = await axios({
                                url: url,
                                method: "GET",
                                headers: {
                                    "X-API-Key": morlias_config.apiKey
                                }
                            });

                            if(resp.status != 200) {
                            }
                            else {
                                _to.vxl_balance = (resp.data.length == 0 ? "0" : resp.data[0].balance);
                            }

                            await userRepository.save(_to);
                            await checkBidHistory(to, _to.vxl_balance);
                        }
                    }
                }
                latestblockNumber = blockNumber;
                await redisClient.set('vxl_tracking_block', blockNumber + 1);
                onProcess = false;
            })
        } catch (e) {
            console.error("error on vxl tracking: ", e);
        }
        
    }

    get_voxel_tracking_event();
    
})