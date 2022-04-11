import { Entity, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";

@Entity()
export class Payload {
    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", select: false })
    create_date: Date;
}