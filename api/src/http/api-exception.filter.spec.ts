import {
  BadRequestException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ApiExceptionFilter } from './api-exception.filter';
import { UserEmailConflictError } from '../users/application/user-errors';
import { CategoryNotFoundError } from '../categories/application/category-errors';
import { BudgetNotFoundError } from '../categories/application/budget-errors';
import { CategoryRulePatternConflictError } from '../category-rules/application/category-rule-errors';
import {
  StatementImportNotFoundError,
  StatementImportProbableDuplicatesError,
} from '../statement-imports/application/statement-import-errors';
import { UnauthenticatedError } from '../authentication/authentication-errors';
import { StaleEditError } from '../errors/application-error';

describe('ApiExceptionFilter', () => {
  it('logs server failures once and leaves expected client failures silent', () => {
    const logger = { report: jest.fn() };
    const filter = new ApiExceptionFilter(logger);
    const response = responseDouble();
    for (const error of [
      new BadRequestException(),
      new UnauthenticatedError(),
      new CategoryNotFoundError(),
      new UserEmailConflictError(),
    ]) {
      filter.catch(error, httpHost(response));
    }
    expect(logger.report).not.toHaveBeenCalled();
    const unexpected = new Error('secret');
    const unavailable = new ServiceUnavailableException('secret');
    filter.catch(unexpected, httpHost(response));
    filter.catch(unavailable, httpHost(response));
    expect(logger.report.mock.calls).toEqual([
      ['request_failed', unexpected, 500],
      ['request_failed', unavailable, 503],
    ]);
  });
  it('maps known application errors to stable client responses', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new UserEmailConflictError(), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email is already in use',
        details: [
          {
            field: '/email',
            code: 'not_unique',
            message: 'Email is already in use',
          },
        ],
      },
    });
  });

  it('maps unauthenticated requests without exposing token verification details', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new UnauthenticatedError(), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer',
    );
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        details: [],
      },
    });
  });

  it('hides infrastructure details from unexpected errors', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new Error('password=secret SQL SELECT 1'), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        details: [],
      },
    });
  });

  it('maps a missing category to a stable not-found response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new CategoryNotFoundError(), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category was not found',
        details: [],
      },
    });
  });

  it('maps a duplicate category rule pattern to a stable conflict response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new CategoryRulePatternConflictError(), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS',
        message: 'Category rule pattern is already in use',
        details: [
          {
            field: '/pattern',
            code: 'not_unique',
            message: 'Category rule pattern is already in use',
          },
        ],
      },
    });
  });

  it('maps stale edits to a reloadable conflict response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new StaleEditError(), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'STALE_EDIT',
        message:
          'This resource changed elsewhere. Reload and review your edits before saving.',
        details: [
          {
            field: '/updatedAt',
            code: 'incompatible',
            message:
              'The resource changed elsewhere. Reload and review your edits before saving.',
          },
        ],
      },
    });
  });

  it('maps a missing budget to a stable not-found response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new BudgetNotFoundError(), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'BUDGET_NOT_FOUND',
        message: 'Budget was not found',
        details: [],
      },
    });
  });

  it('maps a missing statement import to a stable not-found response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(new StatementImportNotFoundError(), httpHost(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'STATEMENT_IMPORT_NOT_FOUND',
        message: 'Statement import was not found',
        details: [],
      },
    });
  });

  it('maps probable duplicate groups to a stable conflict response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(
      new StatementImportProbableDuplicatesError([
        {
          fingerprint: 'internal-fingerprint',
          incomingTransactionIndexes: [0, 2],
          committedMatches: [{ id: '12' }],
        },
      ]),
      httpHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'STATEMENT_IMPORT_PROBABLE_DUPLICATES',
        message:
          'Probable duplicate imported transactions require acknowledgement',
        details: [
          {
            field: '/transactions/0',
            code: 'probable_duplicate',
            message: 'The reviewed transaction has a probable duplicate',
            transactionIndexes: [0, 2],
            committedTransactionIds: ['12'],
          },
        ],
      },
    });
  });

  it('maps known database conflicts without exposing SQL or constraint names', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(
      new QueryFailedError('INSERT INTO budgets', [], {
        code: '23505',
        constraint: 'ux_budgets_category',
        detail: 'Key (category_id)=(42) already exists.',
      }),
      httpHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'CONFLICT',
        message: 'Request conflicts with existing data',
        details: [],
      },
    });
  });

  it('maps known database references to a generic not-found response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(
      new QueryFailedError('INSERT INTO transactions', [], {
        code: '23503',
        constraint: 'fk_transactions_category_user',
        detail: 'Key is not present in table categories.',
      }),
      httpHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'A referenced resource was not found',
        details: [],
      },
    });
  });

  it('maps malformed JSON to a stable validation response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();
    const parseError = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed',
    });

    filter.catch(parseError, httpHost(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
        details: [],
      },
    });
  });

  it('maps Nest-wrapped malformed JSON to the same stable validation response', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(
      new BadRequestException('Unexpected end of JSON input'),
      httpHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
        details: [],
      },
    });
  });

  it('does not classify unrelated JSON bad-request messages as parse failures', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();

    filter.catch(
      new BadRequestException('JSON schema validation failed'),
      httpHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'HTTP_ERROR',
        message: 'Request failed',
        details: [],
      },
    });
  });

  it('maps oversized request bodies to a generic payload error', () => {
    const response = responseDouble();
    const filter = new ApiExceptionFilter();
    const limitError = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
    });

    filter.catch(limitError, httpHost(response));

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'HTTP_ERROR',
        message: 'Request failed',
        details: [],
      },
    });
  });
});

function responseDouble() {
  const response = {
    status: jest.fn(),
    setHeader: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

function httpHost(response: ReturnType<typeof responseDouble>): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}
