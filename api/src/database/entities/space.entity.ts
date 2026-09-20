import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SpaceKind = 'personal' | 'shared';
export type SpaceStatus = 'active' | 'archived';

@Entity({ name: 'spaces' })
@Index('ux_spaces_personal_owner', ['personalOwnerUserId'], {
  unique: true,
  where: `kind = 'personal'`,
})
export class SpaceEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_spaces',
  })
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: SpaceKind;

  @Column({ type: 'varchar', length: 20 })
  status!: SpaceStatus;

  @Column({ type: 'bigint', name: 'category_rules_revision', default: 0 })
  categoryRulesRevision!: string;

  @Column({
    type: 'bigint',
    nullable: true,
    name: 'personal_owner_user_id',
  })
  personalOwnerUserId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
