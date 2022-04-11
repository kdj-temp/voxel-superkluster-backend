import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User";

@Entity()
export class UserFollower {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    user_wallet: string;

    @ManyToOne(() => User)
    follower: User;
    
    @ManyToOne(() => User, {
        nullable: true,
        createForeignKeyConstraints: false
    })
    @JoinColumn({
        name: 'user_wallet',
        referencedColumnName: 'public_address'
    })
    following!: User;    

    @Column()
    create_date: number;
    
    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", select: false })
    created_at: Date;
}