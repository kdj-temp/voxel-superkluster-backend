import "reflect-metadata";
import { createConnection } from "typeorm";
import * as express from "express";
import * as bodyParser from "body-parser";
import * as cors from 'cors';
import * as fs from 'fs';
import * as cron from 'node-cron';
import * as dotenv from 'dotenv';
import { services } from "./services";
import { getTempPath, setMailApiKey } from "./utils";
import { setVXLUsdPrice } from "./utils/getVXLPrice";
import { setETHUsdPrice } from "./utils/getETHPrice";

import redisHandle from "./models/redis";

const port = 3001;

createConnection().then(async connection => {

    // Generate asset directories
    const tempPath = getTempPath();
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
    }

    dotenv.config();

    // create express app
    const app = express();
    app.use(bodyParser.json());
    app.use(cors());
    app.use('/api', services);
    app.listen(port);

    setMailApiKey();

    // redis setting
    await redisHandle.init();
    redisHandle.onConnect();
    redisHandle.onError();

    await setVXLUsdPrice();
    await setETHUsdPrice();

    cron.schedule('* * * * *', (async () => {
        await setVXLUsdPrice();
        await setETHUsdPrice();
    }));

    console.log("VoxelX server has started.");

}).catch(error => console.log(error));
