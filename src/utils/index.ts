import { SelectQueryBuilder, getRepository, Raw } from "typeorm";
import { SEND_GRID } from './../config';
import { getVXLUsdPrice } from "./getVXLPrice";
import { getETHUsdPrice } from "./getETHPrice";

import sgMail = require("@sendgrid/mail");
import { Collection } from "../entity/Collection";

export const convertNotifyMsg = (msg: string, templateObj: Object) => {
    let str = msg;

    for (const [key, value] of Object.entries(templateObj)) {
        str = str.replace(`{${key}}`, value);
    }
    return str;
}

export const setMailApiKey = () => {
    sgMail.setApiKey(SEND_GRID.API_KEY);
}

export const getMailHandle = () => {
    return sgMail;
}

export const getNonce = () => {
    return Math.floor(Math.random() * 1000000);
}

export const trimTokenUri = (tokenUri: string) => {

    if(tokenUri.startsWith("ipfs://ipfs/")) {
        return tokenUri.replace('ipfs://ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
    }
    if(tokenUri.startsWith("ipfs://")) {
        return tokenUri.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');
    }

    return tokenUri;
}

export const extendResponse = (data) => {
    return {
        ...data,
        "usdPrice": getVXLUsdPrice(),
        "ethUsdPrice": getETHUsdPrice()
    };
}

export const getLinkFromCollectionName = async (name) => {
    try {
        let link = name.toLowerCase();
        link = link.replace(/[^a-zA-Z0-9 ]/g, "");
        link = link.replace(/\s/g, '-');

        let temp_link = link;

        const colRepository = getRepository(Collection);

        let version = 1;

        while(true) {
            let duplicateCollection = await colRepository.findOne({
                where: {
                    link: Raw(alias => `LOWER(${alias}) = '${link.toLowerCase()}'`)
                }
            });
            
            if(!duplicateCollection)     {
                break;
            }

            version ++;

            link = temp_link + '-v' + version;
        }

        return link;
    }
    catch(err) {
        return "";
    }
}

export const paginateExplorerGetMany = async (builder: SelectQueryBuilder<any>, page: number, per_page: number) => {
    let total = 0;
    let from = 0;
    let to = 0;

    if (page < 1) {
        page = 1;
    }
    if (per_page > 100) {
        per_page = 100;
    }

    from = per_page * (page - 1) + 1;

    total = await builder
      .getCount();

    let data = await builder
    .skip(from - 1)
    .take(per_page)
    .getMany();

    for (let i = 0; i < data.length; i ++) {
        if(!data[i].blob_raw_image) continue;
        data[i].blob_raw_image = data[i].blob_raw_image.toString();
    }

    to = from + data.length - 1;

    return {
        'data': data,
        'meta': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'from': from,
            'to': to
        }
    }
}

export const paginateExplorer = async (builder: SelectQueryBuilder<any>, page: number, per_page: number) => {

    let total = 0;
    let from = 0;
    let to = 0;

    if (page < 1) {
        page = 1;
    }
    if (per_page > 100) {
        per_page = 100;
    }
    
    from = per_page * (page - 1) + 1;

    total = await builder
      .getCount();

        let data = await builder
        .offset(from - 1)
        .limit(per_page)
        .getRawMany();

    to = from + data.length - 1;

    let ret_data = [];

    data.forEach(function(_item) {
        let item: {[k: string]: any} = {};
        
        item = {
            "id": _item.asset_id,
            "token_id": _item.asset_token_id,
            "token_uri": _item.asset_token_uri,
            "name": _item.asset_name,
            "description": _item.asset_description,
            "isMTLForm": _item.asset_isMTLForm,
            "image_preview": _item.asset_image_preview,
            "image": _item.asset_image,
            "raw_image": _item.asset_raw_image,
            "animation": _item.asset_animation,
            "raw_animation": _item.asset_raw_animation,
            "raw_animation_mtl": _item.asset_raw_animation_mtl,
            "raw_animation_type": _item.asset_raw_animation_type,
            "asset_type": _item.asset_asset_type,
            "price": _item.asset_price,
            "top_bid": _item.asset_top_bid,
            "currency": _item.asset_currency,
            "chain_id": _item.asset_chain_id,
            "on_sale": _item.asset_on_sale,
            "is_trend": _item.asset_is_trend,
            "sale_type": _item.asset_sale_type,
            "bid_method": _item.asset_big_method,
            "sale_end_date": _item.asset_sale_end_date,
            "auction_start_date": _item.asset_auction_start_date,
            "auction_end_date": _item.asset_auction_end_date,
            "auction_end_process": _item.asset_auction_end_process,
            "owner_of": _item.asset_owner_of,
            "status": _item.asset_status,
            "synced": _item.asset_synced,
            "is_voxel": _item.asset_is_voxel,
            "is_sensitive": _item.asset_is_sensitive,
            "has_unlockable_content": _item.asset_has_unlockable_content,
            "unlockable_content": _item.asset_unlockable_content,
            "created_at": _item.asset_created_at,
            "is_721": _item.asset_is_721,
            "supply_number": _item.asset_supply_number,
            "fav_cnt": _item.fav_cnt,
            "fav_id": _item.fav_id,
            "owner_id": _item.user_tb_id,
            "owner_avatar": _item.user_tb_avatar,
            "owner_verified": _item.user_tb_verified,
            "blob_raw_image": _item.asset_blob_raw_image? _item.asset_blob_raw_image.toString() : null,
            "collection": {
                "id": _item.collection_id,
                "name": _item.collection_name,
                "link": _item.collection_link,
                "symbol": _item.collection_symbol,
                "description": _item.collection_description,
                "avatar": _item.collection_avatar,
                "banner": _item.collection_banner,
                "featured": _item.collection_featured,
                "contract_address": _item.collection_contract_address,
                "chain_id": _item.collection_chain_id,
                "verify_request": _item.collection_verify_request,
                "synced": _item.collection_synced,
                "is_1155": _item.collection_is_1155,
                "is_721": _item.collection_is_721,
                "is_voxel": _item.collection_is_voxel,
                "website": _item.collection_website,
                "twitter": _item.collection_twitter,
                "instagram": _item.collection_instagram,
                "telegram": _item.collection_telegram,
                "discord": _item.collection_discord,
                "volume": _item.collection_volume,
                "verified": _item.collection_verified
            }
        }
        ret_data.push(item);
    });
    
    return {
        'data': ret_data,
        'meta': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'from': from,
            'to': to
        }
    }
}

export const paginate = async (builder: SelectQueryBuilder<any>, page: number, per_page: number) => {

    let total = 0;
    let from = 0;
    let to = 0;

    if (page < 1) {
        page = 1;
    }
    if (per_page > 100) {
        per_page = 100;
    }

    from = per_page * (page - 1) + 1;

    total = await builder
        .getCount();

    let data = await builder
        .skip(from - 1)
        .take(per_page)
        .getMany();


    to = from + data.length - 1;

    for(let i = 0; i < data.length; i ++) {
        data[i]['is_verified'] = data[i]['verified'];
        delete data[i]['verified'];
    }

    return {
        'data': data,
        'meta': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'from': from,
            'to': to
        }
    }
}

export const multerToFileObj = (file: Express.Multer.File) => {
    return {
        name: file.originalname,
        type: file.mimetype,
        content: file.buffer,
        size: file.size,
        extension: `${file.originalname.split(".").pop()}`,
    };
}

export const getTempPath = (path: string = "") => {
    return process.cwd() + '/tmp/' + path;
}

export const getLog = (msg: string) => {
    const date = new Date().toLocaleString();
    return date + ": " + msg + '\n';
}

export const isImageAsset = (mimetype: string) => {
    return mimetype.includes("image");
}

export const generateUserName = () => {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    var charactersLength = characters.length;
    
    for ( var i = 0; i < 10; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * 
   charactersLength));
    }

    return result;
}