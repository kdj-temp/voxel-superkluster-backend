import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Asset } from "./Asset";

@Entity()
export class Creator {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Asset)
    asset: Asset;

    @Column()
    creator_of: string;

    @Column({
        default: 0
    })
    quantity: number;
}