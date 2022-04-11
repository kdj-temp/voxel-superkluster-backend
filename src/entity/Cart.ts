import { Entity, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { User } from "./User";
import { Asset } from "./Asset";

@Entity()
export class Cart {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User)
    creator: User;

    @ManyToOne(() => Asset)
    asset: Asset;
}