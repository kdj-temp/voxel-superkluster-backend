import { createConnection, getRepository } from "typeorm";
import redisHandle from "../models/redis";
import * as cron from 'node-cron';
import { Asset } from "../entity/Asset";
import axios from 'axios';
import { morlias_config } from "../config";
import { BigNumber } from "ethers";
import { Collection } from "../entity/Collection";
import { AssetTrait } from "../entity/AssetTrait";
import { CollectionTrait } from "../entity/CollectionTrait";

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

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const refreshItem = async (assetId) => {
    try {
        const assetRepo = getRepository(Asset);
        let asset = await assetRepo.findOne(assetId, {
            relations: ['collection']
        });
        let collectionAddr = asset.contract_address;
        if(!asset.is_voxel) {
            collectionAddr = asset.collection.contract_address;
        }
        let tokenId = asset.token_id;
        if(asset.collection.is_voxel) {
            tokenId = (BigNumber.from(asset.token_id)).toString();
        }
        
        const chainId = asset.collection.chain_id;
        const requestUrl = `https://deep-index.moralis.io/api/v2/nft/${collectionAddr}/${tokenId}/metadata/resync?chain=0x${chainId.toString(16)}&mode=sync`;
        const resp = await axios({
            url: requestUrl,
            method: "GET",
            headers: {
                "X-API-Key": morlias_config.apiKey
            }
        });

        if(resp.status != 200) {
            return false;
        }

        await sleep(2000);
    
        let metadataUrl = `https://deep-index.moralis.io/api/v2/nft/${collectionAddr}/${tokenId}/owners?chain=0x${chainId.toString(16)}&format=decimal`;
        const metadataResp = await axios({
            url: metadataUrl,
            method: "GET",
            headers: {
                "X-API-Key": morlias_config.apiKey
            }
        });
        if(metadataResp.status != 200) {
            return false;
        }
    
        if(metadataResp.data['result'].length == 0) {
            return false;
        }
        const nftData = metadataResp.data['result'][0];
        if (nftData['metadata']) {
            const metadata = JSON.parse(nftData['metadata']);
            asset = await parseMetadata(asset, metadata, asset.collection.id);
        }
        assetRepo.save(asset);
    
        return true;
    } catch (e) {
        console.error("refreshItem cron server error: ", e);
        return true;
    }
}

createConnection().then(async connection => {
    let redisClient;
    try {
        await redisHandle.init();
        redisHandle.onConnect();
        redisHandle.onError();
        redisClient = redisHandle.getRedisClient();
    } catch (e) {
        console.error("redis server connection error: ", e);
    }

    var inProcess = false;

    const processRefresh = async () => {
        try {
            cron.schedule("*/3 * * * * *", async () => {
                try {
                    const size = await redisClient.LLEN("refresh_list");
                    if(size > 0) {
                            const assetId = await redisClient.LINDEX("refresh_list", 0);
                            if(!inProcess) {
                                inProcess = true;
                                const isRefreshed = await refreshItem(assetId);
                                if(isRefreshed) {
                                    await redisClient.LPOP("refresh_list");
                                    const refresh_key = "refresh_" + assetId;
                                    await redisClient.del(refresh_key);
                                }
                                inProcess = false;
                            }
                    }
                } catch (e) {
                    console.error("refresh error: ", e);
                    inProcess = false;
                }
                
            });
        } catch (e) {

        }
    }

    processRefresh();
}).catch(async(e) => {
    try {
        let redisClient;
        await redisHandle.init();
        redisHandle.onConnect();
        redisHandle.onError();
        redisClient = redisHandle.getRedisClient();
    } catch (e) {
        console.error("redis server connection error: ", e);
    }
} )