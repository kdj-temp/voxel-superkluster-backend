import { createConnection } from "typeorm";
import * as cron from 'node-cron';
import { compress_assets } from "../cron";

createConnection().then(async connection => {

    const compress_Image = async () => {
        var compressAssets = false;
        cron.schedule('* * * * *', (async () => {
            if (compressAssets) {
                return;
            }

            compressAssets = true;
            await compress_assets();
            compressAssets = false;
        }));
    }
    compress_Image();

}).catch(error => console.log(error));