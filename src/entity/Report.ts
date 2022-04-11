import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { WarningType } from "../models/enums";
import { Asset } from "./Asset";
import { User } from "./User";

@Entity()
export class Report {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: "enum",
        enum: WarningType,
        nullable: true
    })
    type: WarningType;

    @ManyToOne(() => Asset)
    asset: Asset;

    @Column()
    wallet: string;

    @JoinColumn({
        name: 'wallet',
        referencedColumnName: 'public_address'
    })
    user!: User;

    @Column()
    create_date: number;

    @Column({
        default: 'pending',
        length: 10
    })
    status: string;
}