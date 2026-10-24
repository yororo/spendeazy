import { toExpenseActivityResponse } from './expense-response.mapper';

describe('toExpenseActivityResponse', () => {
  const occurredAt = new Date('2026-08-29T00:00:00.000Z');

  it('keeps legacy created events readable without an after snapshot', () => {
    expect(
      toExpenseActivityResponse({
        id: '1',
        expenseId: '2',
        spaceId: '3',
        actorUserId: '4',
        type: 'created',
        occurredAt,
      }),
    ).toEqual({
      id: '1',
      expenseId: '2',
      type: 'created',
      actorUserId: '4',
      occurredAt: occurredAt.toISOString(),
    });
  });

  it('keeps legacy deleted events readable without a before snapshot', () => {
    expect(
      toExpenseActivityResponse({
        id: '5',
        expenseId: '2',
        spaceId: '3',
        actorUserId: '4',
        type: 'deleted',
        occurredAt,
      }),
    ).toEqual({
      id: '5',
      expenseId: '2',
      type: 'deleted',
      actorUserId: '4',
      occurredAt: occurredAt.toISOString(),
    });
  });
});
