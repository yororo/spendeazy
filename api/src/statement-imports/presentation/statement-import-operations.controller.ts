import { Body, Controller, Param, Put, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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

  @Put(':operationId')
  @ApiOperation({
    summary:
      'Atomically confirm a complete reviewed import using a frozen operation UUID.',
    description:
      'Identity is bound to the authenticated actor and original Space. Waits for concurrent execution. Identical successful replay returns the immutable result, including after archive. Operation status recovery belongs to #154.',
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
