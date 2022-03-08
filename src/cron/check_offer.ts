import { createConnection, getRepository } from "typeorm";
import * as cron from 'node-cron';
import { Bid } from "../entity/Bid";

createConnection().then(async connection => { 
    
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
    }))

});