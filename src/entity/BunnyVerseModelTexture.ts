import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { BunnyVerseModel } from "./BunnyVerseModel";

@Entity()
export class BunnyVerseModelTexture {
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

    @ManyToOne(type => BunnyVerseModel, bunny_verse_model => bunny_verse_model.textures)
    bunny_verse_model: BunnyVerseModel;
}