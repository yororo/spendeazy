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
import type {
  StatementImportHistoryRecord,
  StatementImportRecord,
} from '../application/statement-import-store';
import { StatementImportsService } from '../application/statement-imports.service';
import {
  CommitReviewedStatementImportDto,
  ReviewedStatementTransactionDto,
  StatementImportCollectionQueryDto,
  StatementImportParamsDto,
} from './statement-import.dto';
import {
  StatementImportHistoryPageResponseDto,
  StatementImportHistoryResponseDto,
  StatementImportResponseDto,
} from './statement-import-response.dto';

@Controller('users/me/statement-imports')
@ApiTags('Statement imports')
@ApiExtraModels(
  CommitReviewedStatementImportDto,
  ReviewedStatementTransactionDto,
  StatementImportCollectionQueryDto,
  StatementImportParamsDto,
  StatementImportResponseDto,
  StatementImportHistoryResponseDto,
  StatementImportHistoryPageResponseDto,
)
export class StatementImportsController {
  constructor(
    private readonly statementImportsService: StatementImportsService,
  ) {}

  @Get(':statementImportId')
  @ApiOperation({ summary: 'Get a statement import.' })
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
    @Param() params: StatementImportParamsDto,
  ): Promise<StatementImportResponseDto> {
    return toStatementImportResponse(
      await this.statementImportsService.getStatementImport(
        requireAuthenticatedUserId(request),
        params.statementImportId,
      ),
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List statement-import history in statement-date-descending, ID-descending keyset pages.',
    description:
      'Returns committed Statement imports owned by the authenticated User in statementDate descending, then Statement import ID descending order. fromDate and toDate are inclusive valid calendar-date filters and fromDate must be on or before toDate. pageSize must be between 1 and 100 and defaults to 20. The nextCursor is opaque, binds to the date filters, and must be reused with the same filters; page size is not part of the cursor. Unknown query parameters are rejected.',
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
    'NotAcceptableError',
    'InternalError',
  )
  async listStatementImports(
    @Req() request: AuthenticatedRequest,
    @Query() query: StatementImportCollectionQueryDto,
  ): Promise<StatementImportHistoryPageResponseDto> {
    const page = await this.statementImportsService.listStatementImports(
      requireAuthenticatedUserId(request),
      query,
    );
    return {
      items: page.items.map(toStatementImportHistoryResponse),
      nextCursor: page.nextCursor,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Commit an already parsed and reviewed statement atomically.',
    description:
      'Commits the reviewed Statement import and its Transactions as one operation. File names, bank names, card types, and Transaction descriptions are trimmed before storage; amounts are normalized to canonical decimal strings. Exact-file duplicates cannot be acknowledged, while probable duplicate signals require explicit acknowledgement. Client file hashes and internal matching values are never returned.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Statement import committed.',
    type: StatementImportResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Statement import.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/statement-imports/42`,
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
    @Body() input: CommitReviewedStatementImportDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StatementImportResponseDto> {
    const statementImport =
      await this.statementImportsService.commitReviewedStatementImport(
        requireAuthenticatedUserId(request),
        input,
      );
    response.status(HttpStatus.CREATED);
    response.setHeader('Location', statementImportLocation(statementImport.id));
    return toStatementImportResponse(statementImport);
  }
}

export type StatementImportResponse = StatementImportResponseDto;
export type StatementImportHistoryResponse = StatementImportHistoryResponseDto;
export type StatementImportHistoryPageResponse =
  StatementImportHistoryPageResponseDto;

export function toStatementImportResponse(
  statementImport: StatementImportResponseInput,
): StatementImportResponseDto {
  return {
    id: statementImport.id,
    fileName: statementImport.fileName,
    statementDate: statementImport.statementDate,
    bank: statementImport.bank,
    cardType: statementImport.cardType,
    importedAt: statementImport.importedAt.toISOString(),
  };
}

type StatementImportResponseInput = Pick<
  StatementImportRecord,
  'id' | 'fileName' | 'statementDate' | 'bank' | 'cardType' | 'importedAt'
>;

export function toStatementImportHistoryResponse(
  statementImport: StatementImportHistoryRecord,
): StatementImportHistoryResponseDto {
  return {
    ...toStatementImportResponse(statementImport),
    transactionCount: statementImport.transactionCount,
  };
}

function statementImportLocation(statementImportId: string): string {
  return `/${API_PREFIX}/users/me/statement-imports/${statementImportId}`;
}
