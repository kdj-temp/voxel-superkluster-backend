import { getConnection, getRepository } from "typeorm";
import { Asset } from "../entity/Asset";
import { List } from "../entity/List";

// update assetState for erc1155
export const updateAssetState = async (asset: Asset) => {
    try {
        if(asset.is_voxel && asset.is_721 || !asset.is_voxel && asset.collection.is_721) return;

        const listings = await getRepository(List).createQueryBuilder('list')
        .leftJoinAndSelect('list.owner', 'owner')
        .leftJoinAndSelect('owner.asset', 'asset')
        .where('asset.id = :assetId', {assetId: asset.id})
        .getMany();

        let lowest_price = 0;
        let sale_end_date = 0;
        
        let flg = false;
        for(let i = 0; i < listings.length; i ++) {

            if(flg && lowest_price > listings[i].price) {
                lowest_price = listings[i].price;
                sale_end_date = listings[i].sale_end_date;
            }
            if (!flg) {
                flg = true;
                lowest_price = listings[i].price;
                sale_end_date = listings[i].sale_end_date;
            }
        }

        if(listings.length == 0 || lowest_price == 0) {
            await getConnection()
            .createQueryBuilder()
            .update(Asset)
            .set({
                on_sale: false,
                price: 0,
                sale_type:0,
                sale_end_date: 0
            })
            .where("asset.id = :assetId", {assetId: asset.id})
            .execute();
        }
        else {
            await getConnection()
            .createQueryBuilder()
            .update(Asset)
            .set({
                on_sale: true,
                price: lowest_price,
                sale_type: 1,
                sale_end_date: sale_end_date
            })
            .where("asset.id = :assetId", {assetId: asset.id})
            .execute();            
        }
    } catch (e) {
        console.error("error while updating asset state: ", e);
    }
    
}