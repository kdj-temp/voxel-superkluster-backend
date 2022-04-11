import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from "typeorm";
import { Asset } from "./Asset";
import { CollectionTrait } from "./CollectionTrait";

@Entity()
export class AssetTrait {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(type => Asset, asset => asset.assetTraits)
    asset: Asset;

    @ManyToOne(() => CollectionTrait, { cascade: ['insert', 'update'] })
    collectionTrait: CollectionTrait;

    @Column({
        nullable: true
    })
    value: string;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    number_value: number;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    max_value: number;    
}