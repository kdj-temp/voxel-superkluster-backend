import { getRepository } from "typeorm";
import { User } from "../entity/User";
import { Asset } from "../entity/Asset";
import { AssetActivity } from "../entity/AssetActivity";
import { ActivityType, CurrencyType } from "../models/enums";
import { Notify } from "../entity/Notify";
import { SEND_GRID, SOCKET_SERVER_URI } from "../config";
import { getBuyMailContent, getBuyerEmailContent } from "../utils/getMailContent";
import { getMailHandle } from "./index";
import axios from 'axios';
import { Owner } from "../entity/Owner";
import { List } from "../entity/List";
import { BuyLog } from "../entity/BuyLog";
import { Cart } from "../entity/Cart";
import { CartPayload } from "../entity/CartPayload";
import { Payload } from "../entity/Payload";

export const buyCartFunc = async (buyer, payload, currency, timestamp, event) => {
    timestamp = timestamp.toString();
    try {

        let currencyNo = currency.toNumber();

        let sgMail = getMailHandle();
        const activityRepo = getRepository(AssetActivity);
        const assetRepo = getRepository(Asset);
        const ownerRepo = getRepository(Owner);
        const userRepo = getRepository(User);
        const cartRepo = getRepository(Cart);
        const cartPayloadRepo = getRepository(CartPayload);
        const payloadRepo = getRepository(Payload);
        const listRepo = getRepository(List);
        const buyLogRepo = getRepository(BuyLog);

        let registered = await activityRepo.createQueryBuilder('asset_activity')
        .where("LOWER(transaction_hash) = LOWER(:txhash)", {txhash: event.transactionHash}).getOne();
        if(registered) return;

        // get assets of current buyCart transaction
        const cartList = await cartPayloadRepo.createQueryBuilder('cart_payload')
            .leftJoinAndSelect('cart_payload.cart', 'cart')
            .leftJoinAndSelect('cart_payload.payload', 'payload')
            .leftJoinAndSelect('cart.asset', 'asset')
            .leftJoinAndSelect("asset.owners", "owner")
            .leftJoinAndSelect("asset.collection", "collection")
            .where('payload.id = :payloadId', {payloadId: parseInt(payload)})
            .getMany();

        for (let i = 0; i < cartList.length; i ++) {
            let seller = cartList[i].cart.asset.owners[0].owner_of;
            let quantity = cartList[i].cart.asset.owners[0].quantity;
            let _price = cartList[i].cart.asset.price;
            let vxlPrice = cartList[i].vxlPrice;

            if(cartList[i].cart.asset.status == 'pending') {
                cartList[i].cart.asset.status = 'active';

                await activityRepo.save(activityRepo.create({
                    asset: assetRepo.create({
                        id: cartList[i].cart.asset.id
                    }),
                    to: cartList[i].cart.asset.owners[0].owner_of,
                    activity: ActivityType.Mint,
                    quantity: 1,
                    create_date: Math.floor(Date.now() / 1000),
                    transaction_hash: event.transactionHash,
                    is_hide: true
                }));
            }

            cartList[i].cart.asset.owners[0].owner_of = buyer;
            cartList[i].cart.asset.price = 0;
            cartList[i].cart.asset.top_bid = 0;
            cartList[i].cart.asset.sale_end_date = 0;
            cartList[i].cart.asset.on_sale = false;
            cartList[i].cart.asset.sale_type = 0;
            cartList[i].cart.asset.owner_of = buyer;

            // in erc1155 case, remove listings
            const listing = await listRepo.createQueryBuilder('list')
                .where("list.ownerId = :ownerId", {ownerId: cartList[i].cart.asset.owners[0].id})
                .getMany();
            for (let j = 0; j < listing.length; j ++) {
                // remove all buyLog for removing list
                await buyLogRepo.createQueryBuilder("buy_log")
                    .where("buy_log.listId = :listId", {listId: listing[j].id})
                    .delete()
                    .execute();
            }
            await listRepo.createQueryBuilder("list")
                .where("list.ownerId = :ownerId", {ownerId: cartList[i].cart.asset.owners[0].id})
                .delete()
                .execute();

            // udpate asset status
            await assetRepo.save(cartList[i].cart.asset);


            // update owner Status
            await ownerRepo.save(cartList[i].cart.asset.owners[0]);

            // delete all asset from CartPayload
            const carts = await cartRepo.createQueryBuilder('cart')
                .where("assetId = :assetId", {assetId: cartList[i].cart.asset.id})
                .getMany();
            for(let j = 0; j < carts.length; j ++) {
                await cartPayloadRepo.createQueryBuilder('cart_payload')
                    .where('cartId = :cartId', {cartId: carts[j].id})
                    .delete()
                    .execute();
            }
            //delete asset from cart
            await getRepository(Cart).createQueryBuilder('cart')
            .where("assetId = :assetId", {assetId: cartList[i].cart.asset.id})
            .delete()
            .execute();

            await activityRepo.save(activityRepo.create({
                asset: assetRepo.create({
                    id: cartList[i].cart.asset.id
                }),
                from: seller,
                to: buyer,
                activity: ActivityType.Sale,
                quantity: quantity,
                price: _price,
                other_price: vxlPrice,
                currency: (currencyNo == 1 ? CurrencyType.ETH : CurrencyType.VXL),
                create_date: timestamp,
                transaction_hash: event.transactionHash
            }));

            let notify: Notify;
            notify = new Notify();
            notify.create_date = Math.floor(Date.now() / 1000);
            notify.link = cartList[i].cart.asset.id.toString();
            notify.type = 'sale';
            notify.unread = true;
            notify.user = seller;
            notify.from = buyer;
            notify.price = vxlPrice; //sale vxl

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

            notify.msg = `${cartList[i].cart.asset.name} was sold to ${_buyerName} for ${vxlPrice} VXL (${_price} USD)`;
            await notifyRepo.save(notify);

            // get Seller 
            let _sellerInfo = await userRepo.createQueryBuilder('user')
                .where("LOWER(public_address) = LOWER(:seller)", {seller}).getOne();

            if(_sellerInfo) {
                if(_sellerInfo.email && _sellerInfo.email_notification) {
                    let _msgContent = getBuyMailContent(_sellerInfo.username ? _sellerInfo.username : _sellerInfo.public_address, _buyerName, cartList[i].cart.asset.name, vxlPrice, _price, cartList[i].cart.asset, currencyNo);

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
                    let _msgContent = getBuyerEmailContent(_sellerInfo.username ? _sellerInfo.username : _sellerInfo.public_address, _buyerName, cartList[i].cart.asset.name, vxlPrice, cartList[i].cart.asset, _price, currencyNo);
                    
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
        }
        // delete payload
        await payloadRepo.createQueryBuilder('payload')
            .where('id = :payloadId', {payloadId:parseInt(payload)})
            .delete()
            .execute();
        
        // update user nonce
        const temp = await userRepo.createQueryBuilder('user')
            .select("nonce")
            .where("public_address = :user_address", {user_address: buyer})
            .getRawOne();
        const user = await userRepo.createQueryBuilder('user')
            .where("public_address = :user_address", {user_address: buyer})
            .getOne();
        user.nonce = parseInt(temp.nonce) + 1;
        await userRepo.save(user);
    } catch (e) {
        console.error("BuyCart process error:", e);
    }
}