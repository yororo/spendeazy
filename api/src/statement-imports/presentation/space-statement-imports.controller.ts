import { ReviewedImportService } from '../application/reviewed-import.service';
import { StatementImportDetailResponseDto } from './statement-import-detail.dto';
import { Controller, Get, HttpStatus, Param, Query, Req } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
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
import { StatementImportsService } from '../application/statement-imports.service';
import { StatementImportCollectionQueryDto } from './statement-import.dto';
import {
  StatementImportHistoryPageResponseDto,
  StatementImportHistoryResponseDto,
  StatementImportResponseDto,
} from './statement-import-response.dto';
import {
  toStatementImportHistoryResponse,
  toStatementImportResponse,
} from './statement-import-response.mapper';
import { SpaceStatementImportParamsDto } from './space-statement-import.dto';

@Controller('users/me/spaces/:spaceId/statement-imports')
@ApiTags('Statement imports')
@ApiExtraModels(
  StatementImportCollectionQueryDto,
  SpaceStatementImportParamsDto,
  StatementImportResponseDto,
  StatementImportHistoryResponseDto,
  StatementImportHistoryPageResponseDto,
)
@ApiParam({
  name: 'spaceId',
  description: 'Positive bigint Space identifier encoded as a string.',
  schema: {
    type: 'string',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  },
})
export class SpaceStatementImportsController {
  constructor(
    private readonly statementImportsService: StatementImportsService,
    private readonly spaceAccessService: SpaceAccessService,
    private readonly reviewedImports: ReviewedImportService,
  ) {}

  @Get(':statementImportId')
  @ApiOperation({
    summary: 'Get a Statement Import in an authorized Space.',
  })
  @ApiParam({
    name: 'statementImportId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statement import.',
    type: StatementImportDetailResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getStatementImport(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceStatementImportParamsDto,
  ): Promise<StatementImportDetailResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const statementImport =
      await this.statementImportsService.getStatementImportInSpace(
        params.spaceId,
        params.statementImportId,
      );
    return {
      ...toStatementImportResponse(statementImport),
      confirmation: statementImport.confirmation ?? null,
      rows: await this.reviewedImports.evidenceRows(
        userId,
        params.spaceId,
        params.statementImportId,
      ),
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List Statement Import history in an authorized Space.',
    description:
      'Returns committed Statement Imports in the authorized Space in confirmation-time (importedAt) descending, then Statement Import ID descending order. Inclusive fromDate and toDate filters use the confirmation date in Asia/Manila. The cursor is bound to those filters.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statement-import history page.',
    type: StatementImportHistoryPageResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async listStatementImports(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Query() query: StatementImportCollectionQueryDto,
  ): Promise<StatementImportHistoryPageResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const page = await this.statementImportsService.listStatementImportsInSpace(
      params.spaceId,
      query,
    );
    return {
      items: page.items.map(toStatementImportHistoryResponse),
      nextCursor: page.nextCursor,
    };
  }
}
