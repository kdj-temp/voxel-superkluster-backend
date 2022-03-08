import { createConnection, getRepository } from "typeorm";
import * as cron from 'node-cron';
import { BuyLog } from "../entity/BuyLog";
import { removeOldPayload } from "./../utils/removeOldPayload";
import { Bid } from "../entity/Bid";
import { CollectionTrait } from "../entity/CollectionTrait";
import { AssetTrait } from "../entity/AssetTrait";

createConnection().then(async connection => {
    
    const removeBuyLog = async function () {
        try {
            let currentTime = Math.floor(Date.now() / 1000);
            
            await getRepository(BuyLog).createQueryBuilder("buy_log")
            .where("create_date + 30 < :currentTime", {currentTime})
            .delete()
            .execute();
        }
        catch(err) {
            console.error("removeBuyLog Err: ", err);
        }
    }
    await removeBuyLog();
    cron.schedule('* * * * *', (async () => {
        await removeBuyLog();
    }));
    
    const checkOfferExpiration = async function () {
        try {
            
            let currentTime = Math.floor(Date.now() / 1000);

            await getRepository(Bid).createQueryBuilder("bid")
            .where("is_auction = false and expiration_date < :currentTime", {currentTime})
            .delete()
            .execute();

        }
        catch(err) {
            console.error("checkOfferExpiration Err: ", err);
        }
    }
    await checkOfferExpiration();
    cron.schedule('* * * * *', (async () => {
        await checkOfferExpiration();
    }));
    
    const removePayload = async () => {
        let flag = false;

        cron.schedule("* * * * *", async () => {
            try {
                if(flag) return;
                flag = true;
                await removeOldPayload();
                flag = false;
            } catch (e) {
                console.error("error while removing old payload: ", e);
            }
        });
    }
    removePayload();

    // need to remove CollectionTrait
    const removeCollectionTraits = async function () {
        try {
            let _collectionTraits = 
                await getRepository(CollectionTrait)
                .createQueryBuilder('collection_trait')
                .leftJoinAndSelect("collection_trait.assetTraits", "asset_trait")
                .where("asset_trait.assetId is NULL")
                .getMany();

            
            await getRepository(AssetTrait).createQueryBuilder('asset_trait')
            .where("asset_trait.assetId is NULL")
            .delete()
            .execute();

            let _collectionTraitIds = [];

            for(let i = 0; i < _collectionTraits.length; i ++) {
                _collectionTraitIds.push(_collectionTraits[i]['id']);
            }

            if(_collectionTraitIds.length > 0) {
                await getRepository(CollectionTrait).createQueryBuilder('collection_trait')
                .where("id IN (:...traits)", {traits: _collectionTraitIds})
                .delete()
                .execute();
            }
        }
        catch(err) {
            console.error("removeCollectionTraits Err: ", err);       
        }
    }

    const removeUnnecessaryTraits = async () => {
        let flag = false;

        cron.schedule("* * * * *", async () => {
            try {
                if(flag) return;
                flag = true;
                await removeCollectionTraits();
                flag = false;
            } catch (e) {
                console.error("error while removeUnnecessaryTraits: ", e);
            }
        });           
    }
    removeUnnecessaryTraits();
});