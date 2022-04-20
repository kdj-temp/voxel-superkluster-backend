import { getRepository } from "typeorm";
import { ethers } from "ethers";
import axios from 'axios';
import { SEND_GRID, SOCKET_SERVER_URI, SK_COLLECTIONS } from "../config";
import { Asset } from "../entity/Asset";
import { AssetActivity } from "../entity/AssetActivity";
import { Collection } from "../entity/Collection";
import { Creator } from "../entity/Creator";
import { ActivityType, CurrencyType } from "../models/enums";
import { User } from "../entity/User";
import { Owner } from "../entity/Owner";
import { Cart } from "../entity/Cart";
import { List } from "../entity/List";
import { BuyLog } from "../entity/BuyLog";
import { Notify } from "../entity/Notify";
import { getBuyMailContent, getBuyerEmailContent } from "../utils/getMailContent";
import { getMailHandle } from "./index";
import { CartPayload } from "../entity/CartPayload";
import { Bid } from "../entity/Bid";
import { updateAssetState } from "./updateAssetState";

function checkInSKCollection(collection) {
    for(let i = 0; i < SK_COLLECTIONS.length; i ++) {
        if(collection.toLowerCase() == SK_COLLECTIONS[i]['contract_addr'].toLowerCase()) {
            return true;
        }
    }   
    return false;
}

export const buyItemFunc = async(collection, buyer, seller, tokenId, quantity, mintQty, price, currency, timestamp, event) => {
    try {
        const activityRepo = getRepository(AssetActivity);
        let registered = await activityRepo.createQueryBuilder('asset_activity')
        .where("LOWER(transaction_hash) = LOWER(:txhash) and activity = 'sale'", {txhash: event.transactionHash}).getOne();
        
        if(registered) return;
        
        const assetRepo = getRepository(Asset);
        const collectionRepo = getRepository(Collection);
        let asset: Asset;
        
        if(checkInSKCollection(collection)) {
            // voxel contract
            let _tokenId = tokenId.toHexString();
            asset = await assetRepo.findOne({
                where: {
                    token_id: _tokenId,
                    is_voxel: true
                }, relations: ['collection']
            });
        }
        else { // import contract
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

        if(!asset) {
            return;
        }

        let mintQuantity = mintQty.toNumber();
        let assetQuantity = quantity.toNumber();
        let currencyNo = currency.toNumber();

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
        let _otherPrice = 0;   // this is usd price

        let registeredTwice = await activityRepo.createQueryBuilder('asset_activity')
                .where("LOWER(transaction_hash) = LOWER(:txhash) and activity = 'sale'", {txhash: event.transactionHash}).getOne();
        if(registeredTwice) return;

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
                quantity:  mintQuantity,
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

        const userRepo = getRepository(User);
        const cartRepo = getRepository(Cart);
        const cartPayloadRepo = getRepository(CartPayload);
        // update nonce
        const user = await userRepo.createQueryBuilder('user')
            .addSelect('user.nonce')
            .where("LOWER(public_address) = LOWER(:user_address)", {user_address: buyer})
            .getOne();
        
        user.nonce = user.nonce + 1;
        await userRepo.save(user);
        
        if(!is_1155) {
            _otherPrice = asset.price;  // this is usd price
            asset.price = 0;
            asset.top_bid = 0;
            asset.sale_end_date=  0;
            asset.on_sale = false;
            asset.sale_type = 0;
            asset.owner_of = buyer;
            await assetRepo.save(asset);

            // change owner table
            const ownerRepo = getRepository(Owner);
            let _sellerOwner = await ownerRepo.createQueryBuilder('owner')
                .leftJoinAndSelect("owner.asset", "asset")
                .where("LOWER(owner.owner_of) = LOWER(:owner_of) and asset.id = :assetId", {owner_of: seller, assetId: asset.id})
                .getOne();

            if(_sellerOwner) {
                _sellerOwner.owner_of = buyer;
                await ownerRepo.save(_sellerOwner);
            }

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
                currency: (currencyNo == 1 ? CurrencyType.ETH : CurrencyType.VXL),
                create_date: Math.floor(Date.now() / 1000),
                transaction_hash: event.transactionHash
            }));

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
            await getRepository(Cart).createQueryBuilder('cart')
                .where("assetId = :assetId", {assetId: asset.id})
                .delete()
                .execute();
        }
        else {
            const ownerRepo = getRepository(Owner);
            const listRepo = getRepository(List);
            let _sellerOwner = await ownerRepo.createQueryBuilder('owner')
                                .leftJoinAndSelect("owner.asset", "asset")
                                .where("LOWER(owner.owner_of) = LOWER(:owner_of) and asset.id = :assetId", {owner_of: seller, assetId: asset.id})
                                .getOne();

            let _sellerQuantity = 0;

            if(_sellerOwner) {
                if(_sellerOwner.quantity <= assetQuantity) {
                    //check List for Owner
                    let _sellerOwnerLists = await listRepo.createQueryBuilder('list')
                        .where("list.ownerId = :ownerId", {ownerId: _sellerOwner.id})
                        .getMany();

                    // delete buy og
                    for(let i = 0; i < _sellerOwnerLists.length; i ++) {
                        await getRepository(BuyLog).createQueryBuilder("buy_log")
                        .where("buy_log.listId = :listId", {listId: _sellerOwnerLists[i].id})
                        .delete()
                        .execute();
                    }
                    
                    await getRepository(List).createQueryBuilder("list")
                        .where("list.ownerId = :ownerId", {ownerId: _sellerOwner.id})
                        .delete()
                        .execute();

                    await getRepository(Owner).createQueryBuilder("owner")
                        .where("owner.id = :ownerId", {ownerId: _sellerOwner.id})
                        .delete()
                        .execute();
                }
                else {
                    _sellerOwner.quantity = _sellerOwner.quantity - assetQuantity;
                    _sellerQuantity = _sellerOwner.quantity;
                    await ownerRepo.save(_sellerOwner);
                }
            }

            let _buyerOwner = await ownerRepo.createQueryBuilder('owner')
            .leftJoinAndSelect("owner.asset", "asset")
            .where("LOWER(owner.owner_of) = LOWER(:owner_of) and asset.id = :assetId", {owner_of: buyer, assetId: asset.id})
            .getOne();

            if(_buyerOwner) {
                _buyerOwner.quantity = _buyerOwner.quantity + assetQuantity;
                await ownerRepo.save(_buyerOwner);
            }
            else {
                _buyerOwner = new Owner();
                _buyerOwner.asset = asset;
                _buyerOwner.owner_of = buyer;
                _buyerOwner.quantity = assetQuantity;

                await ownerRepo.save(_buyerOwner);
            }

            // process listing
            const buyLogRepo = getRepository(BuyLog);
            let _buyLog = await buyLogRepo.createQueryBuilder('buy_log')
                .leftJoinAndSelect('buy_log.list', 'list')
                .leftJoinAndSelect('list.owner', 'owner')
                .leftJoinAndSelect('owner.asset', 'asset')
                .where("LOWER(buy_log.buyer) = LOWER(:buyer) and \
                        buy_log.quantity = :quantity and \
                        buy_log.onchainPrice = :onchainPrice and \
                        asset.id = :assetId", {
                            buyer: buyer,
                            quantity: assetQuantity,
                            onchainPrice: _tempPrice,
                            assetId: asset.id
                        })
                .getOne();
                
            if(_buyLog) {
                _otherPrice = _buyLog.price;

                await getRepository(BuyLog).createQueryBuilder("buy_log")
                    .where("buy_log.listId = :listId", {listId: _buyLog.list.id})
                    .delete()
                    .execute();
                    
                await getRepository(List).createQueryBuilder("list")
                    .where("list.id = :listId", {listId: _buyLog.list.id})
                    .delete()
                    .execute();
            }

            if(_sellerOwner) {
                let _removeLists = await getRepository(List).createQueryBuilder("list")
                    .where("list.ownerId = :ownerId and list.quantity > :quantity", {ownerId: _sellerOwner.id, quantity: _sellerQuantity})
                    .getMany();

                for(let i = 0; i < _removeLists.length; i ++) {
                    await getRepository(BuyLog).createQueryBuilder("buy_log")
                    .where("buy_log.listId = :listId", {listId: _removeLists[i].id})
                    .delete()
                    .execute();
                }

                await getRepository(List).createQueryBuilder("list")
                .where("list.ownerId = :ownerId and list.quantity > :quantity", {ownerId: _sellerOwner.id, quantity: _sellerQuantity})
                .delete()
                .execute();
            }

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
               currency: (currencyNo == 1 ? CurrencyType.ETH : CurrencyType.VXL),
               create_date: Math.floor(Date.now() / 1000),
               transaction_hash: event.transactionHash
            }));

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
        notify.user = seller;
        notify.from = buyer;
        notify.price = _tempPrice; //sale vxl

        const notifyRepo = getRepository(Notify);
        let _buyerInfo = await userRepo.createQueryBuilder('user')
        .where("LOWER(public_address) = LOWER(:buyer)", {buyer}).getOne();

        let _buyerName = '';
        if(_buyerInfo) {
            if(_buyerInfo.username == "")
                _buyerName = buyer;
            else
                _buyerName = _buyerInfo.username;
        }
        else {
            _buyerName = buyer;
        }

        notify.msg = `${asset.name} was sold to ${_buyerName} for ${_tempPrice} ${currencyNo == 1 ? `ETH` : `VXL`} (${_otherPrice} USD)`;
        await notifyRepo.save(notify);

        // get Seller 
        let _sellerInfo = await userRepo.createQueryBuilder('user')
        .where("LOWER(public_address) = LOWER(:seller)", {seller}).getOne();
        
        if(_sellerInfo) {
            let sgMail = getMailHandle();

            if(_sellerInfo.email && _sellerInfo.email_notification) {
                let _msgContent = getBuyMailContent(_sellerInfo.username ? _sellerInfo.username : _sellerInfo.public_address, _buyerName, asset.name, _tempPrice, _otherPrice, asset, currencyNo);

                const msg = {
                    to: _sellerInfo.email,
                    from: SEND_GRID.EMAIL,
                    subject: 'Item sold on SuperKluster.io',
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

            if(_buyerInfo && _buyerInfo.email && _buyerInfo.email_notification) {
                let _msgContent = getBuyerEmailContent(_sellerInfo.username ? _sellerInfo.username : _sellerInfo.public_address, _buyerName, asset.name, _tempPrice, asset, _otherPrice, currencyNo);
                
                const msg = {
                    to: _buyerInfo.email,
                    from: SEND_GRID.EMAIL,
                    subject: 'Item purchased on SuperKluster.io',
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

            axios({
                url: `${SOCKET_SERVER_URI}?userAcc=${seller}`,
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

        if(!is_1155) {
            // delete bids 
            await getRepository(Bid).createQueryBuilder("bid")
            .where("assetId = :assetId", {assetId: asset.id})
            .delete()
            .execute();
        }
        
        await updateAssetState(asset);
    }
    catch(e) {
        console.error("buyItemFunc err: ", e, event.transactionHash);
    }   
}