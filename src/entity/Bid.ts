import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from "typeorm";
import { Asset } from "./Asset";

@Entity()
export class Bid {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Asset)
    asset: Asset;

    @Column({
        default: false
    })
    is_auction: boolean;

    @Column({
        type: 'double',
        nullable: true
    })
    price: number; //bid price (usd price)

    @Column({
        default: 1
    })
    quantity: number; // offer number

    @Column()
    bidder: string;

    @Column({ nullable: true })
    expiration_date: number;

    @Column({
        default: 0
    })
    status: number;

    @Column()
    create_date: number;

    @Column()
    update_date: number;

    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", select: false })
    created_at: Date;

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)", select: false })
    updated_at: Date;
}