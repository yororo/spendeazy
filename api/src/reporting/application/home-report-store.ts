export const HOME_REPORT_STORE = Symbol('HOME_REPORT_STORE');

export interface HomeReportQuery {
  readonly spaceId: string;
  readonly expenseFromDate: string;
  readonly expenseToDate: string;
  readonly importFromDate: string;
  readonly importToDateExclusive: string;
}

export interface HomeReportCategory {
  readonly categoryId: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly iconKey: string;
  readonly colorKey: string | null;
  readonly budgetAmount: string | null;
  readonly budgetPeriod: 'monthly' | 'yearly' | null;
}

export interface HomeReportExpense {
  readonly categoryId: string;
  readonly expenseDate: string;
  readonly amount: string;
}

export interface HomeReportImport {
  readonly importedAt: Date;
}

export interface HomeReportData {
  readonly categories: readonly HomeReportCategory[];
  readonly expenses: readonly HomeReportExpense[];
  readonly imports: readonly HomeReportImport[];
}

export interface HomeReportStore {
  readHomeReport(query: HomeReportQuery): Promise<HomeReportData>;
}
