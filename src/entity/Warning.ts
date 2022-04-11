import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Warning {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    create_date: number;

    @Column({
        nullable: true
    })
    msg: string;
    
    @Column()
    user: string; // wallet address
    
    @Column({
        nullable: true
    })
    link: string;

    @Column({
        nullable: true
    })
    type: number;
}