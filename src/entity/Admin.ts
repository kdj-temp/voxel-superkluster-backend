import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Admin {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    login_id: string;
    
    @Column()
    password: string;

    @Column()
    create_date: number;

    @Column()
    update_date: number;
}