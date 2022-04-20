import { ethers } from "ethers";
import { getRepository, getConnection } from "typeorm";
import { Asset } from "../entity/Asset";
import { AssetActivity } from "../entity/AssetActivity";
import { ActivityType } from "../models/enums";
import { Bid } from "../entity/Bid";
import { Collection } from "../entity/Collection";
import { CONTRACT, morlias_config, provider, SEND_GRID, SOCKET_SERVER_URI } from "../config";
import * as marketplaceAbi from '../core/abis/abi.json';
import axios from 'axios';
import { Trait } from "../entity/Trait";
import { getAddress } from "ethers/lib/utils";
import { Owner } from "../entity/Owner";
import { Creator } from "../entity/Creator";
import { List } from "../entity/List";
import { BuyLog } from "../entity/BuyLog";
import { AssetFavourite } from "../entity/AssetFavourite";
import { AssetView } from "../entity/AssetView";
import { Texture } from "../entity/Texture";
import { Cart } from "../entity/Cart";
import redisHandle from "./../models/redis"
import { CartPayload } from "../entity/CartPayload";
import { Report } from "../entity/Report";
import { getTransferMailContent } from "../utils/getMailContent";
import { getMailHandle } from "./index";
import { User } from "../entity/User";
import { Notify } from "../entity/Notify";
import { AssetTrait } from "../entity/AssetTrait";
import { CollectionTrait } from "../entity/CollectionTrait";

const contract = new ethers.Contract(CONTRACT.MARKETPLACE_CONTRACT_ADDR, marketplaceAbi, provider);

let redisClient;

const setRedis = async() => {
    try {
        await redisHandle.init();
        redisHandle.onConnect();
        redisHandle.onError();
        redisClient = redisHandle.getRedisClient();
    }
    catch (e) {
        console.error("redis server connection error: ", e);
    }
}
setRedis();

const parseMetadata = async function (asset: Asset, metadata: any, collectionId) {
    try {
        if (!metadata) {
            return asset;
        }

        if (metadata['name']) {
            asset.name = metadata['name'];
        }

        if (metadata['description']) {
            asset.description = metadata['description'];
        }

        if (metadata['image']
            || metadata['image_url']) {
            if(metadata['image']) {
                if(metadata['image'].length < 255) asset.raw_image = metadata['image'];
                else asset.blob_raw_image = metadata['image'];
            }
            if(metadata['image_url']) {
                if(metadata['image_url'].length < 255) asset.raw_image = metadata['image_url'];
                else asset.blob_raw_image = metadata['image_url'];
            }
        }
        if (metadata['animation']
            || metadata['animation_url']) {
            asset.raw_animation = metadata['animation'] || metadata['animation_url'];
        }

        const colRepository = getRepository(Collection);

        let _collection = await colRepository.findOne(collectionId);

        if (metadata['attributes']) {
            let assetTraits = new Array<AssetTrait>();

            const collectionTraitRepo = getRepository(CollectionTrait);
            const attributes = metadata['attributes'];
            
            for (const attribute of attributes) {
                let display_type = 'text';

                if(attribute.hasOwnProperty('display_type')) {
                    display_type = attribute['display_type'];
                }
                
                let trait_variable = attribute['trait_type'];

                let _traitObj = await collectionTraitRepo.createQueryBuilder('collection_trait')
                    .where("trait_type = :variable", {variable: trait_variable})
                    .andWhere("display_type = :display_type", {display_type: display_type})
                    .andWhere("collectionId = :collectionId", {collectionId: collectionId})
                    .getOne();
                    
                if(!_traitObj) {
                    _traitObj = new CollectionTrait();
                    _traitObj.collection = _collection;
                    _traitObj.trait_type = trait_variable;
                    _traitObj.display_type = display_type;

                    _traitObj = await collectionTraitRepo.save(_traitObj);
                }

                let assetTrait = new AssetTrait();
                assetTrait.collectionTrait = _traitObj;
                
                if(display_type == 'text')
                    assetTrait.value = attribute['value'];
                else {
                    if(isNaN(parseFloat(attribute['value']))) {
                        assetTrait.value = attribute['value'];
                    }
                    else {
                        assetTrait.number_value = attribute['value'];
                    }

                    if(attribute.hasOwnProperty('max_value')) {
                        if(!isNaN(parseFloat(attribute['max_value']))) {
                            assetTrait.max_value = attribute['max_value'];
                        }
                    }
                }
                
                assetTraits.push(assetTrait);
            }

            asset.assetTraits = assetTraits;
        }

        return asset;
    }
    catch(err) {
        console.error("parseMetadata: ", err);
        return null;
    }
}

const checkMarketPlaceAction = async(event) => {
    try {
        const block = event.blockNumber;
        const hash = event.transactionHash;
    
        let events = await contract.queryFilter(
            contract.filters.BuyItem(),
            block,
            block
        )
    
        if(events.length > 0) {
            for(const ev of events) {
                if(ev.transactionHash == hash) return true;
            }
        }
    
        events = await contract.queryFilter(
            contract.filters.AcceptItem(),
            block,
            block
        )
    
        if(events.length > 0) {
            for(const ev of events) {
                if(ev.transactionHash == hash) return true;
            }
        }

        events = await contract.queryFilter(
            contract.filters.BuyCart(),
            block,
            block
        )

        if(events.length > 0) {
            for(const ev of events) {
                if(ev.transactionHash == hash) return true;
            }
        }
    
        return false;
    } catch (e) {
        console.error("check marketplace action error: ", e);
        return true;
    }
}

export const transferItemFunc_SK = async(collection: Collection, from, to, tokenId, quantity, event) => {

    const res = await checkMarketPlaceAction(event);
    if(res) return;

    quantity = parseInt(quantity.toString());

    const userRepo = getRepository(User);
    let sgMail = getMailHandle();

    try {
        if(!collection) return;

        const zeroAddr = getAddress('0x0000000000000000000000000000000000000000');
        const assetRepository = getRepository(Asset);
        const activityRepo = getRepository(AssetActivity);
        const collectionRepo = getRepository(Collection);
        const ownerRepo = getRepository(Owner);

        let _tokenId = tokenId.toString();
        let is_voxel = collection.is_voxel;

        if(is_voxel) {
            _tokenId = tokenId.toHexString();
        }

        let asset: Asset;

        if(collection.id) {
            asset = await assetRepository.createQueryBuilder('asset')
            .where('asset.collectionId = :collectionId and token_id = :tokenId and is_voxel = :isVoxel', {collectionId: collection.id, tokenId: _tokenId, isVoxel: is_voxel})
            .getOne();
        }
        else {
            asset = await assetRepository.createQueryBuilder('asset')
            .where('token_id = :tokenId and is_voxel = :isVoxel', {tokenId: _tokenId, isVoxel: is_voxel})
            .getOne();
        }

        if(!asset) {
            return;
        }

        let key = event.transactionHash.toLowerCase() + '_sk_' + (asset? asset.id.toString():'1000');        

        if((await redisClient.exists(key))) {
            return;
        }
        else {
            await redisClient.set(key, 'true');
        }

        let registered = await activityRepo.createQueryBuilder('asset_activity')
            .where("LOWER(transaction_hash) = LOWER(:txhash)", {txhash: event.transactionHash})
            .andWhere("asset_activity.assetId = :assetId", {assetId: asset.id})
            .getOne();
        
        if(registered) {
            return;
        }

        let is_721 = true;
        if(asset.is_voxel) {
            if(asset.is_721)
                is_721 = true;
            else
                is_721 = false;
        }
        else {
            if(collection.is_721)
                is_721 = true;
            if(collection.is_1155)
                is_721 = false;
        }

        if(is_721) {
            // transfer
            if(from != zeroAddr && asset && to != zeroAddr) {

                asset.owner_of = getAddress(to);
                asset.price = 0;
                asset.top_bid = 0;
                asset.sale_end_date = 0;
                asset.sale_type = 0;
                asset.on_sale = false;
                await assetRepository.save(asset);

                await getConnection()
                .createQueryBuilder()
                .update(Owner)
                .set({
                    owner_of: getAddress(to)
                })
                .where("assetId = :assetId", {assetId: asset.id})
                .execute();

                await activityRepo.save(activityRepo.create({
                    asset: assetRepository.create({
                        id: asset.id
                    }),
                    from: getAddress(from),
                    to: getAddress(to),
                    activity: ActivityType.Transfer,
                    quantity: 1,
                    price: 0,
                    other_price: 0,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash
                }));

                //delete asset from cart
                await getRepository(Cart).createQueryBuilder('cart')
                .where("assetId = :assetId", {assetId: asset.id})
                .delete()
                .execute();

                // add Notify
                let notify: Notify;
                notify = new Notify();
                notify.create_date = Math.floor(Date.now() / 1000);
                notify.link = asset.id.toString();
                notify.type = 'transfer';
                notify.unread = true;
                notify.user = to;
                notify.from = from;
                notify.price = 0;
                const notifyRepo = getRepository(Notify);

                let _sender = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:from)", {from}).getOne();
                let _receiver = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:to)", {to}).getOne();

                notify.msg = `${_sender ? _sender.username : from} just send you the NFT (${asset.name}) on SuperKluster!`;
                await notifyRepo.save(notify);
                
                if(_receiver) {
                    if(_receiver.email && _receiver.email_notification) {
                        let _msgContent = getTransferMailContent(_sender ? _sender.username : from, 
                            _receiver.username ? _receiver.username : _receiver.public_address, 1, true, asset);

                        const msg = {
                            to: _receiver.email,
                            from: SEND_GRID.EMAIL,
                            subject: 'You received NFT on SuperKluster.io',
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
                }
                
                axios({
                    url: `${SOCKET_SERVER_URI}?userAcc=${to}`,
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
            // burn
            if(from != zeroAddr && to == zeroAddr && asset) {
                const listRepo = getRepository(List);
                const cartPayloadRepo = getRepository(CartPayload);
                let owner_from = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: from})
                    .getOne();
                if(!owner_from) return;
                // need to delete
                //check List for Owner
                let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .getMany();

                // delete buy_log
                for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                    await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                        .delete()
                        .execute();
                }

                await getRepository(List).createQueryBuilder("list")
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();

                await getRepository(Owner).createQueryBuilder("owner")
                    .where("owner.id = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();

                // remove asset_activity
                await activityRepo.createQueryBuilder('asset_activity')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove asset_favourite
                await getRepository(AssetFavourite).createQueryBuilder('asset_favourite')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove asset_view
                await getRepository(AssetView).createQueryBuilder('asset_view')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();
                
                // remove bidder
                await getRepository(Bid).createQueryBuilder('bid')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove creator
                await getRepository(Creator).createQueryBuilder('creator')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove texture
                await getRepository(Texture).createQueryBuilder('texture')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();
                
                // remove trait
                await getRepository(Trait).createQueryBuilder('trait')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove cart
                let _cartList = await getRepository(Cart).createQueryBuilder('cart')
                .where("cart.assetId = :assetId", {assetId: asset.id})
                .getMany();

                for(let i = 0; i < _cartList.length; i ++) {
                    await getRepository(CartPayload).createQueryBuilder('cart_payload')
                    .where('cartId = :cartId', {cartId: _cartList[i]['id']})
                    .delete()
                    .execute();
                }

                await getRepository(Cart).createQueryBuilder('cart')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove report
                await getRepository(Report).createQueryBuilder('report')
                .where('assetId = :assetId', {assetId: asset.id})
                .delete()
                .execute();

                // remove asset
                await assetRepository.createQueryBuilder('asset')
                    .where('id = :Id', {Id: asset.id})
                    .delete()
                    .execute();
            }
        } else {
            if(registered) return;
            // transfer
            if(from != zeroAddr && to != zeroAddr && asset) {
                let owner_from = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: from})
                    .getOne();
                if(!owner_from) return;
                if(owner_from.quantity < quantity) return;
                owner_from.quantity = owner_from.quantity - quantity;

                let owner_to = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: to})
                    .getOne();
                if(!owner_to) {
                    owner_to = new Owner();
                    owner_to.asset = assetRepository.create({
                        id: asset.id
                    });
                    owner_to.owner_of = to;
                    owner_to.quantity = quantity;
                } else {
                    owner_to.quantity = owner_to.quantity + quantity;
                }
                await ownerRepo.save(owner_to);

                if(owner_from.quantity <= 0) {
                    const listRepo = getRepository(List);
                    let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .getMany();

                    for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                        .delete()
                        .execute();
                    }

                    await getRepository(List).createQueryBuilder("list")
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();

                    await getRepository(Owner).createQueryBuilder("owner")
                    .where("owner.id = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();
                }
                else {
                    let _removeLists = await getRepository(List).createQueryBuilder("list")
                    .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                    .getMany();

                    for(let i = 0; i < _removeLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _removeLists[i].id})
                        .delete()
                        .execute();
                    }

                    await getRepository(List).createQueryBuilder('list')
                    .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                    .delete()
                    .execute();

                    await ownerRepo.save(owner_from);
                }

                await activityRepo.save(activityRepo.create({
                    asset: assetRepository.create({
                        id: asset.id
                    }),
                    from: getAddress(from),
                    to: getAddress(to),
                    activity: ActivityType.Transfer,
                    quantity: quantity,
                    price: 0,
                    other_price: 0,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash
                }));

                if(asset.supply_number == 1) {
                    //delete asset from cart
                    await getRepository(Cart).createQueryBuilder('cart')
                    .where("assetId = :assetId", {assetId: asset.id})
                    .delete()
                    .execute();
                }

                // add Notify
                let notify: Notify;
                notify = new Notify();
                notify.create_date = Math.floor(Date.now() / 1000);
                notify.link = asset.id.toString();
                notify.type = 'transfer';
                notify.unread = true;
                notify.user = to;
                notify.from = from;
                notify.price = 0;
                const notifyRepo = getRepository(Notify);
                
                let _sender = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:from)", {from}).getOne();
                let _receiver = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:to)", {to}).getOne();

                notify.msg = `${_sender ? _sender.username : from} just send you the NFT (${asset.name}) on SuperKluster!`;
                await notifyRepo.save(notify);
                
                if(_receiver) {
                    if(_receiver.email && _receiver.email_notification) {
                        let _msgContent = getTransferMailContent(_sender ? _sender.username : from, 
                            _receiver.username ? _receiver.username : _receiver.public_address, quantity, true, asset);

                        const msg = {
                            to: _receiver.email,
                            from: SEND_GRID.EMAIL,
                            subject: 'You received NFT on SuperKluster.io',
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
                }

                axios({
                    url: `${SOCKET_SERVER_URI}?userAcc=${to}`,
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
            // burn
            if(from != zeroAddr && to == zeroAddr && asset) {
                let owner_from = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: from})
                    .getOne();
                if(!owner_from) return;
                if(owner_from.quantity < quantity) return;
                owner_from.quantity = owner_from.quantity - quantity;

                if(owner_from.quantity <= 0) {
                    const listRepo = getRepository(List);
                    let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                        .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                        .getMany();

                    for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                            .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                            .delete()
                            .execute();
                    }

                    await getRepository(List).createQueryBuilder("list")
                        .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                        .delete()
                        .execute();

                    await getRepository(Owner).createQueryBuilder("owner")
                        .where("owner.id = :ownerId", {ownerId: owner_from.id})
                        .delete()
                        .execute();
                }
                else {
                    let _removeLists = await getRepository(List).createQueryBuilder("list")
                        .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                        .getMany();

                    for(let i = 0; i < _removeLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                            .where("buy_log.listId = :listId", {listId: _removeLists[i].id})
                            .delete()
                            .execute();
                    }

                    await getRepository(List).createQueryBuilder('list')
                        .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                        .delete()
                        .execute();

                    await ownerRepo.save(owner_from);
                }

                asset.supply_number = asset.supply_number - quantity;
                if(asset.supply_number <= 0) {
                    // remove asset_activity
                    await activityRepo.createQueryBuilder('asset_activity')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove asset_favourite
                    await getRepository(AssetFavourite).createQueryBuilder('asset_favourite')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove asset_view
                    await getRepository(AssetView).createQueryBuilder('asset_view')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();
                    
                    // remove bidder
                    await getRepository(Bid).createQueryBuilder('bid')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove creator
                    await getRepository(Creator).createQueryBuilder('creator')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove texture
                    await getRepository(Texture).createQueryBuilder('texture')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();
                    
                    // remove trait
                    await getRepository(Trait).createQueryBuilder('trait')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove cart
                    let _cartList = await getRepository(Cart).createQueryBuilder('cart')
                        .where("cart.assetId = :assetId", {assetId: asset.id})
                        .getMany();                    
                    for(let i = 0; i < _cartList.length; i ++) {
                        await getRepository(CartPayload).createQueryBuilder('cart_payload')
                        .where('cartId = :cartId', {cartId: _cartList[i]['id']})
                        .delete()
                        .execute();
                    }
                    await getRepository(Cart).createQueryBuilder('cart')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                    // remove report
                    await getRepository(Report).createQueryBuilder('report')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();                    

                    // remove asset
                    await assetRepository.createQueryBuilder('asset')
                        .where('id = :Id', {Id: asset.id})
                        .delete()
                        .execute();
                } else {
                    await assetRepository.save(asset);
                }
            }
        }
        await redisClient.del(key);
    } catch (e) {
        console.error('TransferItem event Erro:', e);
    }
}

export const transferItemFunc = async(collection: Collection, from, to, tokenId, quantity, event) => {

    const res = await checkMarketPlaceAction(event);
    if(res) return;
    quantity = parseInt(quantity.toString());
    
    const userRepo = getRepository(User);
    let sgMail = getMailHandle();

    try {
        if(!collection) return;
        const zeroAddr = getAddress('0x0000000000000000000000000000000000000000');
        const assetRepository = getRepository(Asset);
        const activityRepo = getRepository(AssetActivity);
        const collectionRepo = getRepository(Collection);
        const ownerRepo = getRepository(Owner);

        let _tokenId = tokenId.toString();
        let is_voxel = collection.is_voxel;

        if(is_voxel) {
            _tokenId = tokenId.toHexString();
        }

        let asset = await assetRepository.createQueryBuilder('asset')
            .where('asset.collectionId = :collectionId and token_id = :tokenId and is_voxel = :isVoxel', {collectionId: collection.id, tokenId: _tokenId, isVoxel: is_voxel})
            .getOne();

        if(!asset && from != zeroAddr) {
            return;
        }

        let key = event.transactionHash.toLowerCase() + '_' + (asset? asset.id.toString():'1000');        

        if((await redisClient.exists(key))) {
            return;
        }
        else {
            await redisClient.set(key, 'true');
        }

        let registered = await activityRepo.createQueryBuilder('asset_activity')
            .where("LOWER(transaction_hash) = LOWER(:txhash)", {txhash: event.transactionHash})
            .andWhere("asset_activity.assetId = :assetId", {assetId: asset.id})
            .getOne();

        if(registered)
            return;

        let is_721;

        if(collection.is_721) is_721 = true;
        else is_721 = false;

        if(is_721) {
            // transfer
            if(from != zeroAddr && asset && to != zeroAddr) {
                asset.owner_of = getAddress(to);
                asset.price = 0;
                asset.top_bid = 0;
                asset.sale_end_date = 0;
                asset.sale_type = 0;
                asset.on_sale = false;
                await assetRepository.save(asset);

                await getConnection()
                .createQueryBuilder()
                .update(Owner)
                .set({
                    owner_of: getAddress(to)
                })
                .where("assetId = :assetId", {assetId: asset.id})
                .execute();

                await activityRepo.save(activityRepo.create({
                    asset: assetRepository.create({
                        id: asset.id
                    }),
                    from: getAddress(from),
                    to: getAddress(to),
                    activity: ActivityType.Transfer,
                    quantity: 1,
                    price: 0,
                    other_price: 0,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash
                }));

                //delete asset from cart
                await getRepository(Cart).createQueryBuilder('cart')
                .where("assetId = :assetId", {assetId: asset.id})
                .delete()
                .execute();

                // add Notify
                let notify: Notify;
                notify = new Notify();
                notify.create_date = Math.floor(Date.now() / 1000);
                notify.link = asset.id.toString();
                notify.type = 'transfer';
                notify.unread = true;
                notify.user = to;
                notify.from = from;
                notify.price = 0;
                const notifyRepo = getRepository(Notify);

                let _sender = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:from)", {from}).getOne();
                let _receiver = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:to)", {to}).getOne();
                
                notify.msg = `${_sender ? _sender.username : from} just send you the NFT (${asset.name}) on SuperKluster!`;
                await notifyRepo.save(notify);

                if(_receiver) {
                    if(_receiver.email && _receiver.email_notification) {

                        let _msgContent = getTransferMailContent(_sender ? _sender.username : from, 
                            _receiver.username ? _receiver.username : _receiver.public_address, 1, true, asset);

                        const msg = {
                            to: _receiver.email,
                            from: SEND_GRID.EMAIL,
                            subject: 'You received NFT on SuperKluster.io',
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
                }

                axios({
                    url: `${SOCKET_SERVER_URI}?userAcc=${to}`,
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
            // burn
            if(from != zeroAddr && to == zeroAddr && asset) {
                const listRepo = getRepository(List);
                let owner_from = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: from})
                    .getOne();
                if(!owner_from) return;
                // need to delete
                //check List for Owner
                let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .getMany();

                // delete buy_log
                for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                    await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                        .delete()
                        .execute();
                }

                await getRepository(List).createQueryBuilder("list")
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();

                await getRepository(Owner).createQueryBuilder("owner")
                    .where("owner.id = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();

                // remove asset_activity
                await activityRepo.createQueryBuilder('asset_activity')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove asset_favourite
                await getRepository(AssetFavourite).createQueryBuilder('asset_favourite')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove asset_view
                await getRepository(AssetView).createQueryBuilder('asset_view')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();
                
                // remove bidder
                await getRepository(Bid).createQueryBuilder('bid')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove creator
                await getRepository(Creator).createQueryBuilder('creator')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove texture
                await getRepository(Texture).createQueryBuilder('texture')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();
                
                // remove trait
                await getRepository(Trait).createQueryBuilder('trait')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove cart
                let _cartList = await getRepository(Cart).createQueryBuilder('cart')
                .where("cart.assetId = :assetId", {assetId: asset.id})
                .getMany();

                for(let i = 0; i < _cartList.length; i ++) {
                    await getRepository(CartPayload).createQueryBuilder('cart_payload')
                    .where('cartId = :cartId', {cartId: _cartList[i]['id']})
                    .delete()
                    .execute();
                }

                await getRepository(Cart).createQueryBuilder('cart')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                // remove report
                await getRepository(Report).createQueryBuilder('report')
                .where('assetId = :assetId', {assetId: asset.id})
                .delete()
                .execute();

                // remove asset
                await assetRepository.createQueryBuilder('asset')
                    .where('id = :Id', {Id: asset.id})
                    .delete()
                    .execute();
            }
            // mint
            if(from == zeroAddr && !asset && to != zeroAddr) {
                if(registered) return;
                // mint action
                let nftUrl = `https://deep-index.moralis.io/api/v2/nft/${collection.contract_address}/${tokenId.toString()}/owners?chain=0x${collection.chain_id.toString(16)}&format=decimal`;
                const resp = await axios({
                    url: nftUrl,
                    method: "GET",
                    headers: {
                        "X-API-Key": morlias_config.apiKey
                    }
                });
    
                if (resp.status != 200 || resp.data['result'].length == 0) {
                    return;
                }
    
                const nft: any = resp.data['result'][0];
    
                let asset = new Asset();
                asset.mint_address = getAddress(to);
                asset.collection = collectionRepo.create({
                    id: collection.id
                });
                asset.name = `${collection.name} #${_tokenId}`;
                asset.token_id = _tokenId;
                asset.owner_of = getAddress(to);
                asset.token_uri = nft['token_uri'];
                if (nft['metadata']) {
                    const metadata = JSON.parse(nft['metadata']);
                    asset = await parseMetadata(asset, metadata, collection.id);
                }
                asset.synced = true;
     
                await assetRepository.save(asset);

                await activityRepo.save(activityRepo.create({
                    asset: assetRepository.create({
                        id: asset.id
                    }),
                    to: asset.owner_of,
                    activity: ActivityType.Mint,
                    quantity: 1,
                    create_date: Math.floor(Date.now() / 1000)
                }));

                let _owner = new Owner();
                _owner.owner_of = getAddress(to);
                _owner.quantity = 1;
                _owner.asset = asset;

                await ownerRepo.save(_owner);
            }
        } else {
            if(registered) return;
            // transfer
            if(from != zeroAddr && to != zeroAddr && asset) {
                let owner_from = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: from})
                    .getOne();
                if(!owner_from) return;
                if(owner_from.quantity < quantity) return;
                owner_from.quantity = owner_from.quantity - quantity;

                let owner_to = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: to})
                    .getOne();
                if(!owner_to) {
                    owner_to = new Owner();
                    owner_to.asset = assetRepository.create({
                        id: asset.id
                    });
                    owner_to.owner_of = to;
                    owner_to.quantity = quantity;
                } else {
                    owner_to.quantity = owner_to.quantity + quantity;
                }
                await ownerRepo.save(owner_to);

                if(owner_from.quantity <= 0) {
                    const listRepo = getRepository(List);
                    let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .getMany();

                    for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                        .delete()
                        .execute();
                    }

                    await getRepository(List).createQueryBuilder("list")
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();

                    await getRepository(Owner).createQueryBuilder("owner")
                    .where("owner.id = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();
                }
                else {
                    let _removeLists = await getRepository(List).createQueryBuilder("list")
                    .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                    .getMany();

                    for(let i = 0; i < _removeLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _removeLists[i].id})
                        .delete()
                        .execute();
                    }

                    await getRepository(List).createQueryBuilder('list')
                    .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                    .delete()
                    .execute();

                    await ownerRepo.save(owner_from);
                }

                await activityRepo.save(activityRepo.create({
                    asset: assetRepository.create({
                        id: asset.id
                    }),
                    from: getAddress(from),
                    to: getAddress(to),
                    activity: ActivityType.Transfer,
                    quantity: quantity,
                    price: 0,
                    other_price: 0,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash
                }));

                if(asset.supply_number == 1) {
                    //delete asset from cart
                    await getRepository(Cart).createQueryBuilder('cart')
                    .where("assetId = :assetId", {assetId: asset.id})
                    .delete()
                    .execute();
                }

                // add Notify
                let notify: Notify;
                notify = new Notify();
                notify.create_date = Math.floor(Date.now() / 1000);
                notify.link = asset.id.toString();
                notify.type = 'transfer';
                notify.unread = true;
                notify.user = to;
                notify.from = from;
                notify.price = 0;
                const notifyRepo = getRepository(Notify);
                
                let _sender = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:from)", {from}).getOne();
                let _receiver = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:to)", {to}).getOne();
                
                notify.msg = `${_sender ? _sender.username : from} just send you the NFT (${asset.name}) on SuperKluster!`;
                await notifyRepo.save(notify);

                if(_receiver) {
                    if(_receiver.email && _receiver.email_notification) {
                        let _msgContent = getTransferMailContent(_sender ? _sender.username : from,
                            _receiver.username ? _receiver.username : _receiver.public_address, quantity, true, asset);

                        const msg = {
                            to: _receiver.email,
                            from: SEND_GRID.EMAIL,
                            subject: 'You received NFT on SuperKluster.io',
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
                }

                axios({
                    url: `${SOCKET_SERVER_URI}?userAcc=${to}`,
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
            // mint
            if(from == zeroAddr && to != zeroAddr) {                
                if(asset) {
                    asset.supply_number = asset.supply_number + quantity;
                    await assetRepository.save(asset);
                } else {
                    asset = new Asset();
                    // mint action
                    let nftUrl = `https://deep-index.moralis.io/api/v2/nft/${collection.contract_address}/${tokenId.toString()}/owners?chain=0x${collection.chain_id.toString(16)}&format=decimal`;
                    const resp = await axios({
                        url: nftUrl,
                        method: "GET",
                        headers: {
                            "X-API-Key": morlias_config.apiKey
                        }
                    });
        
                    if (resp.status != 200 || resp.data['result'].length == 0) {
                        return;
                    }
                    const nft: any = resp.data['result'][0];
    
                    asset.mint_address = getAddress(to);
                    asset.collection = collectionRepo.create({
                        id: collection.id
                    });
                    asset.name = `${collection.name} #${_tokenId}`;
                    asset.token_id = _tokenId;
                    asset.owner_of = getAddress(to);
                    asset.token_uri = nft['token_uri'];
                    if (nft['metadata']) {
                        const metadata = JSON.parse(nft['metadata']);
                        asset = await parseMetadata(asset, metadata, collection.id);
                    }
                    asset.synced = true;
                    asset.supply_number = quantity;
        
                    await assetRepository.save(asset);
                }

                let owner_to = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: to})
                    .getOne();
                if(!owner_to) {
                    owner_to = new Owner();
                    owner_to.asset = assetRepository.create({
                        id: asset.id
                    });
                    owner_to.owner_of = to;
                    owner_to.quantity = quantity;
                } else {
                    owner_to.quantity = owner_to.quantity + quantity;
                }

                await ownerRepo.save(owner_to);

                await activityRepo.save(activityRepo.create({
                    asset: assetRepository.create({
                        id: asset.id
                    }),
                    from: getAddress(from),
                    to: getAddress(to),
                    activity: ActivityType.Mint,
                    quantity: quantity,
                    price: 0,
                    other_price: 0,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash
                }));
            }
            // burn
            if(from != zeroAddr && to == zeroAddr && asset) {
                let owner_from = await ownerRepo.createQueryBuilder('owner')
                    .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: from})
                    .getOne();
                if(!owner_from) return;
                if(owner_from.quantity < quantity) return;
                owner_from.quantity = owner_from.quantity - quantity;
                if(owner_from.quantity <= 0) {
                    // need to delete
                    //check List for Owner
                    const listRepo = getRepository(List);
                    let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .getMany();

                    // delete buy og
                    for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                        .delete()
                        .execute();
                    }

                    await getRepository(List).createQueryBuilder("list")
                    .where("list.ownerId = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();

                    await getRepository(Owner).createQueryBuilder("owner")
                    .where("owner.id = :ownerId", {ownerId: owner_from.id})
                    .delete()
                    .execute();
                }
                else {
                    let _removeLists = await getRepository(List).createQueryBuilder("list")
                    .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                    .getMany();

                    for(let i = 0; i < _removeLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _removeLists[i].id})
                        .delete()
                        .execute();
                    }

                    await getRepository(List).createQueryBuilder('list')
                    .where("ownerId = " + owner_from.id.toString() + " and quantity > " + owner_from.quantity.toString())
                    .delete()
                    .execute();

                    await ownerRepo.save(owner_from);
                }

                asset.supply_number = asset.supply_number - quantity;
                if(asset.supply_number <= 0) {
                    // remove asset_activity
                    await activityRepo.createQueryBuilder('asset_activity')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove asset_favourite
                    await getRepository(AssetFavourite).createQueryBuilder('asset_favourite')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove asset_view
                    await getRepository(AssetView).createQueryBuilder('asset_view')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();
                    
                    // remove bidder
                    await getRepository(Bid).createQueryBuilder('bid')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove creator
                    await getRepository(Creator).createQueryBuilder('creator')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove texture
                    await getRepository(Texture).createQueryBuilder('texture')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();
                    
                    // remove trait
                    await getRepository(Trait).createQueryBuilder('trait')
                        .where('assetId = :assetId', {assetId: asset.id})
                        .delete()
                        .execute();

                    // remove cart
                    let _cartList = await getRepository(Cart).createQueryBuilder('cart')
                        .where("cart.assetId = :assetId", {assetId: asset.id})
                        .getMany();

                    for(let i = 0; i < _cartList.length; i ++) {
                        await getRepository(CartPayload).createQueryBuilder('cart_payload')
                        .where('cartId = :cartId', {cartId: _cartList[i]['id']})
                        .delete()
                        .execute();
                    }

                    await getRepository(Cart).createQueryBuilder('cart')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                    // remove report
                    await getRepository(Report).createQueryBuilder('report')
                    .where('assetId = :assetId', {assetId: asset.id})
                    .delete()
                    .execute();

                    // remove asset
                    await assetRepository.createQueryBuilder('asset')
                        .where('id = :Id', {Id: asset.id})
                        .delete()
                        .execute();
                } else {
                    await assetRepository.save(asset);
                }
            }
        }
        await redisClient.del(key);
    } catch (e) {
        console.error('TransferItem event Erro:', e);
    }
}
