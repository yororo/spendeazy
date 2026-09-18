import {
  Body,
  Controller,
  Delete,
  Get,
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
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import type {
  ManualTransactionRecord,
  TransactionRecord,
} from '../application/transaction-store';
import { TransactionsService } from '../application/transactions.service';
import {
  CreateManualTransactionDto,
  TransactionCollectionQueryDto,
  TransactionParamsDto,
  UpdateManualTransactionDto,
} from './transaction.dto';
import {
  ImportedTransactionHistoryResponseDto,
  ImportedTransactionResponseDto,
  ManualTransactionHistoryResponseDto,
  ManualTransactionResponseDto,
  TransactionHistoryPageResponseDto,
} from './transaction-response.dto';

@Controller('users/me/transactions')
@ApiTags('Transactions')
@ApiExtraModels(
  CreateManualTransactionDto,
  UpdateManualTransactionDto,
  ManualTransactionResponseDto,
  ImportedTransactionResponseDto,
  ManualTransactionHistoryResponseDto,
  ImportedTransactionHistoryResponseDto,
  TransactionHistoryPageResponseDto,
)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a manual transaction.' })
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
          example: `/${API_PREFIX}/users/me/transactions/42`,
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
  async createManualTransaction(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateManualTransactionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ManualTransactionResponseDto> {
    const transaction = await this.transactionsService.createManualTransaction(
      requireAuthenticatedUserId(request),
      input,
    );
    response.status(HttpStatus.CREATED);
    response.setHeader('Location', transactionLocation(transaction.id));
    return toManualTransactionResponse(transaction);
  }

  @Get()
  @ApiOperation({
    summary:
      'List filtered transactions in date-descending, ID-descending keyset pages.',
    description:
      'Returns manual and imported Transactions owned by the authenticated User in purchaseDate descending, then Transaction ID descending order. fromDate and toDate are inclusive valid calendar-date filters and fromDate must be on or before toDate. pageSize must be between 1 and 100 and defaults to 20. The nextCursor is opaque, binds to every filter except pageSize, and must be reused with the same filters. Unknown query parameters are rejected.',
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
    'NotAcceptableError',
    'InternalError',
  )
  async listTransactions(
    @Req() request: AuthenticatedRequest,
    @Query() query: TransactionCollectionQueryDto,
  ): Promise<TransactionHistoryPageResponseDto> {
    const page = await this.transactionsService.listTransactions(
      requireAuthenticatedUserId(request),
      query,
    );
    return {
      items: page.items.map(toTransactionHistoryResponse),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':transactionId')
  @ApiOperation({ summary: 'Get a manual transaction.' })
  @ApiParam({
    name: 'transactionId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
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
    'NotAcceptableError',
    'InternalError',
    'NotFoundError',
  )
  async getManualTransaction(
    @Req() request: AuthenticatedRequest,
    @Param() params: TransactionParamsDto,
  ): Promise<ManualTransactionResponseDto> {
    return toManualTransactionResponse(
      await this.transactionsService.getManualTransaction(
        requireAuthenticatedUserId(request),
        params.transactionId,
      ),
    );
  }

  @Patch(':transactionId')
  @ApiOperation({
    summary:
      'Update a manual transaction or recategorize an imported transaction.',
    description:
      'Manual Transactions may be patched with any supplied fields. Imported Transactions may only change categoryId; their statement facts are immutable and any other field causes a 409 Conflict.',
  })
  @ApiParam({
    name: 'transactionId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
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
    @Param() params: TransactionParamsDto,
    @Body() input: UpdateManualTransactionDto,
  ): Promise<TransactionResponse> {
    return toTransactionResponse(
      await this.transactionsService.updateTransaction(
        requireAuthenticatedUserId(request),
        params.transactionId,
        input,
      ),
    );
  }

  @Delete(':transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a manual transaction.' })
  @ApiParam({
    name: 'transactionId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
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
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'InternalError',
    'NotFoundError',
  )
  async deleteManualTransaction(
    @Req() request: AuthenticatedRequest,
    @Param() params: TransactionParamsDto,
  ): Promise<void> {
    await this.transactionsService.deleteManualTransaction(
      requireAuthenticatedUserId(request),
      params.transactionId,
    );
  }
}

export type TransactionResponse =
  ManualTransactionResponseDto | ImportedTransactionResponseDto;

export type TransactionHistoryResponse =
  ManualTransactionHistoryResponseDto | ImportedTransactionHistoryResponseDto;

export type TransactionHistoryPageResponse = TransactionHistoryPageResponseDto;

type TransactionResponseInput = Pick<
  TransactionRecord,
  | 'id'
  | 'categoryId'
  | 'purchaseDate'
  | 'description'
  | 'amount'
  | 'source'
  | 'createdAt'
  | 'updatedAt'
>;

type TransactionResponseFields = Omit<ManualTransactionResponseDto, 'source'>;

export function toTransactionResponse(
  transaction: TransactionResponseInput,
): TransactionResponse {
  const response = toTransactionResponseFields(transaction);

  return transaction.source === 'manual'
    ? { ...response, source: 'manual' }
    : { ...response, source: 'imported' };
}

function toManualTransactionResponse(
  transaction: ManualTransactionRecord,
): ManualTransactionResponseDto {
  return {
    ...toTransactionResponseFields(transaction),
    source: 'manual',
  };
}

export function toTransactionHistoryResponse(
  transaction: TransactionRecord,
): TransactionHistoryResponse {
  const response = toTransactionResponseFields(transaction);

  if (transaction.source === 'manual') {
    return { ...response, source: 'manual', statementImportId: null };
  }

  if (transaction.statementImportId === null) {
    throw new Error('Imported Transactions must reference a Statement import');
  }

  return {
    ...response,
    source: 'imported',
    statementImportId: transaction.statementImportId,
  };
}

function toTransactionResponseFields(
  transaction: TransactionResponseInput,
): TransactionResponseFields {
  return {
    id: transaction.id,
    categoryId: transaction.categoryId,
    purchaseDate: transaction.purchaseDate,
    description: transaction.description,
    amount: transaction.amount,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

function transactionLocation(transactionId: string): string {
  return `/${API_PREFIX}/users/me/transactions/${transactionId}`;
}
