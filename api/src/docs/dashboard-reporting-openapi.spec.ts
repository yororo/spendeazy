import SwaggerParser from '@apidevtools/swagger-parser';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Dashboard reporting OpenAPI contract', () => {
  it('documents strict Monthly and Yearly report queries and drill-through filters', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    const path =
      document.paths['/api/v1/users/me/spaces/{spaceId}/reporting/dashboard'];
    expect(path?.get).toBeDefined();
    const parameters = path?.get?.parameters ?? [];
    expect(
      parameters.map((parameter) =>
        'name' in parameter ? parameter.name : null,
      ),
    ).toEqual(
      expect.arrayContaining(['view', 'endMonth', 'year', 'chartCategoryId']),
    );
    const chartFilter = parameters.find(
      (parameter) =>
        'name' in parameter && parameter.name === 'chartCategoryId',
    );
    expect(chartFilter).toMatchObject({
      in: 'query',
      schema: {
        type: 'array',
        items: { type: 'string', pattern: '^[1-9]\\d*$' },
      },
    });
    expect(
      document.components?.schemas?.DashboardReportResponseDto,
    ).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        range: { $ref: '#/components/schemas/DashboardRangeDto' },
        summary: { $ref: '#/components/schemas/DashboardSummaryDto' },
        monthlyExpenses: { type: 'array' },
        categoryExpenses: { type: 'array' },
        budgetChecks: { $ref: '#/components/schemas/DashboardBudgetChecksDto' },
      },
    });
    expect(
      document.components?.schemas?.DashboardMonthlyBudgetCheckDto,
    ).toMatchObject({
      properties: {
        expenseFilter: {
          nullable: true,
          allOf: [{ $ref: '#/components/schemas/DashboardExpenseFilterDto' }],
        },
      },
    });
  });
});
