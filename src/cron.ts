import axios from "axios";
import { getAddress } from "ethers/lib/utils";
import { getConnection, getRepository } from "typeorm";

import { Asset } from "./entity/Asset";
import { Log } from "./entity/Log";
import { AssetActivity } from "./entity/AssetActivity";
import { Collection } from "./entity/Collection";
import { Category } from "./entity/Category";
import { morlias_config, ETHERSCAN_API_KEY, collectionsPerService, getApiEndpoint, getApiKey, getProvider, SK_COLLECTIONS } from "./config";
import { getLog, trimTokenUri, getLinkFromCollectionName } from "./utils";
import { ActivityType, SaleType } from "./models/enums";
import { AWSFileUploader } from "./services/upload/aws";
import { User } from "./entity/User";

import { ethers } from "ethers";
import * as erc721Abi from './core/abis/erc721Abi.json';
import * as erc1155Abi from './core/abis/erc1155Abi.json';
import { transferItemFunc, transferItemFunc_SK } from './utils/transferItem';
import { Owner } from "./entity/Owner";
import { Creator } from "./entity/Creator";
import redisHandle from "./models/redis";
import fetch from 'node-fetch';
import * as ownableAbi from './core/abis/ownerableAbi.json';
import { CollectionTrait } from "./entity/CollectionTrait";
import { AssetTrait } from "./entity/AssetTrait";

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
var command = ffmpeg();
var fs = require('fs');
const sharp = require('sharp');

const getThumbnailImage = async (url) => {
    url = trimTokenUri(url);
    try {
        const res = await ffmpeg(url)
        .takeScreenshots({
            count: 1,
            filename: 'tmp.png',
            timemarks: [ '0.01' ], // number of seconds
        });
    } catch (e) {
        console.error('error while getting thumbnail image: ', e);
    }
}

const deleteThumbnail = async () => {
    try {
        await fs.unlink('tmp.png', function(){console.log("deleted thumbnail")});
    } catch(e) {
        console.error('error while deleting thumbnail image on local: ', e);
    }
}

export const validateSaleEndDate = async function () {
    try {
        let currentTime = Math.floor(Date.now() / 1000);
        await getConnection()
            .createQueryBuilder()
            .update(Asset)
            .set({
                price: 0,
                on_sale: false,
                sale_end_date: 0,
                sale_type: SaleType.Default
            })
            .where("on_sale = true and sale_type = 1 and sale_end_date < :currentTime", {currentTime})
            .execute();
    }
    catch(ex) {
        console.error("validateSaleEndDate Err: ", ex);
    }
}

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

export const import_collection = async function () {
    
    try {
        const userRepository = getRepository(User);
        const assetRepository = getRepository(Asset);
        const collectionRepo = getRepository(Collection);
        const activityRepo = getRepository(AssetActivity);

        let collection = await collectionRepo.findOne({
            where: {
                synced: false,
                is_voxel: false
            },
            relations: ['creator']
        });
        if (!collection) {
            return;
        }

        const _assets = await assetRepository.createQueryBuilder('asset')
            .select('asset.token_id AS id')
            .where('asset.collectionId = ' + collection.id)
            .getRawMany();
        const tokenIds = _assets.map((_asset) => {
            return _asset['id'];
        })

        let count = 0;
        let total = 0;
        let cursor = "";

        let transferEvent;
        if(collection.is_721 == true) {
            transferEvent = ethers.utils.id("Transfer(address,address,uint256)");
        } else {
            transferEvent = ethers.utils.id("TransferSingle(address,address,address,uint256,uint256)");
        }

        let apiKey = getApiKey(collection.chain_id);
        const keyCount = apiKey.length;
        let index = 0;
        let api_Endpoint = getApiEndpoint(collection.chain_id);
        let encoder = new ethers.utils.AbiCoder;
        let zeroAddress = encoder.encode(["uint256"], ['0']);

        while (true) {
            let nftUrl = `https://deep-index.moralis.io/api/v2/nft/${collection.contract_address}/owners?chain=0x${collection.chain_id.toString(16)}&format=decimal`;
            if (cursor != "") {
                nftUrl += "&cursor=" + cursor;
            }
            if (total != 0) {
                nftUrl += "&offset=" + total;
            }

            const resp = await axios({
                url: nftUrl,
                method: "GET",
                headers: {
                    "X-API-Key": morlias_config.apiKey
                }
            });
            if (resp.status != 200) {
                break;
            }

            const nftsRes = resp.data;
            cursor = nftsRes['cursor'];
            if (cursor == "" || cursor == null) {
                break;
            }

            let assets = [];
            const nfts: Array<any> = nftsRes['result'];
            for (let idx = 0; idx < nfts.length; idx++) {
                const nft = nfts[idx];
                const tokenId = nft['token_id'];
                if (tokenId in tokenIds) {
                    continue;
                }
                // get minter of tokenId
                let minter;
                let encodedTokenId = encoder.encode(["uint256"], [tokenId]);
                if(collection.is_721 == true) {
                    const etherscanResp = await axios({
                        url: `https://${api_Endpoint}/api?module=logs&action=getLogs&address=${collection.contract_address}&fromBlock=0&toBlock=99999999&topic0=${transferEvent}&topic0_1_opr=and&topic1=${zeroAddress}&topic1_3_opr=and&topic3=${encodedTokenId}&page=1&offset=1&apikey=${apiKey[index]}`
                    });
                    index = (index + 1) % keyCount;
                    if(etherscanResp.data.result.length > 0) {
                        minter = encoder.decode(["address"], etherscanResp.data.result[0].topics[2])[0];
                    }
                }

                let asset = new Asset();
                // add minter
                asset.mint_address = minter;
                asset.collection = collectionRepo.create({
                    id: collection.id
                });
                asset.name = `${collection.name} #${tokenId}`;
                asset.token_id = tokenId;
                asset.owner_of = getAddress(nft['owner_of']);
                asset.token_uri = nft['token_uri'];

                if (nft['metadata']) {
                    const metadata = JSON.parse(nft['metadata']);
                    asset = await parseMetadata(asset, metadata, collection.id);
                    asset.synced = true;
                }
                else if (!nft['token_uri']) {
                    asset.synced = true;
                }
                asset.activities = [];
                asset.activities.push(activityRepo.create({
                    to: asset.owner_of,
                    activity: ActivityType.Mint,
                    quantity: nft['amount'],
                    create_date: Math.floor(Date.now() / 1000)
                }));

                count++;
                assets.push(asset);
            }

            await assetRepository.save(assets);
        }

        collection.synced = true;
        await collectionRepo.save(collection);

        const logRepo = getRepository(Log);
        await logRepo.save({
            msg: getLog(`${collection.name} collection synced with ${count} assets.`)
        });
    }
    catch (ex) {
        console.log("error: ", ex);
    }
}

export const import_collection_new = async function (collectionId: number, reqAddress: string) {
    
    try {
        const assetRepository = getRepository(Asset);
        const collectionRepo = getRepository(Collection);
        const activityRepo = getRepository(AssetActivity);
        const OwnerRepo = getRepository(Owner);
        const creatorRepo = getRepository(Creator);

        let collection = await collectionRepo.findOne({
            where: {
                id: collectionId
            },
            relations: ['creator']
        });
        if (!collection) {
            return;
        }

        const _assets = await assetRepository.createQueryBuilder('asset')
            .select('asset.token_id AS id')
            .where('asset.collectionId = ' + collection.id)
            .getRawMany();
        const tokenIds = _assets.map((_asset) => {
            return _asset['id'];
        })

        let count = 0;
        let total = 0;
        let cursor = "";

        let transferEvent;
        if(collection.is_721 == true) {
            transferEvent = ethers.utils.id("Transfer(address,address,uint256)");
        } else {
            transferEvent = ethers.utils.id("TransferSingle(address,address,address,uint256,uint256)");
        }

        let apiKey = getApiKey(collection.chain_id);
        const keyCount = apiKey.length;
        let keyIndex = collectionId % keyCount;
        let api_Endpoint = getApiEndpoint(collection.chain_id);
        let encoder = new ethers.utils.AbiCoder;
        let zeroAddress = encoder.encode(["uint256"], ['0']);

        // fetch all minters
        var minters = {};
        let page = 1;
        let _minter = "", _tokenId = "", len = 0, _quantity = 0;
        while(true) {
            if(collection.is_721) {
                const etherscanResp = await axios({
                    url: `https://${api_Endpoint}/api?module=logs&action=getLogs&address=${collection.contract_address}&fromBlock=0&toBlock=99999999&topic0=${transferEvent}&topic0_1_opr=and&topic1=${zeroAddress}&page=${page}&offset=1000&apikey=${apiKey[keyIndex]}`
                });

                if(etherscanResp.data.status == '0') {
                    break;
                }

                if(etherscanResp.data.result == null) {
                    break;
                }
                len = etherscanResp.data.result.length;
                if(len == 0) break;
                page ++;
                keyIndex = (keyIndex + 1) % keyCount;
                let end = false;
                for(var i = len - 1 ; i >= 0; i --) {
                    let _res = etherscanResp.data.result[i];
                    _minter = encoder.decode(["address"], _res.topics[2])[0];
                    _tokenId = encoder.decode(["uint256"], _res.topics[3])[0];
                    if(minters[_tokenId] == _minter) { end = true; break; }
                    minters[_tokenId] = _minter;
                }

                if(end == true) break;
            } else {
                break;
            }
        }

        while (true) {
            let resp;
            let nftUrl;
            if(reqAddress) nftUrl = `https://deep-index.moralis.io/api/v2/${reqAddress}/nft?chain=0x${collection.chain_id.toString(16)}&format=decimal&token_addresses=${collection.contract_address}&normalizeMetadata=false`;
            else nftUrl = `https://deep-index.moralis.io/api/v2/nft/${collection.contract_address}/owners?chain=0x${collection.chain_id.toString(16)}&format=decimal`;
            if (cursor != "") {
                nftUrl += "&cursor=" + cursor;
            }
            if (total != 0) {
                nftUrl += "&offset=" + total;
            }
            resp = await axios({
                url: nftUrl,
                method: "GET",
                headers: {
                    "X-API-Key": morlias_config.apiKey
                }
            });
            if (resp.status != 200) {
                continue;
            }

            const nftsRes = resp.data;
            cursor = nftsRes['cursor'];

            if(collection.is_721) {
                let assets = [];
                const nfts: Array<any> = nftsRes['result'];
                for (let idx = 0; idx < nfts.length; idx++) {
                    const nft = nfts[idx];
                    const tokenId = nft['token_id'];
                    if (tokenId in tokenIds) {
                        continue;
                    }

                    let asset = new Asset();
                    // add minter
                    if(collection.is_721) {
                        asset.mint_address = minters[tokenId];
                    }
                    
                    asset.collection = collectionRepo.create({
                        id: collection.id
                    });
                    asset.name = `${collection.name} #${tokenId}`;
                    asset.token_id = tokenId;
                    asset.owner_of = getAddress(nft['owner_of']);
                    asset.token_uri = nft['token_uri'];
                    if(!collection.verified) asset.is_hide = true;

                    if (nft['metadata']) {
                        const metadata = JSON.parse(nft['metadata']);
                        asset = await parseMetadata(asset, metadata, collection.id);
                    } else if(nft['token_uri']) {
                        const { data } = await axios.get(trimTokenUri(nft['token_uri']));
                        asset = await parseMetadata(asset, data, collection.id);
                    }
                    asset.synced = true;
                    asset.activities = [];
                    asset.activities.push(activityRepo.create({
                        to: asset.owner_of,
                        activity: ActivityType.Mint,
                        quantity: nft['amount'],
                        create_date: Math.floor(Date.now() / 1000)
                    }));

                    count++;
                    let tmp = await assetRepository.createQueryBuilder('asset')
                        .where('collectionId = :collectionId and token_id = :tokenId', {collectionId: collection.id, tokenId: asset.token_id})
                        .getOne();
                    if(!tmp) assets.push(asset);
                }
                await assetRepository.save(assets);
                let len = assets.length;
                for(let i = 0 ;i < len; i ++) {
                    let owner = new Owner();
                    owner.asset = assets[i];
                    owner.owner_of = assets[i].owner_of;
                    owner.quantity = 1;
                    await OwnerRepo.save(owner);
                    if(!minters[assets[i].token_id]) continue;
                    let creator = new Creator();
                    creator.asset = assets[i];
                    creator.creator_of = minters[assets[i].token_id];
                    creator.quantity = 1;
                    await creatorRepo.save(creator);
                }
            } else if (collection.is_1155) {
                const nfts: Array<any> = nftsRes['result'];
                for (let idx = 0; idx < nfts.length; idx++) {
                    const nft = nfts[idx];
                    const tokenId = nft['token_id'];
                    let asset = await assetRepository.createQueryBuilder('asset')
                        .where("token_id = :tokenId and collectionId = :collectionId", {tokenId: tokenId, collectionId: collection.id})
                        .getOne();
                    if(!asset) {
                        asset = new Asset();
                        asset.collection = collectionRepo.create({
                            id: collection.id
                        });
                        asset.name = `${collection.name} #${tokenId}`;
                        asset.owner_of = getAddress(nft['owner_of']);
                        asset.token_id = tokenId;
                        asset.supply_number = nft['amount'];
                        asset.token_uri = nft['token_uri'];
                        if(!collection.verified) asset.is_hide = true;
                        asset.is_721 = false;
                        if (nft['metadata']) {
                            const metadata = JSON.parse(nft['metadata']);
                            asset = await parseMetadata(asset, metadata, collection.id);
                        } else if(nft['token_uri']) {
                            const { data } = await axios.get(trimTokenUri(nft['token_uri']));
                            asset = await parseMetadata(asset, data, collection.id);   
                        }

                        asset.synced = true;
                        asset.activities = [];
                        
                    } else {
                        asset.supply_number = asset.supply_number + parseInt(nft['amount']);
                    }
                    // let tmp = await assetRepository.createQueryBuilder('asset')
                    //     .where('collectionId = :collectionId and token_id = :tokenId', {collectionId: collection.id, tokenId: asset.token_id})
                    //     .getOne();
                    // if(!tmp) {
                    //     await assetRepository.save(asset);
                    // }
                    await assetRepository.save(asset);

                    let owner = await OwnerRepo.createQueryBuilder('owner')
                        .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: getAddress(nft['owner_of'])})
                        .getOne();
                    if(!owner) {
                        asset.activities = [];
                        asset.activities.push(activityRepo.create({
                            to: asset.owner_of,
                            activity: ActivityType.Mint,
                            quantity: nft['amount'],
                            create_date: Math.floor(Date.now() / 1000)
                        }));
                        await assetRepository.save(asset);
                        owner = new Owner();
                        owner.asset = assetRepository.create({
                            id: asset.id
                        });
                        owner.owner_of = getAddress(nft['owner_of']);
                        owner.quantity = nft['amount'];
                        await OwnerRepo.save(owner);
                    }
                    count ++;
                }
            }

            if (cursor == "" || cursor == null) {
                break;
            }
        }
        page = 1;
        while(true) {
            if (collection.is_1155) {
                const etherscanResp = await axios({
                    url: `https://${api_Endpoint}/api?module=logs&action=getLogs&address=${collection.contract_address}&fromBlock=0&toBlock=99999999&topic0=${transferEvent}&topic0_2_opr=and&topic2=${zeroAddress}&page=${page}&offset=1000&apikey=${apiKey[keyIndex]}`
                });
                if(etherscanResp.data.result == null) {
                    break;
                }
                if(etherscanResp.data.status == '0') {
                    break;
                }
                len = etherscanResp.data.result.length;
                if(len == 0) break;
                page ++;
                keyIndex = (keyIndex + 1) % keyCount;
                let end = false;
                for(var i = len - 1 ; i >= 0; i --) {
                    let _res = etherscanResp.data.result[i];
                    _minter = encoder.decode(["address"], _res.topics[3])[0];

                    if(_minter == zeroAddress) continue;
                    let _info = encoder.decode(["uint256","uint256"], _res.data); 
                    _tokenId = _info[0].toString();
                    _quantity = parseInt(_info[1].toString());
                    let asset = await assetRepository.createQueryBuilder('asset')
                        .where("token_id = :tokenId and collectionId = :collectionId", {tokenId: _tokenId, collectionId: collection.id})
                        .getOne();
                    if(!asset) continue;
                    let creator = await creatorRepo.createQueryBuilder('creator')
                        .where("assetId = :assetId and creator_of = :creatorOf", {assetId: asset.id, creatorOf: _minter})
                        .getOne();
                    if(!creator) {
                        creator = new Creator();
                        creator.asset = assetRepository.create({
                            id: asset.id
                        });
                        creator.creator_of = _minter;
                        creator.quantity = _quantity;

                    } else {
                        creator.quantity = creator.quantity + _quantity;
                    }
                    await creatorRepo.save(creator);
                }
            } else {
                break;
            }
        }

        collection.synced = true;
        await collectionRepo.save(collection);

        const logRepo = getRepository(Log);
        await logRepo.save({
            msg: getLog(`${collection.name} collection synced with ${count} assets.`)
        });
    }
    catch (ex) {
        console.log("error: ", ex);
    }
}

export const import_collection_low_memory = async function (collectionId: number) {
    
    try {
        const userRepository = getRepository(User);
        const assetRepository = getRepository(Asset);
        const collectionRepo = getRepository(Collection);
        const activityRepo = getRepository(AssetActivity);

        let collection = await collectionRepo.findOne({
            where: {
                id: collectionId
            },
            relations: ['creator']
        });
        if (!collection) {
            return;
        }

        const _assets = await assetRepository.createQueryBuilder('asset')
            .select('asset.token_id AS id')
            .where('asset.collectionId = ' + collection.id)
            .getRawMany();
        const tokenIds = _assets.map((_asset) => {
            return _asset['id'];
        })

        let count = 0;
        let total = 0;
        let cursor = "";

        let transferEvent;
        if(collection.is_721 == true) {
            transferEvent = ethers.utils.id("Transfer(address,address,uint256)");
        } else {
            transferEvent = ethers.utils.id("Transfer(address,address,uint256,uint256)");
        }

        let apiKey = getApiKey(collection.chain_id);
        const keyCount = apiKey.length;
        let keyIndex = (collectionId + 1) % keyCount;
        let api_Endpoint = getApiEndpoint(collection.chain_id);
        let encoder = new ethers.utils.AbiCoder;
        let zeroAddress = encoder.encode(["uint256"], ['0']);

        while (true) {
            let nftUrl = `https://deep-index.moralis.io/api/v2/nft/${collection.contract_address}/owners?chain=0x${collection.chain_id.toString(16)}&format=decimal`;
            if (cursor != "") {
                nftUrl += "&cursor=" + cursor;
            }
            if (total != 0) {
                nftUrl += "&offset=" + total;
            }

            const resp = await axios({
                url: nftUrl,
                method: "GET",
                headers: {
                    "X-API-Key": morlias_config.apiKey
                }
            });
            if (resp.status != 200) {
                break;
            }

            const nftsRes = resp.data;
            cursor = nftsRes['cursor'];
            if (cursor == "" || cursor == null) {
                break;
            }

            let assets = [];
            const nfts: Array<any> = nftsRes['result'];
            for (let idx = 0; idx < nfts.length; idx++) {
                const nft = nfts[idx];
                const tokenId = nft['token_id'];
                if (tokenId in tokenIds) {
                    continue;
                }

                let asset = new Asset();
                asset.collection = collectionRepo.create({
                    id: collection.id
                });
                asset.name = `${collection.name} #${tokenId}`;
                asset.token_id = tokenId;
                asset.owner_of = getAddress(nft['owner_of']);
                asset.token_uri = nft['token_uri'];

                if (nft['metadata']) {
                    const metadata = JSON.parse(nft['metadata']);
                    asset = await parseMetadata(asset, metadata, collection.id);
                    asset.synced = true;
                }
                else if (!nft['token_uri']) {
                    asset.synced = true;
                }
                asset.activities = [];
                asset.activities.push(activityRepo.create({
                    to: asset.owner_of,
                    activity: ActivityType.Mint,
                    quantity: nft['amount'],
                    create_date: Math.floor(Date.now() / 1000)
                }));

                count++;
                assets.push(asset);
            }

            await assetRepository.save(assets);
        }

        let page = 1;
        let _minter = "", _tokenId = "", len = 0;
        while(true) {
            if(collection.is_721 == true) {
                const etherscanResp = await axios({
                    url: `https://${api_Endpoint}/api?module=logs&action=getLogs&address=${collection.contract_address}&fromBlock=0&toBlock=99999999&topic0=${transferEvent}&topic0_1_opr=and&topic1=${zeroAddress}&page=${page}&offset=1000&apikey=${apiKey[keyIndex]}`
                });
                if(etherscanResp.data.result == null) {
                    break;
                }
                len = etherscanResp.data.result.length;
                if(len == 0) break;
                page ++;
                keyIndex = (keyIndex + 1) % keyCount;
                let end = false;
                for(var i = len - 1 ; i >= 0; i --) {
                    let _res = etherscanResp.data.result[i];
                    _minter = encoder.decode(["address"], _res.topics[2])[0];
                    _tokenId = encoder.decode(["uint256"], _res.topics[3])[0];
                    const _asset = await assetRepository.createQueryBuilder('asset')
                            .where("asset.collectionId = :collectionId and asset.token_id = :tokenId", {collectionId: collection.id.toString(), tokenId: _tokenId.toString()})
                            .getOne();
                    _asset.mint_address = _minter;
                    await assetRepository.save(_asset);
                }

                // if(end == true) break;
            } else {
                // implement erc1155 case
                break;
            }
        }

        collection.synced = true;
        await collectionRepo.save(collection);

        const logRepo = getRepository(Log);
        await logRepo.save({
            msg: getLog(`${collection.name} collection synced with ${count} assets.`)
        });
    }
    catch (ex) {
        console.log("error: ", ex);
    }
}

export const import_assets = async function () {

    try {
        const logRepo = getRepository(Log);

        const assetRepository = getRepository(Asset);

        let assets = await assetRepository.createQueryBuilder("asset")
            .leftJoinAndSelect('asset.collection', 'collection')
            .where('(asset.raw_image IS NOT NULL AND asset.image IS NULL) OR (asset.synced = 0)')
            .orderBy('asset.id', "ASC")
            .take(100)
            .getMany();

        if (assets.length == 0) {
            return;
        }

        let count = 0;
        for (let asset of assets) {
            try {
                if (asset['token_uri'] && !asset.synced) {
                    const { data } = await axios.get(trimTokenUri(asset['token_uri']));

                    console.log("import assets=============>:  ",  data);

                    asset = await parseMetadata(asset, data, asset.collection.id);
                    await assetRepository.save(asset);
                }

                const { data } = await axios.get(trimTokenUri(asset.raw_image), {
                    responseType: 'arraybuffer'
                });

                var req = await fetch(trimTokenUri(asset.raw_image), {method:'HEAD'});
                let type = req.headers.get('content-type');
                let tmp = type.split("/");
                let extension = (tmp.length > 1) ? tmp[1] : null;

                if(extension == 'svg+xml' || extension == 'svg' || extension == 'xml' || type == 'text/html; charset=UTF-8') {
                    asset.image = trimTokenUri(asset.raw_image);
                    asset.image_preview = trimTokenUri(asset.raw_image);
                } else {
                    if(extension == 'mp4' || extension == 'MP4') {
                        asset.raw_animation = trimTokenUri(asset.raw_image);
                        asset.asset_type = type;
                    }

                    const awsUploader = new AWSFileUploader();
                    const uploadFile = {
                        name: `assets/${asset.collection.id}/${asset.token_id}`,
                        type: type,
                        content: data,
                        size: data.size,
                        extension: extension,
                    };
                    const result = await awsUploader.upload(uploadFile);
                    if (result['path']) {
                        if(extension == 'mp4' || extension == 'MP4') asset.animation = result['path'];
                        else asset.image = result['path'];
                    }

                    if(asset.asset_type == 'video/mp4') {
                        // need to make preview image
                        await getThumbnailImage(asset.animation);
                        // const data = await fs.createReadStream('tmp.png');
                        const image = sharp('tmp.png');
                        const metadata = await image.metadata();
                        const { format } = metadata;

                        const compress_data = await image[format](config[format]).resize(600).toBuffer();

                        const uploadFile_1 = {
                            name: `assets/${asset.collection.id}/${asset.token_id}`,
                            type: `image/${format}`,
                            content: compress_data,
                            size: compress_data.size,
                            extension: format,
                        };

                        const result_1 = await awsUploader.upload(uploadFile_1);
                        if (result_1['path']) {
                            asset.image = result_1['path'];
                            asset.image_preview = result_1['path'];
                        }
                        await deleteThumbnail();
                    }
                }

                count++;
                await assetRepository.save(asset);
            }
            catch (ex) {
                console.error("error while uploading image: assetId = " + asset.id.toString() + " error: " + ex);
            }
        }

        if (count > 0) {
            await logRepo.save({
                msg: getLog(`${count} images uploaded.`)
            });
        }
        
    }
    catch (ex) {
        console.error("import_assets: ", ex);
    }
}

export const importTransferEvent = async function (page: number, startBlock: number, endBlock: number, chainId: number) {
    try {
        const collectionRepo = getRepository(Collection);

        let collections = await collectionRepo.createQueryBuilder('collection')
            .where('collection.chain_id = :id and is_voxel = 0', {id:chainId})
            .skip(page * collectionsPerService)
            .take(collectionsPerService)
            .getMany();

        if(!collections) {
            return;
        }
        
        for(let c_id = 0; c_id < collections.length; c_id ++) {
            let collection = collections[c_id];
            let address = collection.contract_address;
            let is_721 = collection.is_721;
            
            if(is_721) {
                const contract = new ethers.Contract(address, erc721Abi, getProvider(chainId));
                const events = await contract.queryFilter(
                    contract.filters.Transfer(),
                    startBlock,
                    endBlock
                );    
                if(events.length > 0) {
                    for (const ev of events) {
                        await transferItemFunc(collection, ev.args.from, ev.args.to, ev.args.tokenId, 1, ev);
                    }
                }
            } else {
                const contract = new ethers.Contract(address, erc1155Abi, getProvider(chainId));
                const events = await contract.queryFilter(
                    contract.filters.TransferSingle(),
                    startBlock,
                    endBlock
                );
                if(events.length > 0) {
                    for (const ev of events) {
                        await transferItemFunc(collection, ev.args.from, ev.args.to, ev.args.tokenId, ev.args.value, ev);
                    }
                }
            }
        }

    } catch (e) {
        console.log("error: ", e);
    }
}

export const importTransferEvent_SK = async function (startBlock: number, endBlock: number, chainId: number) {
    try {
        for(let c_id = 0; c_id < SK_COLLECTIONS.length; c_id ++) {
            let collection = new Collection();
            collection.contract_address = SK_COLLECTIONS[c_id]['contract_addr'];
            collection.is_voxel = true;
            collection.is_721 = (SK_COLLECTIONS[c_id]['erc721'] == true);
            collection.is_1155 = (SK_COLLECTIONS[c_id]['erc721'] == false);

            let address = collection.contract_address;
            let is_721 = collection.is_721;
            
            if(is_721) {

                console.log("importTransferEvent_SK============>");

                const contract = new ethers.Contract(address, erc721Abi, getProvider(chainId));
                const events = await contract.queryFilter(
                    contract.filters.Transfer(),
                    startBlock,
                    endBlock
                );    
                if(events.length > 0) {
                    for (const ev of events) {
                        await transferItemFunc_SK(collection, ev.args.from, ev.args.to, ev.args.tokenId, 1, ev);
                    }
                }
            } else {
                const contract = new ethers.Contract(address, erc1155Abi, getProvider(chainId));
                const events = await contract.queryFilter(
                    contract.filters.TransferSingle(),
                    startBlock,
                    endBlock
                );
                if(events.length > 0) {
                    for (const ev of events) {
                        await transferItemFunc_SK(collection, ev.args.from, ev.args.to, ev.args.id, ev.args.value, ev);
                    }
                }
            }
        }

    } catch (e) {
        console.log("error: ", e);
    }
}

export const importAssetFromUser = async function (userAddress: string, chainId: number) {
    try {
        const userRepo = getRepository(User);
        const collectionRepo = getRepository(Collection);
        const activityRepo = getRepository(AssetActivity);
        const assetRepository = getRepository(Asset);
        const ownerRepo = getRepository(Owner);
        const creatorRepo = getRepository(Creator);
        const user = await userRepo.createQueryBuilder('user')
            .where("LOWER(public_address) = :userAddress", {userAddress: userAddress})
            .getOne();
        
        let total = 0;
        let cursor = "";

        while(true) {
            let nftUrl = `https://deep-index.moralis.io/api/v2/${userAddress}/nft?chain=0x${chainId.toString(16)}&format=decimal&normalizeMetadata=false`;
            if (cursor != "") {
                nftUrl += "&cursor=" + cursor;
            }
            if (total != 0) {
                nftUrl += "&offset=" + total;
            }
            const resp = await axios({
                url: nftUrl,
                method: "GET",
                headers: {
                    "X-API-Key": morlias_config.apiKey
                }
            });
            if (resp.status != 200) {
                continue;
            }
            const nftsRes = resp.data;
            cursor = nftsRes['cursor'];

            const nfts: Array<any> = nftsRes['result'];
            for (let idx = 0; idx < nfts.length; idx++) {
                const nft = nfts[idx];
                await importCollectionData(nft['token_address'], chainId, user);
                let collection = await collectionRepo.createQueryBuilder('collection')
                    .where(`LOWER(contract_address) = '${nft['token_address'].toLowerCase()}'`)
                    .getOne();
                if(!collection) {
                    // console.error("get error while getting collection info");
                    continue;
                }
                if(nft['contract_type'] == 'ERC721') {
                    const tokenId = nft['token_id'];
                    let asset = await assetRepository.createQueryBuilder('asset')
                        .where("token_id = :tokenId and collectionId = :collectionId", {tokenId: tokenId, collectionId: collection.id})
                        .getOne();
                    if(asset) continue;
                    asset = new Asset();
                    if(nft['minter_address']) asset.mint_address = getAddress(nft['minter_address']);
                    else asset.mint_address = userAddress;
                    
                    asset.collection = collectionRepo.create({
                        id: collection.id
                    });
                    asset.name = `${collection.name} #${tokenId}`;
                    asset.token_id = tokenId;
                    asset.owner_of = getAddress(nft['owner_of']);
                    asset.token_uri = nft['token_uri'];
                    if(!collection.verified) asset.is_hide = true;

                    if (nft['metadata']) {
                        const metadata = JSON.parse(nft['metadata']);
                        asset = await parseMetadata(asset, metadata, collection.id);
                    } else if(nft['token_uri']) {
                        const { data } = await axios.get(trimTokenUri(nft['token_uri']));
                        asset = await parseMetadata(asset, data, collection.id);
                    }
                    asset.synced = true;
                    asset.activities = [];
                    asset.activities.push(activityRepo.create({
                        to: asset.owner_of,
                        activity: ActivityType.Mint,
                        quantity: nft['amount'],
                        create_date: Math.floor(Date.now() / 1000)
                    }));

                    await assetRepository.save(asset);

                    let owner = new Owner();
                    owner.asset = asset;
                    owner.owner_of = asset.owner_of;
                    owner.quantity = 1;
                    await ownerRepo.save(owner);
                    let creator = new Creator();
                    creator.asset = asset;
                    if(nft['minter_address']) creator.creator_of = getAddress(nft['minter_address']);
                    else creator.creator_of = getAddress(nft['owner_of']);
                    creator.quantity = 1;
                    await creatorRepo.save(creator);
                } else {
                    const tokenId = nft['token_id'];
                    let asset = await assetRepository.createQueryBuilder('asset')
                        .where("token_id = :tokenId and collectionId = :collectionId", {tokenId: tokenId, collectionId: collection.id})
                        .getOne();
                    if(!asset) {
                        asset = new Asset();
                        asset.collection = collectionRepo.create({
                            id: collection.id
                        });
                        asset.name = `${collection.name} #${tokenId}`;
                        asset.owner_of = getAddress(nft['owner_of']);
                        asset.token_id = tokenId;
                        asset.token_uri = nft['token_uri'];
                        if(!collection.verified) asset.is_hide = true;
                        asset.supply_number = nft['amount'];
                        asset.is_721 = false;
                        if (nft['metadata']) {
                            const metadata = JSON.parse(nft['metadata']);
                            asset = await parseMetadata(asset, metadata, collection.id);
                        }
                        asset.synced = true;
                        asset.activities = [];
                        
                    } else {
                        asset.supply_number = asset.supply_number + parseInt(nft['amount']);
                    }
                    // let tmp = await assetRepository.createQueryBuilder('asset')
                    //     .where('collectionId = :collectionId and token_id = :tokenId', {collectionId: collection.id, tokenId: asset.token_id})
                    //     .getOne();
                    // if(!tmp) {
                    //     await assetRepository.save(asset);
                    // }
                    await assetRepository.save(asset);

                    let owner = await ownerRepo.createQueryBuilder('owner')
                        .where("assetId = :assetId and owner_of = :ownerOf", {assetId: asset.id, ownerOf: getAddress(nft['owner_of'])})
                        .getOne();
                    if(!owner) {
                        asset.activities = [];
                        asset.activities.push(activityRepo.create({
                            to: asset.owner_of,
                            activity: ActivityType.Mint,
                            quantity: nft['amount'],
                            create_date: Math.floor(Date.now() / 1000)
                        }));
                        await assetRepository.save(asset);
                        owner = new Owner();
                        owner.asset = assetRepository.create({
                            id: asset.id
                        });
                        owner.owner_of = getAddress(nft['owner_of']);
                        owner.quantity = nft['amount'];
                        await ownerRepo.save(owner);
                    }

                    let creator = new Creator();
                    creator.asset = assetRepository.create({
                        id: asset.id
                    });
                    creator.creator_of = userAddress;
                    creator.quantity = 1;
                    await creatorRepo.save(creator);
                }
            }
            if (cursor == "" || cursor == null) {
                break;
            }
        }
    } catch (e) {
        console.error("error while importing user asset: ", e);
    }
}

const importCollectionData = async function(contractAddress: string, chainId: number, user: User) {
    try {
        const colRepository = getRepository(Collection);
        const categoryRepo = getRepository(Category);

        for(let i = 0; i < SK_COLLECTIONS.length; i ++) {
            if(contractAddress.toLowerCase() == SK_COLLECTIONS[i]['contract_addr'].toLowerCase()) {
                return;
            }
        }

        let collection = await colRepository.createQueryBuilder('collection')
            .where(`LOWER(contract_address) = '${contractAddress.toLowerCase()}'`)
            .getOne();
        if(collection) return;

        let redisClient = redisHandle.getRedisClient();

        const apiEndpoint = getApiEndpoint(chainId);
        const apiKey = ETHERSCAN_API_KEY;

        let deployer = null;
        const deployerResp = await axios({
            url: `https://${apiEndpoint}/api?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${apiKey}`
        });

        if(deployerResp && deployerResp.data && deployerResp.data.result && deployerResp.data.result.length > 0) {
            deployer = getAddress(deployerResp.data.result[0].from);
        }
        
        const contractResp = await axios({
            url: `https://deep-index.moralis.io/api/v2/nft/${contractAddress}/metadata?chain=0x${chainId.toString(16)}`,
            method: "GET",
            headers: {
                "X-API-Key": morlias_config.apiKey
            }
        });

        const contractData = contractResp.data;

        let _collection = new Collection();
        _collection.chain_id = chainId;
        _collection.name = contractData['name']? contractData['name'] : 'undefined';

        let _link = await getLinkFromCollectionName(_collection.name);

        _collection.link = _link;
        _collection.symbol = contractData['symbol']? contractData['symbol']: 'undefined';
        _collection.contract_address = getAddress(contractData['token_address']);
        _collection.creator = user;
        _collection.is_1155 = contractData['contract_type'] === 'ERC1155';
        _collection.is_721 = contractData['contract_type'] === 'ERC721';
        _collection.is_voxel = false;
        _collection.category = await categoryRepo.findOne(1);

        const contract = new ethers.Contract(contractAddress, ownableAbi, getProvider(chainId));
        let owner = null;
        try {
            const res = await contract.owner();
            owner = res;
        } catch (e) {

        }
        if(owner) _collection.creator_of = owner;
        else if(deployer) _collection.creator_of = deployer;
        
        collection = await colRepository.save(_collection);

        await redisClient.set('new_collection', 'true');
    }
    catch (e) {
        console.error("error while importing collections: ", e);
    }
}

const config = {
    jpeg: { quality: 100 },
    webp: { quality: 100 },
    png: {quality: 100},
    gif: {quality: 100}
}

export const compress_assets = async function () {
    try {
        const assetRepository = getRepository(Asset);

        let assets = await assetRepository.createQueryBuilder()
            .loadAllRelationIds({
                relations: ['collection']
            })
            .where('image IS NOT NULL AND image_preview IS NULL')
            .orderBy('created_at', "DESC")
            .take(100)
            .getMany();

        console.log("compress processing: ", assets);

        if (assets.length == 0) {
            return;
        }
        for (let asset of assets) {
            try {
                const { data } = await axios.get(asset.image, {
                    responseType: 'arraybuffer'
                });
    
                const image = sharp(data);
                const metadata = await image.metadata();
                const { format } = metadata;
                if(format == 'svg' || format == 'svg+xml' || format == 'xml') {
                    asset.image_preview = asset.image;
                } else {
                    const res = await image[format](config[format]).resize(600).toBuffer();
                    const awsUploader = new AWSFileUploader();
                    const uploadFile = {
                        name: `assets/${asset['collection']}/${asset.token_id}`,
                        type: `image/${format}`,
                        content: res,
                        size: res.size,
                        extension: format,
                    };
    
                    const result = await awsUploader.upload(uploadFile);
                    if (result['path']) {
                        asset.image_preview = result['path'];
                    }
                }
                await assetRepository.save(asset);
            } catch (e) {
                console.log("compression error on asset: ", asset.id);
                asset.image = null;
                asset.image_preview = null;
                await assetRepository.save(asset);
            }
        }
    } catch (e) {
        console.error('error while compressing image: ', e);
    }
}