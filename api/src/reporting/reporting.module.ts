import { DynamicModule, Module } from '@nestjs/common';
import { MANILA_CLOCK, systemManilaClock } from '../http/manila-clock';
import { SpacesModule } from '../spaces/spaces.module';
import { DashboardReportService } from './application/dashboard-report.service';
import { DASHBOARD_REPORT_STORE } from './application/dashboard-report-store';
import { TypeOrmDashboardReportStore } from './infrastructure/typeorm-dashboard-report-store';
import { SpaceDashboardReportController } from './presentation/space-dashboard-report.controller';

const controllers = [SpaceDashboardReportController];

@Module({})
export class ReportingModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    if (!databaseIsConfigured) {
      if (!options.includeControllers) return { module: ReportingModule };
      return {
        module: ReportingModule,
        imports: [SpacesModule.register(false, options)],
        controllers,
        providers: [
          { provide: DASHBOARD_REPORT_STORE, useValue: {} },
          { provide: DashboardReportService, useValue: {} },
        ],
      };
    }
    return {
      module: ReportingModule,
      imports: [SpacesModule.register(true, options)],
      controllers,
      providers: [
        TypeOrmDashboardReportStore,
        { provide: MANILA_CLOCK, useValue: systemManilaClock },
        {
          provide: DASHBOARD_REPORT_STORE,
          useExisting: TypeOrmDashboardReportStore,
        },
        DashboardReportService,
      ],
    };
  }
}
