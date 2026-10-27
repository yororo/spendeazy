import { Controller, Get, HttpStatus, Param, Query, Req } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';
import { DashboardReportService } from '../application/dashboard-report.service';
import { DashboardReportQueryDto } from './dashboard-report-query.dto';
import { DashboardReportResponseDto } from './dashboard-report-response.dto';

@Controller('users/me/spaces/:spaceId/reporting/dashboard')
@ApiTags('Dashboard reporting')
@ApiExtraModels(DashboardReportResponseDto)
@ApiParam({
  name: 'spaceId',
  description: 'Positive bigint Space identifier encoded as a string.',
  schema: {
    type: 'string',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  },
})
export class SpaceDashboardReportController {
  constructor(
    private readonly dashboardReportService: DashboardReportService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get the Monthly or Yearly Dashboard report for a Space.',
  })
  @ApiQuery({ name: 'view', required: false, enum: ['monthly', 'yearly'] })
  @ApiQuery({
    name: 'endMonth',
    required: false,
    description: 'Six-month view end month, in YYYY-MM format.',
    schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Calendar year for the Yearly view.',
    schema: { type: 'string', pattern: '^\\d{4}$' },
  })
  @ApiQuery({
    name: 'chartCategoryId',
    required: false,
    isArray: true,
    type: String,
    description: 'Repeat to select only Category chart points.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dashboard report.',
    type: DashboardReportResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getDashboardReport(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Query() query: DashboardReportQueryDto,
  ): Promise<DashboardReportResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return this.dashboardReportService.getDashboardReportInSpace(
      params.spaceId,
      query,
    );
  }
}
