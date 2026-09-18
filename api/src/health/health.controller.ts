import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DATABASE_READINESS } from './database-readiness';
import type { DatabaseReadiness } from './database-readiness';
import { HealthResponseDto } from './health-response.dto';
import { exceptionLogger } from '../logging/exception-logger';

@Controller('health')
@ApiTags('Health')
@ApiExtraModels(HealthResponseDto)
export class HealthController {
  constructor(
    @Inject(DATABASE_READINESS)
    private readonly databaseReadiness: DatabaseReadiness,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Check database readiness.',
    security: [],
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Database is ready.',
    schema: { $ref: getSchemaPath(HealthResponseDto) },
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Database is unavailable.',
    schema: { $ref: getSchemaPath(HealthResponseDto) },
  })
  async getHealth(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponseDto> {
    let databaseIsReady = false;

    try {
      databaseIsReady = await this.databaseReadiness.isReady();
    } catch (error: unknown) {
      exceptionLogger.report('database_readiness_failed', error);
      databaseIsReady = false;
    }

    if (databaseIsReady) {
      response.status(HttpStatus.OK);
      return { status: 'ok', database: 'ready' };
    }

    response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: 'error', database: 'unavailable' };
  }
}
