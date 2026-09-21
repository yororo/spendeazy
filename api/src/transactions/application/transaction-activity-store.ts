export const TRANSACTION_ACTIVITY_STORE = Symbol('TRANSACTION_ACTIVITY_STORE');

export type TransactionActivityType = 'created';

export interface TransactionActivityRecord {
  id: string;
  transactionId: string;
  spaceId: string;
  actorUserId: string;
  type: TransactionActivityType;
  occurredAt: Date;
}

export interface NewTransactionActivity {
  transactionId: string;
  spaceId: string;
  actorUserId: string;
  type: TransactionActivityType;
  occurredAt: Date;
}

export interface TransactionActivityStore {
  create(input: NewTransactionActivity): Promise<TransactionActivityRecord>;
  findByTransactionInSpace(
    spaceId: string,
    transactionId: string,
  ): Promise<TransactionActivityRecord[]>;
}
