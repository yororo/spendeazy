import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SpaceNotificationType = 'shared_space_archived';
export type SpaceNotificationDeliveryStatus = 'pending' | 'sent' | 'failed';

@Entity({ name: 'space_notifications' })
@Index('ix_space_notifications_recipient_created', [
  'recipientUserId',
  'createdAt',
])
@Index(
  'ux_space_notifications_archive_recipient_space',
  ['recipientUserId', 'spaceId', 'type'],
  { unique: true },
)
export class SpaceNotificationEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_space_notifications',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'recipient_user_id' })
  recipientUserId!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', nullable: true, name: 'actor_user_id' })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  type!: SpaceNotificationType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  message!: string;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'read_at',
  })
  readAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'email_delivery_status',
  })
  emailDeliveryStatus!: SpaceNotificationDeliveryStatus;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'email_delivery_error',
  })
  emailDeliveryError!: string | null;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;
}
