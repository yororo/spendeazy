import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

@Entity({ name: 'invitations' })
@Index('ux_invitations_code_hash', ['codeHash'], { unique: true })
@Index('ix_invitations_sender_status', ['senderUserId', 'status'])
export class InvitationEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_invitations',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'sender_user_id' })
  senderUserId!: string;

  @Column({ type: 'varchar', length: 64, name: 'code_hash' })
  codeHash!: string;

  @Column({ type: 'varchar', length: 200, name: 'code_ciphertext' })
  codeCiphertext!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: InvitationStatus;

  @Column({ type: 'timestamptz', precision: 3, name: 'expires_at' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
