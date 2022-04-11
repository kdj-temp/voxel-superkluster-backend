import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, OneToMany } from "typeorm";
import { Owner } from "./Owner";
import { CurrencyType, SaleType, BidMethod } from "../models/enums";
import { BuyLog } from "./BuyLog";

@Entity()
export class List {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Owner)
    owner: Owner;

    @Column({
        default: 0
    })
    quantity: number; // listing number

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    price: number; // price

    @Column({
        type: "enum",
        enum: CurrencyType,
        nullable: true
    })
    currency: CurrencyType;

    @Column({ nullable: true })
    sale_end_date: number;

    @Column({
        type: "enum",
        enum: SaleType,
        default: SaleType.Fixed
    })
    sale_type: SaleType;

    @Column()
    create_date: number;

    @Column({ nullable: true })
    auction_start_date: number;

    @Column({ nullable: true })
    auction_end_date: number;

    @Column({
        default: false
    })
    auction_end_process: boolean;

    @Column({
        type: "enum",
        enum: BidMethod,
        nullable: true
    })
    bid_method: BidMethod;

    @OneToMany(type => BuyLog, row => row.list)
    buyLogs: BuyLog[];

    @Column({
        nullable: true
    })
    reserve_address: string;
}