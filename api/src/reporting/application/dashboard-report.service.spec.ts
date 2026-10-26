import { DashboardReportService } from './dashboard-report.service';
import type {
  DashboardReportData,
  DashboardReportQuery,
  DashboardReportStore,
} from './dashboard-report-store';

const NOW = new Date('2026-07-03T00:30:00.000+08:00');

describe('DashboardReportService', () => {
  let query: DashboardReportQuery | undefined;
  let service: DashboardReportService;

  beforeEach(() => {
    query = undefined;
    const store: DashboardReportStore = {
      readDashboardReport: (value) => {
        query = value;
        const data = makeData();
        return Promise.resolve({
          ...data,
          imports: data.imports.filter(
            ({ importedAt }) =>
              importedAt >= new Date(value.importFromDate) &&
              importedAt < new Date(value.importToDateExclusive),
          ),
        });
      },
    };
    service = new DashboardReportService(store, () => new Date(NOW));
  });

  it('returns a six-month range with unrounded mixed-period planning and current-year checks', async () => {
    const report = await service.getDashboardReportInSpace('7', {
      view: 'monthly',
      endMonth: '2026-06',
    });

    expect(report.range).toMatchObject({
      fromDate: '2026-01-01',
      toDate: '2026-06-30',
      today: '2026-07-03',
      inProgress: false,
      timezone: 'Asia/Manila',
    });
    expect(report.range.asOf).toBe(NOW.toISOString());
    expect(query).toEqual({
      spaceId: '7',
      expenseFromDate: '2026-01-01',
      expenseToDate: '2026-07-03',
      importFromDate: '2025-12-31T16:00:00.000Z',
      importToDateExclusive: '2026-06-30T16:00:00.000Z',
    });
    expect(report.summary.planned).toEqual({
      exact: { numerator: '3500', denominator: '1' },
      amount: '3500.00',
      months: 6,
      monthlyEquivalent: {
        exact: { numerator: '1750', denominator: '3' },
        amount: '583.33',
      },
      annualEquivalent: {
        exact: { numerator: '7000', denominator: '1' },
        amount: '7000.00',
      },
    });
    expect(report.summary.comparison).toEqual({
      direction: 'below_plan',
      difference: {
        exact: { numerator: '-1000', denominator: '1' },
        amount: '-1000.00',
      },
      percentage: {
        exact: { numerator: '200', denominator: '7' },
        amount: '28.6',
      },
    });
    expect(report.monthlyExpenses).toHaveLength(6);
    expect(report.budgetChecks.monthly).toEqual([
      {
        categoryId: '1',
        name: 'Monthly',
        budgetAmount: '500.00',
        overBudgetMonths: 0,
        eligibleMonths: 6,
        expenseFilter: {
          fromDate: '2026-01-01',
          toDate: '2026-06-30',
          categoryId: '1',
        },
      },
    ]);
    expect(report.budgetChecks.yearly).toMatchObject([
      {
        categoryId: '2',
        year: '2026',
        actualAmount: '2000.00',
        limitAmount: '1000.00',
        status: 'over',
        usageFromDate: '2026-01-01',
        usageToDate: '2026-07-03',
      },
    ]);
  });

  it('uses today for the selected current month and excludes it from completed-month checks', async () => {
    const report = await service.getDashboardReportInSpace('7', {
      view: 'monthly',
      endMonth: '2026-07',
    });

    expect(report.range).toMatchObject({
      fromDate: '2026-02-01',
      toDate: '2026-07-03',
      inProgress: true,
    });
    expect(report.monthlyExpenses.at(-1)).toMatchObject({
      month: '2026-07',
      fromDate: '2026-07-01',
      toDate: '2026-07-03',
      inProgress: true,
    });
    expect(report.budgetChecks.monthly[0].eligibleMonths).toBe(5);
  });

  it('uses started months for the current year and keeps chart filters away from summaries', async () => {
    const report = await service.getDashboardReportInSpace('7', {
      view: 'yearly',
      year: '2026',
      chartCategoryId: ['2'],
    });

    expect(report.range).toMatchObject({
      fromDate: '2026-01-01',
      toDate: '2026-07-03',
      inProgress: true,
    });
    expect(report.summary.planned.months).toBe(7);
    expect(report.summary.planned.exact).toEqual({
      numerator: '12250',
      denominator: '3',
    });
    expect(report.summary.actualAmount).toBe('2500.00');
    expect(report.categoryExpenses.map(({ categoryId }) => categoryId)).toEqual(
      ['2'],
    );
    expect(report.budgetChecks.monthly[0].eligibleMonths).toBe(6);
  });

  it('returns separate yearly checks for every calendar year represented by a Monthly window', async () => {
    const report = await service.getDashboardReportInSpace('7', {
      view: 'monthly',
      endMonth: '2026-02',
    });

    expect(report.range).toMatchObject({
      fromDate: '2025-09-01',
      toDate: '2026-02-28',
    });
    expect(report.budgetChecks.yearly.map((check) => check.year)).toEqual([
      '2025',
      '2026',
    ]);
    expect(
      report.budgetChecks.yearly.map((check) => check.usageToDate),
    ).toEqual(['2025-12-31', '2026-07-03']);
  });

  it('uses all twelve months and the full date range for a past Yearly view', async () => {
    const report = await service.getDashboardReportInSpace('7', {
      view: 'yearly',
      year: '2025',
    });

    expect(report.range).toMatchObject({
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
      inProgress: false,
    });
    expect(report.summary.planned.months).toBe(12);
    expect(report.monthlyExpenses).toHaveLength(12);
    expect(report.budgetChecks.monthly[0].eligibleMonths).toBe(12);
    expect(report.budgetChecks.yearly[0].usageToDate).toBe('2025-12-31');
  });

  it('rejects future end months', async () => {
    await expect(
      service.getDashboardReportInSpace('7', {
        view: 'monthly',
        endMonth: '2026-08',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        expect.objectContaining({ field: '/endMonth', code: 'future_value' }),
      ],
    });
  });

  it('rejects future years', async () => {
    await expect(
      service.getDashboardReportInSpace('7', {
        view: 'yearly',
        year: '2027',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        expect.objectContaining({ field: '/year', code: 'future_value' }),
      ],
    });
  });

  it('handles empty no-plan reports and picks the alphabetical Category on ties', async () => {
    const emptyData: DashboardReportData = {
      categories: [],
      expenses: [],
      imports: [],
    };
    service = new DashboardReportService(
      { readDashboardReport: () => Promise.resolve(emptyData) },
      () => new Date(NOW),
    );

    const empty = await service.getDashboardReportInSpace('7', {});
    expect(empty.summary).toMatchObject({
      actualAmount: '0.00',
      expenseCount: '0',
      planned: {
        exact: { numerator: '0', denominator: '1' },
        amount: '0.00',
      },
      comparison: { direction: 'no_plan', percentage: null },
      highestCategory: null,
      statementImports: { count: '0', latestConfirmedAt: null },
    });
    expect(empty.monthlyExpenses).toHaveLength(6);
    expect(
      empty.monthlyExpenses.every(
        (month) => month.actualAmount === '0.00' && month.expenseCount === '0',
      ),
    ).toBe(true);

    const tiedData: DashboardReportData = {
      categories: [
        {
          categoryId: '9',
          name: 'Alpha',
          isActive: true,
          iconKey: 'shapes',
          colorKey: null,
          budgetAmount: null,
          budgetPeriod: null,
        },
        {
          categoryId: '2',
          name: 'Alpha',
          isActive: true,
          iconKey: 'shapes',
          colorKey: null,
          budgetAmount: null,
          budgetPeriod: null,
        },
        {
          categoryId: '1',
          name: 'Beta',
          isActive: true,
          iconKey: 'shapes',
          colorKey: null,
          budgetAmount: null,
          budgetPeriod: null,
        },
      ],
      expenses: [
        {
          categoryId: '9',
          expenseDate: '2026-01-05',
          amount: '100.00',
        },
        {
          categoryId: '2',
          expenseDate: '2026-02-05',
          amount: '100.00',
        },
        {
          categoryId: '1',
          expenseDate: '2026-03-05',
          amount: '100.00',
        },
      ],
      imports: [],
    };
    service = new DashboardReportService(
      { readDashboardReport: () => Promise.resolve(tiedData) },
      () => new Date(NOW),
    );

    const tied = await service.getDashboardReportInSpace('7', {});
    expect(tied.summary.highestCategory).toMatchObject({
      categoryId: '2',
      name: 'Alpha',
      amount: '100.00',
    });
  });

  it('defaults Monthly view to the last complete month', async () => {
    const report = await service.getDashboardReportInSpace('7', {});
    expect(report.range).toMatchObject({
      fromDate: '2026-01-01',
      toDate: '2026-06-30',
      inProgress: false,
    });
  });
});

function makeData(): DashboardReportData {
  return {
    categories: [
      {
        categoryId: '1',
        name: 'Monthly',
        isActive: true,
        iconKey: 'shapes',
        colorKey: 'azure',
        budgetAmount: '500.00',
        budgetPeriod: 'monthly',
      },
      {
        categoryId: '2',
        name: 'Yearly',
        isActive: true,
        iconKey: 'shapes',
        colorKey: 'violet',
        budgetAmount: '1000.00',
        budgetPeriod: 'yearly',
      },
      {
        categoryId: '3',
        name: 'Inactive',
        isActive: false,
        iconKey: 'shapes',
        colorKey: 'slate',
        budgetAmount: '9000.00',
        budgetPeriod: 'monthly',
      },
    ],
    expenses: [
      {
        categoryId: '1',
        expenseDate: '2026-01-03',
        amount: '400.00',
      },
      {
        categoryId: '2',
        expenseDate: '2026-02-03',
        amount: '2000.00',
      },
      {
        categoryId: '3',
        expenseDate: '2026-03-03',
        amount: '100.00',
      },
    ],
    imports: [
      { importedAt: new Date('2026-06-30T15:00:00.000Z') },
      { importedAt: new Date('2026-06-30T16:00:00.000Z') },
    ],
  };
}
