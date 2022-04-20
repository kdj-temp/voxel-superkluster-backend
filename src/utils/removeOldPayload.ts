import { getRepository } from "typeorm";
import { CartPayload } from "../entity/CartPayload";
import { Payload } from "../entity/Payload";

export const removeOldPayload = async () => {
    try {
        const payloadRepo = getRepository(Payload);
        const cartPayloadRepo = getRepository(CartPayload);
        const oldPayloads = await payloadRepo.createQueryBuilder('payload')
            .where("create_date < (NOW() - INTERVAL 5 MINUTE)")
            .getMany();
        for (let i = 0; i < oldPayloads.length; i ++) {
            await cartPayloadRepo.createQueryBuilder('cart_payload')
                .where("payloadId = :payloadId", {payloadId: oldPayloads[i].id})
                .delete()
                .execute();
            await payloadRepo.createQueryBuilder('payload')
                .where("id = :id", {id: oldPayloads[i].id})
                .delete()
                .execute();
        }
    } catch (e) {
        console.error('error while removing old payload: ', e);
    }
}