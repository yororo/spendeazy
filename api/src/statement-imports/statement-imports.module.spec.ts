import { StatementImportsModule } from './statement-imports.module';
import { SpaceStatementImportsController } from './presentation/space-statement-imports.controller';

describe('StatementImportsModule', () => {
  it('registers only explicit Space-scoped Statement Import routes', () => {
    expect(
      StatementImportsModule.register(false, { includeControllers: true })
        .controllers,
    ).toEqual([SpaceStatementImportsController]);
  });
});
