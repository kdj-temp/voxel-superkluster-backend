import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Admin } from './Admin';

@Entity()
export class AdminActivity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    create_date: number;

    @Column()
    update_date: number;   

    @ManyToOne(() => Admin)
    admin: Admin;

    @Column()
    activity: string;

    @Column({
        nullable: true
    })
    ip_address: string;
}