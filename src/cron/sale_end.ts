import { createConnection, getRepository, getConnection } from "typeorm";
import * as cron from 'node-cron';
import { Asset } from "../entity/Asset";
import { SaleType } from "../models/enums";
import { List } from "../entity/List";
import { updateAssetState } from "./../utils/updateAssetState";
import { BuyLog } from "../entity/BuyLog";

createConnection().then(async connection => {
    const validateSaleEndDate = async function () {
        try {        

            let currentTime = Math.floor(Date.now() / 1000);
            // check erc721 item first
            await getConnection()
            .createQueryBuilder()
            .update(Asset)
            .set({
                price: 0,
                on_sale: false,
                sale_end_date: 0,
                sale_type: SaleType.Default
            })
            .where("on_sale = true and sale_type = 1 and is_721 = true and sale_end_date < :currentTime", {currentTime})
            .execute();

            // check erc1155 item
            let assetList = await getRepository(Asset).createQueryBuilder('asset')
            .leftJoinAndSelect("asset.owners", "owner")
            .leftJoinAndSelect("owner.lists", "list")
            .leftJoinAndSelect("asset.collection", "collection")
            .where("list.sale_type = 1 and list.sale_end_date < :currentTime", {currentTime})
            .getMany();

            let listingList = await getRepository(List).createQueryBuilder('list')
            .where("sale_type = 1 and sale_end_date < :currentTime", {currentTime})
            .getMany();

            for(let i = 0; i < listingList.length; i ++) {
                await getRepository(BuyLog).createQueryBuilder('buy_log')
                .where("buy_log.listId = :listId", {listId: listingList[i]['id']})
                .delete()
                .execute();
            }

            await getRepository(List).createQueryBuilder('list')
            .where("sale_type = 1 and sale_end_date < :currentTime", {currentTime})
            .delete()
            .execute();

            for(let i = 0; i < assetList.length; i ++) {
                await updateAssetState(assetList[i]);
            }
        }
        catch(err) {
            console.error("validateSaleEndDate Err: ", err);
        }        
    }

    await validateSaleEndDate();

    cron.schedule('* * * * *', (async () => {
        await validateSaleEndDate();
    }))
});