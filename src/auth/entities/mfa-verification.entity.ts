import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'mfa_verification' })
export class MfaVerification {
  @PrimaryColumn({ length: 50, type: 'varchar' })
  email: string;

  @Column({ length: 6 })
  code: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
