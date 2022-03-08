import { createConnection, getRepository } from "typeorm";
import * as cron from 'node-cron';
import { User } from "../entity/User";
import { BAN_PERIOD } from "../config";

createConnection().then(async connection => {
    
    const checkBan = async function () {
        try {
            // ban
            let data = await getRepository(User).createQueryBuilder('user')
            .where("status = 'active' and deactivating = false and warning_badge > deactive_proceed and MOD(warning_badge, 5) = 0")
            .getMany();

            let userRepo = getRepository(User);

            data.forEach(async function(item) {
                let _user: User;
                _user = item;

                let _count = Math.floor(_user.warning_badge / 5);
                if(_count > 4) _count = 4;

                let _timePeriod = BAN_PERIOD[_count - 1];

                _user.status = 'ban';
                _user.deactivating = true;
                _user.deactive_proceed = _user.warning_badge;
                _user.ban_end_time = Math.floor(Date.now() / 1000) + _timePeriod;

                await userRepo.save(_user);
            });

            // unban
            let currentTime = Math.floor(Date.now() / 1000);
            let udata = await getRepository(User).createQueryBuilder('user')
            .where("status = 'ban' and deactivating = true and ban_end_time < :currentTime", {currentTime})
            .getMany();

            udata.forEach(async function(item) {
                let _user: User;
                _user = item;

                _user.status = 'active';
                _user.deactivating = false;
                _user.ban_end_time = 0;

                await userRepo.save(_user);
            });
        }
        catch(err) {
            console.error("checkBan Err: ", err);
        }
    }

    await checkBan();

    cron.schedule('* * * * *', (async () => {
        await checkBan();
    }))    

});