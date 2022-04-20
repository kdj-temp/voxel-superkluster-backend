import { ethers } from "ethers";
import { getRepository } from "typeorm";
import { User } from "../entity/User";
import { Asset } from "../entity/Asset";
import { AssetActivity } from "../entity/AssetActivity";
import { ActivityType } from "../models/enums";
import { Notify } from "../entity/Notify";
import { Bid } from "../entity/Bid";
import { Collection } from "../entity/Collection";
import { SEND_GRID, SOCKET_SERVER_URI, SK_COLLECTIONS } from "../config";
import { getAcceptMailContent } from "../utils/getMailContent";

import { getMailHandle } from "./index";

import axios from 'axios';
import { Owner } from "../entity/Owner";
import { List } from "../entity/List";
import { BuyLog } from "../entity/BuyLog";
import { updateAssetState } from "./updateAssetState";
import { Cart } from "../entity/Cart";
import { CartPayload } from "../entity/CartPayload";
import { Creator } from "../entity/Creator";

function checkInSKCollection(collection) {
    for(let i = 0; i < SK_COLLECTIONS.length; i ++) {
        if(collection.toLowerCase() == SK_COLLECTIONS[i]['contract_addr'].toLowerCase()) {
            return true;
        }
    }   

    return false;
}

export const acceptItemFunc = async (collection, seller, buyer, tokenId, quantity, mintQty, price, timestamp, event) => {
    try {
        let sgMail = getMailHandle();
        // if tx is already registered, return
        const activityRepo = getRepository(AssetActivity);
        let registered = await activityRepo.createQueryBuilder('asset_activity')
        .where("LOWER(transaction_hash) = LOWER(:txhash) and activity = 'sale'", {txhash: event.transactionHash}).getOne();

        if(registered) return;

        const assetRepo = getRepository(Asset);
        const collectionRepo = getRepository(Collection);
        const userRepository = getRepository(User);
        const cartRepo = getRepository(Cart);
        const cartPayloadRepo = getRepository(CartPayload);

        let asset: Asset;

        if(checkInSKCollection(collection)) {
            let _tokenId = tokenId.toHexString();
            //voxel contract
            asset = await assetRepo.findOne({
                where: {
                    token_id: _tokenId,
                    is_voxel: true
                }, relations: ['collection']
            });
        }
        else {
            //import contract
            let _collection = await collectionRepo.createQueryBuilder('collection')
            .where("is_voxel = false and LOWER(contract_address) = LOWER(:collection_address)", { collection_address: collection })
            .getOne();

            let _tokenId = tokenId.toString();
            asset = await assetRepo.createQueryBuilder('asset')
                .leftJoinAndSelect('asset.collection', 'collection')
                .where("collection.id = :collectionId and asset.token_id = :tokenId", 
                    { collectionId: _collection.id, tokenId: _tokenId }
                ).getOne();
        }

        if(asset) {
            let assetQuantity = quantity.toNumber();
            let mintQuantity = mintQty.toNumber();

            let is_1155 = false;
            if(asset.is_voxel) {
                if(asset.is_721)
                    is_1155 = false;
                else
                    is_1155 = true;
            }
            else {
                if(asset.collection.is_721)
                    is_1155 = false;
                if(asset.collection.is_1155)
                    is_1155 = true;
            }

            let _tempPrice = parseFloat(ethers.utils.formatEther(price));
            let _otherPrice = asset.price;

            let registered = await activityRepo.createQueryBuilder('asset_activity')
                    .where("LOWER(transaction_hash) = LOWER(:txhash) and activity = 'sale'", {txhash: event.transactionHash}).getOne();
            if(registered) return;

            if((!is_1155 && asset.status == 'pending') ||
            (is_1155 && mintQuantity > 0)) {
                asset.status = 'active';
                await assetRepo.save(asset);
                
                await activityRepo.save(activityRepo.create({
                    asset: assetRepo.create({
                        id: asset.id
                    }),
                    to: seller,
                    activity: ActivityType.Mint,
                    quantity: mintQuantity,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash,
                    is_hide: true
                }));

                if(is_1155) {
                    const creatorRepo = getRepository(Creator);       
                    const creatorRow = await creatorRepo.createQueryBuilder('creator')
                    .leftJoinAndSelect("creator.asset", "asset")
                    .where("asset.id = :id", {id: asset.id})
                    .getOne();

                    if(creatorRow) {
                        creatorRow.quantity = creatorRow.quantity - mintQuantity;
                        await creatorRepo.save(creatorRow);
                    }   
                }
            }

            // update nonce
            const user = await userRepository.createQueryBuilder('user')
            .addSelect('user.nonce')
            .where("LOWER(public_address) = LOWER(:user_address)", {user_address: seller})
            .getOne();
            
            user.nonce = user.nonce + 1;
            await userRepository.save(user);

            if(!is_1155) { // erc721
                await activityRepo.save(activityRepo.create({
                    asset: assetRepo.create({
                        id: asset.id
                    }),
                    from: seller,
                    to: buyer,
                    activity: ActivityType.Sale,
                    quantity: 1,
                    price: _otherPrice,
                    other_price: _tempPrice,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash
                }));
                
                asset.price = 0;
                asset.top_bid = 0;
                asset.sale_end_date=  0;
                asset.on_sale = false;
                asset.sale_type = 0;
                asset.owner_of = buyer;
                await assetRepo.save(asset);

                const ownerRepo = getRepository(Owner);
                let _sellerOwner = await ownerRepo.createQueryBuilder('owner')
                .leftJoinAndSelect("owner.asset", "asset")
                .where("LOWER(owner.owner_of) = LOWER(:owner_of) and asset.id = :assetId", {owner_of: seller, assetId: asset.id})
                .getOne();

                if(_sellerOwner) {
                    _sellerOwner.owner_of = buyer;
                    await ownerRepo.save(_sellerOwner);
                }
                
                // delete bids
                await getRepository(Bid).createQueryBuilder("bid")
                .where("assetId = :assetId", {assetId: asset.id})
                .delete()
                .execute();

                // delete all asset from CartPayload
                const carts = await cartRepo.createQueryBuilder('cart')
                    .where("assetId = :assetId", {assetId: asset.id})
                    .getMany();
                for(let j = 0; j < carts.length; j ++) {
                    await cartPayloadRepo.createQueryBuilder('cart_payload')
                        .where('cartId = :cartId', {cartId: carts[j].id})
                        .delete()
                        .execute();
                }
                //delete asset from cart
                await getRepository(Cart).createQueryBuilder('cart')
                .where("assetId = :assetId", {assetId: asset.id})
                .delete()
                .execute();
            }
            else { // erc1155
                await activityRepo.save(activityRepo.create({
                    asset: assetRepo.create({
                        id: asset.id
                    }),
                    from: seller,
                    to: buyer,
                    activity: ActivityType.Sale,
                    quantity: assetQuantity,
                    price: _otherPrice,
                    other_price: _tempPrice,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash
                }));

                const ownerRepo = getRepository(Owner);
                const listRepo = getRepository(List);

                // seller
                let owner_seller = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: seller})
                    .getOne();

                if(owner_seller) {
                    if(owner_seller.quantity <= assetQuantity) {
                        let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                        .where("list.ownerId = :ownerId", {ownerId: owner_seller.id})
                        .getMany();

                        for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                            await getRepository(BuyLog).createQueryBuilder("buy_log")
                            .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                            .delete()
                            .execute();
                        }

                        await getRepository(List).createQueryBuilder("list")
                        .where("list.ownerId = :ownerId", {ownerId: owner_seller.id})
                        .delete()
                        .execute();

                        await getRepository(Owner).createQueryBuilder("owner")
                        .where("owner.id = :ownerId", {ownerId: owner_seller.id})
                        .delete()
                        .execute();
                    }
                    else {
                        owner_seller.quantity = owner_seller.quantity - assetQuantity;
                        await ownerRepo.save(owner_seller);
                    }
                }

                // buyer
                let owner_buyer = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and LOWER(owner_of) = LOWER(:ownerOf)", {assetId: asset.id, ownerOf: buyer})
                    .getOne();

                if(owner_buyer) {
                    owner_buyer.quantity = owner_buyer.quantity + assetQuantity;
                    await ownerRepo.save(owner_buyer);
                } else {
                    owner_buyer = new Owner();
                    owner_buyer.asset = asset;
                    owner_buyer.owner_of = buyer;
                    owner_buyer.quantity = assetQuantity;

                    await ownerRepo.save(owner_buyer);
                }

                // remove all offers for buyer
                await getRepository(Bid).createQueryBuilder('bid')
                    .where('assetId = :assetId and bidder = :bidderAddr', {assetId: asset.id, bidderAddr: buyer})
                    .delete()
                    .execute();

                    let _removeLists = await getRepository(List).createQueryBuilder("list")
                    .where("ownerId = " + owner_seller.id.toString() + " and quantity > " + owner_seller.quantity.toString())
                    .getMany();

                    for(let i = 0; i < _removeLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _removeLists[i].id})
                        .delete()
                        .execute();
                    }

                    await getRepository(List).createQueryBuilder('list')
                    .where("ownerId = " + owner_seller.id.toString() + " and quantity > " + owner_seller.quantity.toString())
                    .delete()
                    .execute();

                if(asset.supply_number == 1) {
                    // delete all asset from CartPayload
                    const carts = await cartRepo.createQueryBuilder('cart')
                        .where("assetId = :assetId", {assetId: asset.id})
                        .getMany();
                    for(let j = 0; j < carts.length; j ++) {
                        await cartPayloadRepo.createQueryBuilder('cart_payload')
                            .where('cartId = :cartId', {cartId: carts[j].id})
                            .delete()
                            .execute();
                    }
                    //delete asset from cart
                    await getRepository(Cart).createQueryBuilder('cart')
                    .where("assetId = :assetId", {assetId: asset.id})
                    .delete()
                    .execute();
                }
            }

            // add Notify
            let notify: Notify;
            notify = new Notify();
            notify.create_date = Math.floor(Date.now() / 1000);
            notify.link = asset.id.toString();
            notify.type = 'sale';
            notify.unread = true;
            notify.user = buyer;
            notify.from = seller;
            notify.price = _tempPrice;

            const notifyRepo = getRepository(Notify);
            let _sellerInfo = await userRepository.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:seller)", {seller}).getOne();
            
            let _sellerName = '';

            if(_sellerInfo) {
                if(_sellerInfo.username == "")
                    _sellerName = seller;
                else
                    _sellerName = _sellerInfo.username;
            }
            else {
                _sellerName = seller;
            }

            notify.msg = `Your bid of ${_tempPrice} VXL (${_otherPrice} USD) on ${asset.name} was accepted by ${_sellerName}`;
        
            await notifyRepo.save(notify);

            if(_sellerInfo) {
                // get Buyer
                let _buyerInfo = await userRepository.createQueryBuilder('user')
                    .where("LOWER(public_address) = LOWER(:buyer)", {buyer}).getOne();

                if(_buyerInfo && _buyerInfo.email && _buyerInfo.email_notification) {
                    let _msgContent = getAcceptMailContent(_sellerName, _buyerInfo.username ? _buyerInfo.username : _buyerInfo.public_address, asset.name, _tempPrice, asset, _otherPrice);

                    const msg = {
                        to: _buyerInfo.email,
                        from: SEND_GRID.EMAIL,
                        subject: 'Bid accepted on SuperKluster.io',
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

                if(_buyerInfo) {
                    axios({
                        url: `${SOCKET_SERVER_URI}?userAcc=${buyer}`,
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
            await updateAssetState(asset);
        }
    }
    catch(e) { 
        console.error("AcceptItem Event Err: ", e);
    }
}