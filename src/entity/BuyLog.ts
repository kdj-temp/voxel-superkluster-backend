import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from "typeorm";
import { List } from "./List";

@Entity()
export class BuyLog {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => List)
    list: List;

    @Column()
    buyer: string;

    @Column({
        default: 0
    })
    quantity: number;   // quantity

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    onchainPrice: number;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    price: number;

    @Column()
    create_date: number;
}