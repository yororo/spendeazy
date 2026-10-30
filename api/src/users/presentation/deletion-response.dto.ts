import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ additionalProperties: false } as {
  name?: string;
  additionalProperties: boolean;
})
export class DeletionResponseDto {
  @ApiProperty({ enum: ['pending', 'completed'] })
  status!: 'pending' | 'completed';
}
