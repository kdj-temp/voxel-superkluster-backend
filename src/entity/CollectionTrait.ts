import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, OneToMany } from "typeorm";
import { AssetTrait } from "./AssetTrait";
import { Collection } from "./Collection";

@Entity()
export class CollectionTrait {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Collection)
    collection: Collection;

    @OneToMany(type => AssetTrait, row => row.collectionTrait)
    assetTraits: AssetTrait[];

    @Column()
    trait_type: string;

    /*
    text -> Properties
    progress -> Levels
    number -> Stats
    */
    @Column({
        default: 'text'
    })
    display_type: string;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    min_value: number;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    max_value: number;
}