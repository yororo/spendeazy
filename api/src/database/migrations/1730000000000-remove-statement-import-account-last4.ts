import {
  TableColumn,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';

export class RemoveStatementImportAccountLast41730000000000 implements MigrationInterface {
  name = 'RemoveStatementImportAccountLast41730000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('statement_imports', 'account_last4');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'statement_imports',
      new TableColumn({
        name: 'account_last4',
        type: 'char',
        length: '4',
        isNullable: true,
      }),
    );
  }
}
