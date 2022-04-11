import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ActivityType, CurrencyType } from "../models/enums";
import { Asset } from "./Asset";

@Entity()
export class AssetActivity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    create_date: number;

    @ManyToOne(() => Asset)
    asset: Asset;

    @Column({
        type: "enum",
        enum: ActivityType
    })
    activity: ActivityType;

    @Column({
        length: 100,
        nullable: true
    })
    from?: string;

    @Column({
        length: 100,
        nullable: true
    })
    to?: string;

    @Column({
        nullable: true
    })
    quantity?: number;

    @Column({
        type: 'double',
        nullable: true
    })
    price?: number;            // usd price

    @Column({
        type: 'double',
        nullable: true
    })
    other_price?: number;     // vxl or eth price

    @Column({
        type: "enum",
        enum: CurrencyType,
        nullable: true
    })
    currency?: CurrencyType;

    @Column({
        nullable: true
    })
    transaction_hash: string;

    @Column({
        default: false
    })
    is_hide: boolean;

    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", select: true })
    created_at: Date;
}
