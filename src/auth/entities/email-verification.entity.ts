import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'email_verification' })
export class EmailVerification {
  @PrimaryColumn({ length: 50, type: 'varchar' })
  email: string;

  @Column({ length: 15 })
  token: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
