import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne } from "typeorm";
import { CurrencyType, SaleType, BidMethod } from "../models/enums";
import { AssetActivity } from "./AssetActivity";
import { AssetFavourite } from "./AssetFavourite";
import { AssetView } from "./AssetView";
import { Collection } from "./Collection";
import { User } from "./User";
import { Bid } from "./Bid";
import { Texture } from "./Texture";
import { Owner } from "./Owner";
import { Creator } from "./Creator";
import { Cart } from "./Cart";
import { AssetTrait } from "./AssetTrait";

@Entity()
export class Asset {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    token_id: string;

    @Column({
        nullable: true
    })
    token_uri: string;

    @Column({
        nullable: true
    })
    name: string;

    @Column({
        nullable: true, type: "text"
    })
    description: string;

    @Column({
        nullable: true
    })
    isMTLForm: string;

    @Column({
        nullable: true
    })
    image_preview: string;

    @Column({
        nullable: true
    })
    image: string;

    @Column({
        nullable: true
    })
    raw_image: string;

    @Column({
        type: 'blob',
        nullable: true
    })
    blob_raw_image: Buffer;
    
    @Column({
        default: 1
    })
    chain_id: number;

    @Column({
        nullable: true
    })
    animation: string;          // when video/audio

    @Column({
        nullable: true
    })
    raw_animation: string;      

    @Column({
        nullable: true
    })
    raw_animation_mtl: string;

    @Column({
        nullable: true
    })
    raw_animation_type: string;

    @Column({
        nullable: true
    })
    asset_type: string;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    price: number;      // Staring price  (USD Price)

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    top_bid: number;

    @Column({
        type: "enum",
        enum: CurrencyType,
        nullable: true
    })
    currency: CurrencyType;

    @Column({
        default: false
    })
    on_sale: boolean;

    @Column({
        default: false
    })
    is_trend: boolean;

    @Column({
        default: false
    })
    is_warning: boolean;

    @Column({
        type: "enum",
        enum: SaleType,
        nullable: true,
        default: SaleType.Default
    })
    sale_type: SaleType;

    @Column({
        type: "enum",
        enum: BidMethod,
        nullable: true
    })
    bid_method: BidMethod;

    @Column({ nullable: true })
    sale_end_date: number;

    @Column({ nullable: true })
    auction_start_date: number;

    @Column({ nullable: true })
    auction_end_date: number;

    @Column({
        default: false
    })
    auction_end_process: boolean;

    @Column()
    owner_of: string;

    @Column({
        default: 'active',
        length: 10
    })
    status: string

    @Column({
        default: false
    })
    synced: boolean

    @Column({
        default: false
    })
    is_voxel: boolean;

    @Column({
        default: false
    })
    is_sensitive: boolean;

    @Column({
        default: false
    })
    sensitive_admin_set: boolean;

    @Column({
        nullable: true, type: "text"
    })
    warning_message: string;

    @Column({
        default: false
    })
    has_unlockable_content: boolean;

    @Column({
        nullable: true
    })
    unlockable_content: string;

    @ManyToOne(type => Collection)
    collection: Collection;

    @OneToMany(type => Cart, row => row.asset)
    carts: Cart[];

    @OneToMany(type => AssetTrait, row => row.asset, { cascade: ['insert', 'update'] })
    assetTraits: AssetTrait[];

    @OneToMany(type => Texture, row => row.asset, { cascade: ['insert', 'update'] })
    textures: Texture[];

    @OneToMany(type => AssetFavourite, row => row.asset)
    favs: AssetFavourite[];

    @OneToMany(type => AssetView, row => row.asset)
    views: AssetView[];

    @OneToMany(type => AssetActivity, row => row.asset, { cascade: ['insert', 'update'] })
    activities: AssetActivity[];

    @OneToMany(type => Owner, row => row.asset, { cascade: ['insert', 'update'] })
    owners: Owner[];

    @OneToMany(type => Creator, row => row.asset, { cascade: ['insert', 'update'] })
    creators: Creator[];

    @OneToMany(type => Bid, row => row.asset)
    bids: Bid[];

    @ManyToOne(() => User, {
        nullable: true,
        createForeignKeyConstraints: false
    })

    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", select: false })
    created_at: Date;

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)", select: false })
    updated_at: Date;

    @Column({
        nullable: true
    })
    mint_address: string;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    royalty_fee: number;

    @Column({
        nullable: true
    })
    royalty_address: string;

    @Column({
        default: true
    })
    is_721: boolean;

    @Column({
        nullable: true
    })
    contract_address: string;

    @Column({
        default: 1
    })
    supply_number: number;

    @Column({
        nullable: true
    })
    reserve_address: string;

    @Column({
        default: false
    })
    is_hide: boolean;    
}
