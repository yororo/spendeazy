import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvitationStatus = 'pending' | 'canceled' | 'declined' | 'expired';
export type InvitationDeliveryStatus = 'pending' | 'sent' | 'failed';

@Entity({ name: 'invitations' })
@Index('ux_invitations_token_hash', ['tokenHash'], { unique: true })
@Index('ix_invitations_recipient_email_status', ['recipientEmail', 'status'])
@Index('ix_invitations_recipient_user_status', ['recipientUserId', 'status'])
export class InvitationEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_invitations',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'sender_user_id' })
  senderUserId!: string;

  @Column({ type: 'varchar', length: 320, name: 'recipient_email' })
  recipientEmail!: string;

  @Column({
    type: 'bigint',
    nullable: true,
    name: 'recipient_user_id',
  })
  recipientUserId!: string | null;

  @Column({ type: 'varchar', length: 128, name: 'token_hash' })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: InvitationStatus;

  @Column({ type: 'timestamptz', precision: 3, name: 'expires_at' })
  expiresAt!: Date;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'last_sent_at',
  })
  lastSentAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'delivery_status',
  })
  deliveryStatus!: InvitationDeliveryStatus;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'delivery_error',
  })
  deliveryError!: string | null;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
