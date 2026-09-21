export const TRANSACTION_ACTIVITY_STORE = Symbol('TRANSACTION_ACTIVITY_STORE');

export type TransactionActivityType = 'created' | 'edited';

export interface TransactionActivitySnapshot {
  categoryId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
}

export function toTransactionActivitySnapshot(
  transaction: TransactionActivitySnapshot,
): TransactionActivitySnapshot {
  return {
    categoryId: transaction.categoryId,
    purchaseDate: transaction.purchaseDate,
    description: transaction.description,
    amount: transaction.amount,
  };
}

export interface TransactionActivityRecord {
  id: string;
  transactionId: string;
  spaceId: string;
  actorUserId: string;
  type: TransactionActivityType;
  occurredAt: Date;
  before?: TransactionActivitySnapshot;
  after?: TransactionActivitySnapshot;
}

export interface NewTransactionActivity {
  transactionId: string;
  spaceId: string;
  actorUserId: string;
  type: TransactionActivityType;
  occurredAt: Date;
  before?: TransactionActivitySnapshot;
  after?: TransactionActivitySnapshot;
}

export interface TransactionActivityStore {
  create(input: NewTransactionActivity): Promise<TransactionActivityRecord>;
  findByTransactionInSpace(
    spaceId: string,
    transactionId: string,
  ): Promise<TransactionActivityRecord[]>;
}
