import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'invitation_claims' })
@Index('ux_invitation_claims_invitation_user', ['invitationId', 'userId'], {
  unique: true,
})
@Index('ix_invitation_claims_user_created', ['userId', 'createdAt'])
export class InvitationClaimEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_invitation_claims',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'invitation_id' })
  invitationId!: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: string;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;
}
