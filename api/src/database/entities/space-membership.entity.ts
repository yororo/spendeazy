import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type SpaceAccessLevel = 'read' | 'write';

@Entity({ name: 'space_memberships' })
@Index('ix_space_memberships_user_access', ['userId', 'accessLevel'])
export class SpaceMembershipEntity {
  @PrimaryColumn({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @PrimaryColumn({ type: 'bigint', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 20, name: 'access_level' })
  accessLevel!: SpaceAccessLevel;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'joined_at' })
  joinedAt!: Date;
}
