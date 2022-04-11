import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from "typeorm";
import { Cart } from "./Cart";
import { Payload } from "./Payload";

@Entity()
export class CartPayload {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Cart)
    cart: Cart;

    @ManyToOne(() => Payload)
    payload: Payload;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    vxlPrice: number;
}