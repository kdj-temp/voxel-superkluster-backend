import { createClient } from 'redis';
import { REDIS_CONFIG } from "./../config";

class CRedis {
    redisClient: any;
    
    constructor() {
        this.redisClient = null;
    }

    async init() {
        try {
            this.redisClient = createClient({
                url: REDIS_CONFIG.HOST
            });

            await this.redisClient.connect();
        }
        catch(err) {
            console.error("redis init err: ", err);
        }
    }

    onError() {
        this.redisClient.on('error', (err) => {
            console.log('redisClient error :' + err);
        });
    }

    onConnect() {
        this.redisClient.on('connect', () => {
            console.log('redisClient connect');
        });
    }

    getRedisClient()     {
        return this.redisClient;
    }
}

let redisHandle = new CRedis();
export default redisHandle;