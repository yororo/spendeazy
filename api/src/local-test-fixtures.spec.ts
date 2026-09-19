import {
  createLocalTestFixtureDefinition,
  LOCAL_TEST_SECONDARY_FIXTURE_USER,
} from '../local-test/fixtures';

describe('local test fixture definition', () => {
  it('describes a populated fictional current-month scenario', () => {
    const fixture = createLocalTestFixtureDefinition(
      new Date('2026-09-19T12:00:00.000Z'),
    );

    expect(fixture.user).toEqual({
      clerkUserId: 'local-test-populated-user',
      name: 'Local Test User',
      email: 'local-test-user@example.invalid',
    });
    expect(fixture.users).toContainEqual(LOCAL_TEST_SECONDARY_FIXTURE_USER);
    expect(fixture.secondaryCategories).toEqual([
      {
        name: 'Companion Dining',
        description: 'Fictional meals for the second local User',
      },
      {
        name: 'Companion Travel',
        description: 'Fictional travel spending for the second local User',
      },
      {
        name: 'Companion Home',
        description: 'Fictional home spending for the second local User',
      },
    ]);
    expect(fixture.categories).toEqual([
      {
        name: 'Food & Drink',
        description: 'Fictional meals for local testing',
      },
      {
        name: 'Demo Transit',
        description: 'Fictional transport spending for local testing',
      },
      {
        name: 'Demo Home',
        description: 'Fictional home spending for local testing',
      },
      {
        name: 'Demo Fun',
        description: 'Fictional leisure spending for local testing',
      },
      {
        name: 'Demo Giving',
        description: 'Fictional giving for local testing',
      },
    ]);
    expect(fixture.budgets).toEqual([
      { categoryName: 'Food & Drink', period: 'monthly', amount: '1800.00' },
      { categoryName: 'Demo Transit', period: 'monthly', amount: '1200.00' },
      { categoryName: 'Demo Home', period: 'monthly', amount: '2500.00' },
      { categoryName: 'Demo Fun', period: 'monthly', amount: '900.00' },
      { categoryName: 'Demo Giving', period: 'monthly', amount: '500.00' },
    ]);
    expect(fixture.categoryRules).toEqual([
      {
        categoryName: 'Food & Drink',
        pattern: 'DEMO CAFE',
        matchType: 'exact',
      },
      {
        categoryName: 'Demo Transit',
        pattern: 'SAMPLE METRO',
        matchType: 'contains',
      },
      {
        categoryName: 'Demo Home',
        pattern: 'FICTIONAL MARKET',
        matchType: 'exact',
      },
      {
        categoryName: 'Demo Fun',
        pattern: 'SANDBOX CINEMA',
        matchType: 'contains',
      },
    ]);
    expect(fixture.transactions).toEqual([
      {
        categoryName: 'Food & Drink',
        purchaseDate: '2026-09-03',
        description: 'Demo Cafe Breakfast',
        amount: '185.00',
      },
      {
        categoryName: 'Demo Transit',
        purchaseDate: '2026-09-07',
        description: 'Sample Metro Ride',
        amount: '120.00',
      },
      {
        categoryName: 'Demo Home',
        purchaseDate: '2026-09-11',
        description: 'Fictional Market Run',
        amount: '475.00',
      },
      {
        categoryName: 'Demo Fun',
        purchaseDate: '2026-09-15',
        description: 'Sandbox Cinema',
        amount: '320.00',
      },
      {
        categoryName: 'Demo Giving',
        purchaseDate: '2026-09-19',
        description: 'Test Giving',
        amount: '200.00',
      },
      {
        categoryName: null,
        purchaseDate: '2026-09-22',
        description: 'Uncategorized Fixture Expense',
        amount: '90.00',
      },
    ]);
  });
});
