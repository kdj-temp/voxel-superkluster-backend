import { Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Asset } from "./Asset";
import { User } from "./User";


@Entity()
export class AssetFavourite {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User)
    user: User;

    @ManyToOne(() => Asset)
    asset: Asset;    
}
