import { getRepository } from "typeorm";
import { Asset } from "../entity/Asset";
import { AssetActivity } from "../entity/AssetActivity";
import { AssetFavourite } from "../entity/AssetFavourite";
import { AssetView } from "../entity/AssetView";
import { Bid } from "../entity/Bid";
import { Creator } from "../entity/Creator";
import { Texture } from "../entity/Texture";
import { Trait } from "../entity/Trait";
export const removeAsset = async(assetId) => {
    try {
        const assetRepo = getRepository(Asset);
        const activityRepo = getRepository(AssetActivity);
        // remove asset_activity
        await activityRepo.createQueryBuilder('asset_activity')
        .where('assetId = :assetId', {assetId: assetId})
        .delete()
        .execute();

        // remove asset_favourite
        await getRepository(AssetFavourite).createQueryBuilder('asset_favourite')
        .where('assetId = :assetId', {assetId: assetId})
        .delete()
        .execute();        

        // remove asset_view
        await getRepository(AssetView).createQueryBuilder('asset_view')
        .where('assetId = :assetId', {assetId: assetId})
        .delete()
        .execute();

        // remove bidder
        await getRepository(Bid).createQueryBuilder('bid')
        .where('assetId = :assetId', {assetId: assetId})
        .delete()
        .execute();

        // remove creator
        await getRepository(Creator).createQueryBuilder('creator')
        .where('assetId = :assetId', {assetId: assetId})
        .delete()
        .execute();
        
        // remove texture
        await getRepository(Texture).createQueryBuilder('texture')
        .where('assetId = :assetId', {assetId: assetId})
        .delete()
        .execute();

        // remove trait
        await getRepository(Trait).createQueryBuilder('trait')
        .where('assetId = :assetId', {assetId: assetId})
        .delete()
        .execute();

        // remove asset
        await assetRepo.createQueryBuilder('asset')
        .where('id = :Id', {Id: assetId})
        .delete()
        .execute();
    }
    catch(e)  {
        console.error("removeAsset err: ", e);
    }
}