import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'invitation_delivery_attempts' })
@Index('ix_invitation_delivery_attempts_sender_attempted_at', [
  'senderUserId',
  'attemptedAt',
])
export class InvitationDeliveryAttemptEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_invitation_delivery_attempts',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'invitation_id' })
  invitationId!: string;

  @Column({ type: 'bigint', name: 'sender_user_id' })
  senderUserId!: string;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
    name: 'attempted_at',
  })
  attemptedAt!: Date;

  @Column({ type: 'boolean' })
  succeeded!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error!: string | null;
}
