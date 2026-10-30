import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource, EntityManager } from 'typeorm';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

const transactions = new AsyncLocalStorage<EntityManager>();

export function hasTransactionContext(database: DataSource): boolean {
  return transactions.getStore()?.connection === database;
}

export function transactionManager(fallback: EntityManager): EntityManager {
  const current = transactions.getStore();
  return current && current.connection === fallback.connection
    ? current
    : fallback;
}

export function inTransactionContext<T>(
  manager: EntityManager,
  work: () => Promise<T>,
): Promise<T> {
  return transactions.run(manager, work);
}

export function scopedTransaction<T>(
  database: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T>;
export function scopedTransaction<T>(
  database: DataSource,
  isolation: IsolationLevel,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T>;
export function scopedTransaction<T>(
  database: DataSource,
  isolationOrWork: IsolationLevel | ((manager: EntityManager) => Promise<T>),
  work?: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const current = transactions.getStore();
  const callback =
    typeof isolationOrWork === 'function' ? isolationOrWork : work!;
  if (current?.connection === database) return callback(current);
  return typeof isolationOrWork === 'function'
    ? database.transaction(callback)
    : database.transaction(isolationOrWork, callback);
}
