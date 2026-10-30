import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
@Index('ux_users_clerk_user_id', ['clerkUserId'], { unique: true })
@Index('ux_users_email', ['email'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_users',
  })
  id!: string;

  @Column({ type: 'varchar', length: 255, name: 'clerk_user_id' })
  clerkUserId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true, name: 'photo_url' })
  photoUrl!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
    name: 'deletion_status',
  })
  deletionStatus!: 'active' | 'pending' | 'completed';

  @Column({
    type: 'bigint',
    nullable: true,
    name: 'active_shared_space_id',
  })
  activeSharedSpaceId!: string | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'deleted_at',
  })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
