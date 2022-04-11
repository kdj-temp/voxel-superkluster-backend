import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Asset } from "./Asset";

@Entity()
export class Texture {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        nullable: true
    })
    raw_animation_texture: string;

    @Column({
        nullable: true
    })
    isTextureForm: string;

    @ManyToOne(type => Asset, asset => asset.textures)
    asset: Asset;
}