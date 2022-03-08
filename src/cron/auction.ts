import { createConnection, getRepository, getConnection } from "typeorm";
import * as cron from 'node-cron';
import { Asset } from "../entity/Asset";
import { Bid } from "../entity/Bid";
import { AUCTION_CONFIG, SEND_GRID, SOCKET_SERVER_URI } from "../config";
import { User } from "../entity/User";
import { ethers } from "ethers";
import { Warning } from "../entity/Warning";
import { Notify } from "../entity/Notify";
import axios from 'axios';
import { getAuctionMailContent, getAuctionEndedMailContent } from "../utils/getMailContent";
import sgMail = require("@sendgrid/mail");

createConnection().then(async connection => { 

    //create email handler
    sgMail.setApiKey(SEND_GRID.API_KEY);

    const auctionFinish = async function () {
        try {
            let currentTime = Math.floor(Date.now() / 1000);

            let data = await getRepository(Asset).createQueryBuilder('asset')
            .where("on_sale = true and sale_type = 2 and auction_end_date + " + AUCTION_CONFIG.SEVEN + " < :currentTime", {currentTime})
            .getMany();

            data.forEach(async function(item) {
                // asset id
                let assetId = item.id;

                let _bids = await getRepository(Bid).createQueryBuilder('bid')
                            .where('bid.assetId = :assetId and bid.is_auction = 1', {assetId})
                            .getMany();

                if(_bids.length > 0) {
                    //get UserId
                    let _buyer = await getRepository(User).createQueryBuilder('user')
                                .where('user.public_address = :bidder', {bidder: _bids[0]['bidder']})
                                .getOne();

                    const userRepo = getRepository(User);

                    if(_buyer) {
                        // we have 2 case
                        let bid_amount = ethers.utils.parseEther(_bids[0]['price'].toString());
                        let _balance = ethers.BigNumber.from(_buyer['vxl_balance']);

                        const warningRepository = getRepository(Warning);

                        if(_balance.lt(bid_amount)) {
                            // add error  msg to buyer
                            let warning: Warning;
                            warning = new Warning();
                            warning.create_date = Math.floor(Date.now() / 1000);
                            warning.msg = "Bid was failed because buyer had insufficient vxl balance.";
                            warning.user = _buyer.public_address;
                            warning.link = assetId.toString();
                            warning.type = 1;
                            await warningRepository.save(warning);

                            _buyer.warning_badge = _buyer.warning_badge + 1;
                            await userRepo.save(_buyer);
                        }
                        else {
                            // add error msg to seller
                            let warning: Warning;
                            warning = new Warning();
                            warning.create_date = Math.floor(Date.now() / 1000);
                            warning.msg = "Seller didn't execute sell transaction for item.";
                            warning.user = item.owner_of;
                            warning.link = assetId.toString();
                            warning.type = 2;
                            await warningRepository.save(warning);

                            let _seller = await getRepository(User).createQueryBuilder('user')
                                .where('user.public_address = :seller', {seller: item.owner_of})
                                .getOne();

                            _seller.warning_badge = _seller.warning_badge + 1;
                            await userRepo.save(_seller);
                        }
                    }
                }

                // update asset
                await getConnection()
                    .createQueryBuilder()
                    .update(Asset)
                    .set({
                        price: 0,
                        top_bid: 0,
                        sale_end_date: 0,
                        auction_start_date: 0,
                        auction_end_date: 0,
                        on_sale: false,
                        sale_type: 0  
                    })
                    .where("id = :id", {id: assetId})
                    .execute();
                
                // delete bids
                await getRepository(Bid).createQueryBuilder("bid")
                        .where("assetId = :assetId", {assetId: assetId})
                        .delete()
                        .execute();
            });
        }
        catch(err) {
            console.error("auctionFinish Err: ", err);            
        }
    } 

    const auctionCheck = async function () {
        try {
            let currentTime = Math.floor(Date.now() / 1000);

            let data = await getRepository(Asset).createQueryBuilder('asset')
            .where("on_sale = true and sale_type = 2 and auction_end_process = false and auction_end_date < :currentTime", {currentTime})
            .getMany();

            data.forEach(async function(item) {
                // asset id
                let assetId = item.id;

                // remove bids except top bid 
                // get top bid id
                let _bids = await getRepository(Bid).createQueryBuilder('bid')
                .where('bid.assetId = :assetId', {assetId})
                .orderBy('bid.price', 'DESC')
                .getMany();

                if(_bids.length > 0) {
                    let _top_bid_id = _bids[0]['id'];

                    await getRepository(Bid).createQueryBuilder("bid")
                    .where("id != :id and assetId = :assetId", {id: _top_bid_id, assetId: assetId})
                    .delete()
                    .execute();

                    const assetRepo = getRepository(Asset);

                    let _asset = await assetRepo.findOne(assetId);
                    _asset.auction_end_process = true;
                    await assetRepo.save(_asset);

                    const notifyRepo = getRepository(Notify);
                    let notify: Notify;                    
                    notify = new Notify();
                    notify.create_date = Math.floor(Date.now() / 1000);
                    notify.link = assetId.toString();
                    notify.type = 'bid_winner';
                    notify.unread = true;
                    notify.user = _bids[0]['bidder'];
                    notify.from = _asset.owner_of;

                    notify.msg = `Congratulations, your bid on ${_asset.name} has won the auction! The seller will complete the transaction within the next seven days.`;

                    await notifyRepo.save(notify);

                    //to seller notification
                    let sellerNotify: Notify;
                    sellerNotify = new Notify();
                    sellerNotify.create_date = Math.floor(Date.now() / 1000);
                    sellerNotify.link = assetId.toString();
                    sellerNotify.type = 'auction_end';
                    sellerNotify.unread = true;
                    sellerNotify.user = _asset.owner_of;
                    sellerNotify.from = _bids[0]['bidder'];

                    sellerNotify.msg = `Your auction ${_asset.name} has officially ended. Please execute your transaction.`;

                    await notifyRepo.save(sellerNotify);

                    // get bidder
                    const userRepository = getRepository(User);
                    let _bidderInfo = await userRepository.createQueryBuilder('user')
                    .where("LOWER(public_address) = LOWER(:bidder)", {bidder: _bids[0]['bidder']}).getOne();

                    if(_bidderInfo && _bidderInfo.email && _bidderInfo.email_notification) {
                        let _msgContent = getAuctionMailContent(_bidderInfo.username?_bidderInfo.username:_bidderInfo.public_address, _asset.name, _asset);

                        const msg = {
                            to: _bidderInfo.email,
                            from: SEND_GRID.EMAIL,
                            subject: 'Your bid on SuperKluster is accepted!',
                            html: _msgContent
                        };

                        sgMail.send(msg)
                        .then(() => {}, error => {
                            console.error(error);
                            if (error.response) {
                                console.error(error.response.body)
                            }
                        });                        
                    }

                    if(_bidderInfo) {
                        axios({
                            url: `${SOCKET_SERVER_URI}?userAcc=${_bids[0]['bidder']}`,
                            method: "GET"
                        }).then(function (response) {
                            // handle success
                            console.log("handle success");
                        })
                        .catch(function (error) {
                            // handle error
                            console.log(error);
                        });
                    }

                    let _sellerInfo = await userRepository.createQueryBuilder('user')
                    .where("LOWER(public_address) = LOWER(:seller)", {seller: _asset.owner_of}).getOne();

                    if(_sellerInfo && _sellerInfo.email && _sellerInfo.email_notification) {
                        let _msgContent = getAuctionEndedMailContent(_sellerInfo.username?_sellerInfo.username:_sellerInfo.public_address, _asset.name, _asset);

                        const msg = {
                            to: _sellerInfo.email,
                            from: SEND_GRID.EMAIL,
                            subject: `Auction ${_asset.name} ended`,
                            html: _msgContent
                        };

                        sgMail.send(msg)
                        .then(() => {}, error => {
                            console.error(error);
                            if (error.response) {
                                console.error(error.response.body)
                            }
                        });
                    }

                    if(_sellerInfo) {
                        axios({
                            url: `${SOCKET_SERVER_URI}?userAcc=${_asset.owner_of}`,
                            method: "GET"
                        }).then(function (response) {
                            // handle success
                            console.log("handle success");
                        })
                        .catch(function (error) {
                            // handle error
                            console.log(error);
                        });
                    }
                }
                else {
                    await getConnection()
                    .createQueryBuilder()
                    .update(Asset)
                    .set({
                        price: 0,
                        top_bid: 0,
                        sale_end_date: 0,
                        on_sale: false,
                        sale_type: 0,
                        auction_end_process: true
                    })
                    .where("id = :id", {id: assetId})
                    .execute();
                }
            });
        }
        catch(err) {
            console.error("auctionCheck Err: ", err);            
        }
    }

    await auctionCheck();
    await auctionFinish();

    cron.schedule('* * * * *', (async () => {
        await auctionCheck();
    }))

    cron.schedule('* * * * *', (async () => {
        await auctionFinish();
    }))
})