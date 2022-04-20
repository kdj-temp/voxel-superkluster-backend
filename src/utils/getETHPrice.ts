import axios from "axios";
import { morlias_config, WETH_ADDR, VOXELX_EXCHANGE_ADDR } from "./../config";

let ethUsdPrice = 0;

export const setETHUsdPrice = async function () {    
    try {
        let url = `https://deep-index.moralis.io/api/v2/erc20/${WETH_ADDR}/price?chain=eth&exchange=${VOXELX_EXCHANGE_ADDR}`
        
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

        ethUsdPrice = resp.data.usdPrice;
    }
    catch(err) {
        console.error("setETHUsdPrice: ", err);
    }
}

export const getETHUsdPrice = function() {
    return ethUsdPrice;
}