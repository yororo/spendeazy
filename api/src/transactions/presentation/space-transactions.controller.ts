import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../config/app-config';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { RequestValidationError } from '../../http/request-validation-error';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { TransactionsService } from '../application/transactions.service';
import {
  CreateManualTransactionDto,
  TransactionCollectionQueryDto,
  UpdateManualTransactionDto,
  UpdateSpaceTransactionDto,
} from './transaction.dto';
import {
  ImportedTransactionHistoryResponseDto,
  ImportedTransactionResponseDto,
  ManualTransactionHistoryResponseDto,
  ManualTransactionResponseDto,
  TransactionHistoryPageResponseDto,
  TransactionActivityResponseDto,
} from './transaction-response.dto';
import {
  toManualTransactionResponse,
  toTransactionActivityResponse,
  toTransactionHistoryResponse,
  toTransactionResponse,
} from './transactions.controller';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';
import { SpaceTransactionParamsDto } from './space-transaction.dto';

@Controller('users/me/spaces/:spaceId/transactions')
@ApiTags('Transactions')
@ApiExtraModels(
  CreateManualTransactionDto,
  UpdateManualTransactionDto,
  UpdateSpaceTransactionDto,
  ManualTransactionResponseDto,
  ImportedTransactionResponseDto,
  ManualTransactionHistoryResponseDto,
  ImportedTransactionHistoryResponseDto,
  TransactionHistoryPageResponseDto,
  TransactionActivityResponseDto,
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
export class SpaceTransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a manual Transaction in an authorized Space.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Manual transaction created.',
    type: ManualTransactionResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Transaction.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/spaces/7/transactions/42`,
        },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'NotAcceptableError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  async createTransaction(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Body() input: CreateManualTransactionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ManualTransactionResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const transaction =
      await this.transactionsService.createManualTransactionInSpace(
        userId,
        params.spaceId,
        input,
      );
    response.status(HttpStatus.CREATED);
    response.setHeader(
      'Location',
      spaceTransactionLocation(params.spaceId, transaction.id),
    );
    return toManualTransactionResponse(transaction);
  }

  @Get()
  @ApiOperation({
    summary: 'List Transactions in an authorized Space.',
    description:
      'Returns manual and imported Transactions in the authorized Space in purchaseDate descending, then Transaction ID descending order. Filters and keyset cursors retain the same semantics as the personal collection.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction page.',
    type: TransactionHistoryPageResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async listTransactions(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Query() query: TransactionCollectionQueryDto,
  ): Promise<TransactionHistoryPageResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const page = await this.transactionsService.listTransactionsInSpace(
      params.spaceId,
      query,
    );
    return {
      items: page.items.map(toTransactionHistoryResponse),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':transactionId/activity')
  @ApiOperation({
    summary: 'List activity for a Transaction in an authorized Space.',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Positive bigint Transaction identifier encoded as a string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction activity events.',
    type: TransactionActivityResponseDto,
    isArray: true,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'NotFoundError',
    'InternalError',
  )
  async listTransactionActivity(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceTransactionParamsDto,
  ): Promise<TransactionActivityResponseDto[]> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const activity =
      await this.transactionsService.listTransactionActivityInSpace(
        params.spaceId,
        params.transactionId,
      );
    return activity.map(toTransactionActivityResponse);
  }

  @Get(':transactionId')
  @ApiOperation({ summary: 'Get a manual Transaction in an authorized Space.' })
  @ApiParam({
    name: 'transactionId',
    description: 'Positive bigint Transaction identifier encoded as a string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Manual transaction.',
    type: ManualTransactionResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getTransaction(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceTransactionParamsDto,
  ): Promise<ManualTransactionResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toManualTransactionResponse(
      await this.transactionsService.getManualTransactionInSpace(
        params.spaceId,
        params.transactionId,
      ),
    );
  }

  @Patch(':transactionId')
  @ApiOperation({
    summary:
      'Update a manual Transaction or recategorize an imported Transaction in an authorized Space.',
    description:
      'Manual Transactions may be patched with any supplied fields. Imported Transactions may only change categoryId; their statement facts are immutable. The required updatedAt body field rejects stale edits.',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Positive bigint Transaction identifier encoded as a string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction updated.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ManualTransactionResponseDto) },
        { $ref: getSchemaPath(ImportedTransactionResponseDto) },
      ],
      discriminator: {
        propertyName: 'source',
        mapping: {
          manual: getSchemaPath(ManualTransactionResponseDto),
          imported: getSchemaPath(ImportedTransactionResponseDto),
        },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'NotAcceptableError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  async updateTransaction(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceTransactionParamsDto,
    @Body() input: UpdateSpaceTransactionDto,
  ) {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const updatedAt = requireScopedTransactionVersion(input.updatedAt);
    return toTransactionResponse(
      await this.transactionsService.updateTransactionInSpace(
        params.spaceId,
        params.transactionId,
        toTransactionUpdate({ ...input, updatedAt }),
      ),
    );
  }

  @Delete(':transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a manual Transaction in an authorized Space.',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Positive bigint Transaction identifier encoded as a string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Manual transaction deleted.',
  })
  @ApiHeader({
    name: 'if-match',
    required: true,
    description:
      'Transaction updatedAt timestamp from the last read. The delete is rejected when it is stale.',
    schema: { type: 'string' },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'NotAcceptableError',
    'InternalError',
  )
  async deleteTransaction(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceTransactionParamsDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const expectedUpdatedAt = requireScopedTransactionVersion(
      normalizeIfMatch(ifMatch),
      '/headers/if-match',
    );
    await this.transactionsService.deleteManualTransactionInSpace(
      params.spaceId,
      params.transactionId,
      expectedUpdatedAt,
    );
  }
}

function toTransactionUpdate(
  input: UpdateManualTransactionDto,
): Parameters<TransactionsService['updateTransactionInSpace']>[2] {
  const { updatedAt, ...changes } = input;
  return {
    ...changes,
    ...(updatedAt === undefined ? {} : { expectedUpdatedAt: updatedAt }),
  };
}

function normalizeIfMatch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}

function requireScopedTransactionVersion(
  value: string | undefined,
  field = '/updatedAt',
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new RequestValidationError([
      {
        field,
        code: 'required',
        message: 'A transaction version is required for Space writes.',
      },
    ]);
  }

  return normalized;
}

function spaceTransactionLocation(
  spaceId: string,
  transactionId: string,
): string {
  return `/${API_PREFIX}/users/me/spaces/${spaceId}/transactions/${transactionId}`;
}
