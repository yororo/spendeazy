import { DynamicModule, Module } from '@nestjs/common';
import { MANILA_CLOCK, systemManilaClock } from '../http/manila-clock';
import { SpacesModule } from '../spaces/spaces.module';
import { HomeReportService } from './application/home-report.service';
import { HOME_REPORT_STORE } from './application/home-report-store';
import { TypeOrmHomeReportStore } from './infrastructure/typeorm-home-report-store';
import { SpaceHomeReportController } from './presentation/space-home-report.controller';

const controllers = [SpaceHomeReportController];

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
          { provide: HOME_REPORT_STORE, useValue: {} },
          { provide: HomeReportService, useValue: {} },
        ],
      };
    }
    return {
      module: ReportingModule,
      imports: [SpacesModule.register(true, options)],
      controllers,
      providers: [
        TypeOrmHomeReportStore,
        { provide: MANILA_CLOCK, useValue: systemManilaClock },
        {
          provide: HOME_REPORT_STORE,
          useExisting: TypeOrmHomeReportStore,
        },
        HomeReportService,
      ],
    };
  }
}
