import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { LogAction } from '../log-action.types';

@Entity('audit_logs')
@Index(['action', 'createdAt'])
@Index('IDX_audit_logs_user_created', ['user', 'createdAt'])
@Index('IDX_audit_logs_resource', ['resourceType', 'resourceId'])
export class AuditLogs {
  @PrimaryColumn()
  id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({
    name: 'action',
    type: 'enum',
    enum: LogAction,
  })
  action: LogAction;

  @Column({ name: 'endpoint', type: 'text', nullable: true })
  endpoint: string | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ name: 'resource_type', type: 'text', nullable: true })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'text', nullable: true })
  resourceId: string | null;

  @Column({ name: 'ip_address', type: 'text', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
