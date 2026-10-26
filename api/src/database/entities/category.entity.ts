import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CategoryColor } from '../../categories/application/category-color';
import type { CategoryIconKey } from '../../categories/application/category-icon';

@Entity({ name: 'categories' })
@Index('ux_categories_space_name', ['spaceId', 'name'], { unique: true })
@Index('ix_categories_space_active', ['spaceId', 'isActive'])
export class CategoryEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_categories',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 40, name: 'icon_key', default: 'shapes' })
  iconKey!: CategoryIconKey;

  @Column({ type: 'varchar', length: 32, nullable: true })
  color!: CategoryColor | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'bigint', default: 1 })
  revision!: string;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
