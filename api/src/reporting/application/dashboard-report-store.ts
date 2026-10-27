export const DASHBOARD_REPORT_STORE = Symbol('DASHBOARD_REPORT_STORE');

export interface DashboardReportQuery {
  readonly spaceId: string;
  readonly expenseFromDate: string;
  readonly expenseToDate: string;
  readonly importFromDate: string;
  readonly importToDateExclusive: string;
}

export interface DashboardReportCategory {
  readonly categoryId: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly iconKey: string;
  readonly colorKey: string | null;
  readonly budgetAmount: string | null;
  readonly budgetPeriod: 'monthly' | 'yearly' | null;
}

export interface DashboardReportExpense {
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amount: string;
}

export interface DashboardReportImport {
  readonly importedAt: Date;
}

export interface DashboardReportData {
  readonly categories: readonly DashboardReportCategory[];
  readonly expenses: readonly DashboardReportExpense[];
  readonly imports: readonly DashboardReportImport[];
}

export interface DashboardReportStore {
  readDashboardReport(
    query: DashboardReportQuery,
  ): Promise<DashboardReportData>;
}
