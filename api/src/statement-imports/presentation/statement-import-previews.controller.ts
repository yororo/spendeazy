import { ImportPreviewDto } from './import-preview.dto';
import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';
import { ConfirmationPayloadDto } from './confirmation-payload.dto';
import { ReviewedImportService } from '../application/reviewed-import.service';
@Controller('users/me/spaces/:spaceId/statement-import-previews')
@ApiTags('Statement imports')
export class StatementImportPreviewsController {
  constructor(private readonly imports: ReviewedImportService) {}
  @Post()
  @HttpCode(200)
  @ApiResponse({ status: 200, type: ImportPreviewDto })
  @ApiOperation({
    summary:
      'Preview advisory warnings for a complete reviewed Statement Import without writes.',
  })
  preview(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Body() input: ConfirmationPayloadDto,
  ) {
    return this.imports.preview(
      requireAuthenticatedUserId(request),
      params.spaceId,
      input,
    );
  }
}
