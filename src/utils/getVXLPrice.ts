import axios from "axios";
import { morlias_config, VOXELX_CONTRACT_ADDR, VOXELX_EXCHANGE_ADDR } from "./../config";

let vxlUsdPrice = 0;

export const setVXLUsdPrice = async function () {    
    try {
        let url = `https://deep-index.moralis.io/api/v2/erc20/${VOXELX_CONTRACT_ADDR}/price?chain=eth&exchange=${VOXELX_EXCHANGE_ADDR}`
        
        const resp = await axios({
            url: url,
            method: "GET",
            headers: {
                "X-API-Key": morlias_config.apiKey
            }
        });

        if (resp.status != 200) {
            return;
        }

        vxlUsdPrice = resp.data.usdPrice;
    }
    catch(err) {
        console.error("getVXLUsdPrice: ", err);
    }
}

export const getVXLUsdPrice = function() {
    return vxlUsdPrice;
}