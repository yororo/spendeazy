export const ACTIVE_IDENTITY_EXECUTION = Symbol('ACTIVE_IDENTITY_EXECUTION');
export type IdentityExecutionMode = 'read' | 'write' | 'membership';
export interface ActiveIdentityExecution {
  execute<T>(
    userId: string,
    mode: IdentityExecutionMode,
    work: () => Promise<T>,
  ): Promise<T>;
  provision<T>(clerkUserId: string, work: () => Promise<T>): Promise<T>;
}
