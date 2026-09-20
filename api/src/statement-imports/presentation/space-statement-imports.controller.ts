import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../config/app-config';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';
import { StatementImportsService } from '../application/statement-imports.service';
import {
  CommitReviewedStatementImportDto,
  ReviewedStatementTransactionDto,
  StatementImportCollectionQueryDto,
} from './statement-import.dto';
import {
  StatementImportHistoryPageResponseDto,
  StatementImportHistoryResponseDto,
  StatementImportResponseDto,
} from './statement-import-response.dto';
import {
  spaceStatementImportLocation,
  toStatementImportHistoryResponse,
  toStatementImportResponse,
} from './statement-imports.controller';
import { SpaceStatementImportParamsDto } from './space-statement-import.dto';

@Controller('users/me/spaces/:spaceId/statement-imports')
@ApiTags('Statement imports')
@ApiExtraModels(
  CommitReviewedStatementImportDto,
  ReviewedStatementTransactionDto,
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
    type: StatementImportResponseDto,
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
  ): Promise<StatementImportResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toStatementImportResponse(
      await this.statementImportsService.getStatementImportInSpace(
        params.spaceId,
        params.statementImportId,
      ),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List Statement Import history in an authorized Space.',
    description:
      'Returns committed Statement Imports in the authorized Space in statementDate descending, then Statement Import ID descending order. Exact-file and probable-duplicate state is scoped to this destination Space.',
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

  @Post()
  @ApiOperation({
    summary: 'Commit a reviewed Statement Import into an authorized Space.',
    description:
      'Revalidates reviewed Categories and duplicate state for the destination Space, then commits the Statement Import and all selected Transactions atomically. The importing User is retained as the Statement Import and Transaction contributor.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Statement import committed.',
    type: StatementImportResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Statement Import.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/spaces/7/statement-imports/42`,
        },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ProbableDuplicateConflict',
    'NotAcceptableError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  async commitReviewedStatementImport(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Body() input: CommitReviewedStatementImportDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StatementImportResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const statementImport =
      await this.statementImportsService.commitReviewedStatementImportInSpace(
        userId,
        params.spaceId,
        input,
      );
    response.status(HttpStatus.CREATED);
    response.setHeader(
      'Location',
      spaceStatementImportLocation(params.spaceId, statementImport.id),
    );
    return toStatementImportResponse(statementImport);
  }
}
