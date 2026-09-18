import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ additionalProperties: false } as {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
})
export class HealthResponseDto {
  @ApiProperty({
    description: 'Whether the application is ready to serve requests.',
    enum: ['ok', 'error'],
    example: 'ok',
  })
  status!: 'ok' | 'error';

  @ApiProperty({
    description: 'Readiness state of the database dependency.',
    enum: ['ready', 'unavailable'],
    example: 'ready',
  })
  database!: 'ready' | 'unavailable';
}
