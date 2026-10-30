import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  PendingImportOperationDto,
  RejectedImportOperationDto,
} from './import-operation-status.dto';
import type { ImportOperationStatus } from '../application/import-confirmation-store';
import type { Response } from 'express';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReviewedImportService } from '../application/reviewed-import.service';
import {
  ConfirmationPayloadDto,
  CommittedImportResultDto,
} from './confirmation-payload.dto';
import { spaceStatementImportLocation } from './statement-import-response.mapper';

class SpaceImportOperationParamsDto extends SpaceParamsDto {
  @IsUUID()
  @ApiProperty({ type: String, format: 'uuid' })
  operationId!: string;
}

@Controller('users/me/spaces/:spaceId/statement-import-operations')
@ApiTags('Statement imports')
export class StatementImportOperationsController {
  constructor(private readonly imports: ReviewedImportService) {}

  @Get(':operationId')
  @Header('Cache-Control', 'no-store')
  @ApiExtraModels(
    CommittedImportResultDto,
    PendingImportOperationDto,
    RejectedImportOperationDto,
  )
  @ApiOperation({
    summary: 'Recover the original actor’s import confirmation outcome.',
    description:
      'Requires read authority in the original Space, including after archive. Terminal results are immutable. For known pending operations, nonblocking User → Space → operation locks reconcile orphaned metadata to IMPORT_OPERATION_NOT_COMMITTED and fence delayed executors. Never executes financial writes. Lock contention returns pending; no timestamp or deadline proves failure. Unknown/inaccessible operations return 404 and remain unresolved; no tombstone is created.',
  })
  @ApiResponse({
    status: 200,
    headers: {
      'Cache-Control': {
        schema: { type: 'string', enum: ['no-store'] },
        required: true,
      },
    },
    schema: {
      oneOf: [
        CommittedImportResultDto,
        PendingImportOperationDto,
        RejectedImportOperationDto,
      ].map((type) => ({ $ref: getSchemaPath(type) })),
      discriminator: {
        propertyName: 'status',
        mapping: {
          committed: getSchemaPath(CommittedImportResultDto),
          pending: getSchemaPath(PendingImportOperationDto),
          not_committed: getSchemaPath(RejectedImportOperationDto),
        },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'HttpError',
    'InternalError',
  )
  status(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceImportOperationParamsDto,
  ): Promise<ImportOperationStatus> {
    return this.imports.status(
      requireAuthenticatedUserId(request),
      params.spaceId,
      params.operationId,
    );
  }

  @Put(':operationId')
  @ApiOperation({
    summary:
      'Atomically confirm a complete reviewed import using a frozen operation UUID.',
    description:
      'Identity is bound to the authenticated actor and original Space. Waits for concurrent execution. Identical successful replay returns the immutable result, including after archive. Identical rejected replay retains the original failure, including IMPORT_OPERATION_NOT_COMMITTED after recovery fencing.',
  })
  @ApiResponse({
    status: 201,
    type: CommittedImportResultDto,
    description: 'First success.',
    headers: {
      Location: {
        required: true,
        schema: { type: 'string' },
        description: 'Canonical Statement Import URI.',
      },
    },
  })
  @ApiResponse({
    status: 200,
    type: CommittedImportResultDto,
    description: 'Identical successful replay.',
    headers: {
      Location: {
        required: true,
        schema: { type: 'string' },
        description: 'Original canonical Statement Import URI.',
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ImportOperationConflict',
    'NotAcceptableError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  async confirm(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceImportOperationParamsDto,
    @Body() input: ConfirmationPayloadDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CommittedImportResultDto> {
    const outcome = await this.imports.confirm(
      requireAuthenticatedUserId(request),
      params.spaceId,
      params.operationId,
      input,
    );
    response.status(outcome.replayed ? 200 : 201);
    response.setHeader(
      'Location',
      spaceStatementImportLocation(
        params.spaceId,
        outcome.result.statementImportId,
      ),
    );
    return outcome.result;
  }
}
