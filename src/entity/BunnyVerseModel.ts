import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { BunnyVerseModelTexture } from "./BunnyVerseModelTexture";

@Entity()
export class BunnyVerseModel {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        default: 1
    })
    index: number;

    @Column()
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
        nullable: true
    })
    animation: string;

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

    @OneToMany(type => BunnyVerseModelTexture, row => row.bunny_verse_model, { cascade: ['insert', 'update'] })
    textures: BunnyVerseModelTexture[];
}