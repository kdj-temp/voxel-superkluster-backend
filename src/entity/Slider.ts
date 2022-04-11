import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
@Entity()
export class Slider {
    @PrimaryGeneratedColumn()
    id: number;   

    @Column({ nullable: true })
    order: number;   

    @Column({
        nullable: true
    })
    small_header: string;   

    @Column({
        nullable: true
    })
    big_header: string;   

    @Column({
        nullable: true, type: "text"
    })
    description: string;   

    @Column({
        nullable: true
    })
    button: string;

    @Column({
        nullable: true
    })
    banner: string;

    @Column({
        nullable: true
    })
    redirect_link: string;   

    @Column({
        nullable: true
    })
    class_name: string;

    @Column({
        nullable: true
    })
    website_link: string;

    @Column({
        default: true
    })
    visible: boolean;  

    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", select: false })
    created_at: Date;

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)", select: false })
    updated_at: Date;
}