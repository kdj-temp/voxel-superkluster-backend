import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique, OneToMany } from "typeorm";
import { Cart } from "./Cart";
import { Collection } from "./Collection";
import { AssetFavourite } from "./AssetFavourite";
import { AssetView } from "./AssetView";
import { UserFollower } from "./UserFollower";

@Entity()
@Unique(['public_address'])
export class User {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    public_address: string;

    @Column({
        select: false
    })
    nonce: number;

    @Column({
        nullable: true
    })
    username: string;

    @Column({
        nullable: true,
        select: false
    })
    password: string;

    @Column({
        nullable: true
    })
    bio: string;

    @Column({
        nullable: true
    })
    email: string;

    @Column({
        nullable: true
    })
    avatar: string;

    @Column({
        nullable: true
    })
    banner: string;

    @Column({
        nullable: true
    })
    link_twitter: string;

    @Column({
        nullable: true
    })
    link_instagram: string;

    @Column({
        nullable: true
    })
    link_external: string;

    @Column({
        default: 0
    })
    verify_request: number;

    @Column({
        nullable: true
    })
    verify_type: number;

    @Column({
        nullable: true
    })
    project_name: string;

    @Column({
        nullable: true
    })
    telegram_id: string;

    @Column({
        nullable: true
    })
    kyc: string;

    @Column({
        default: 'active',
        select: false
    })
    status: string;

    @Column({
        default: false
    })
    verified: boolean;

    @Column({
        default: false
    })
    is_sensitive: boolean;

    @Column({
        type: 'double',
        nullable: true,
        default: 0
    })
    saleSum: number;

    @Column({
        default: 0
    })
    token_count: number;

    @Column({
        default: '0',
        nullable: true
    })
    vxl_balance: string;

    //
    @Column({
        default: 0
    })
    warning_badge: number;

    @Column({
        default: 0
    })
    deactive_proceed: number;

    @Column({
        default: 0
    })
    ban_end_time: number;
    
    @Column({
        default: false
    })
    deactivating: boolean;

    @Column({
        default: true
    })
    email_notification: boolean;
    //


    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", select: false })
    created_at: Date;

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)", select: false })
    updated_at: Date;

    @OneToMany(() => Collection, row => row.creator)
    collections: Collection[];

    @OneToMany(() => Cart, row => row.creator)
    carts: Cart[];

    @OneToMany(() => UserFollower, row => row.follower)
    userFollowers: UserFollower[];

    @OneToMany(type => AssetFavourite, row => row.user)
    favs: AssetFavourite[];

    @OneToMany(type => AssetView, row => row.user)
    views: AssetView[];
}
