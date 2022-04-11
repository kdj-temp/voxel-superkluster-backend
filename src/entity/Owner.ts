import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from "typeorm";
import { Asset } from "./Asset";
import { List } from "./List";

@Entity()
export class Owner {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Asset)
    asset: Asset;

    @Column()
    owner_of: string;

    @Column({
        default: 0
    })
    quantity: number;

    @OneToMany(type => List, row => row.owner)
    lists: List[];
}