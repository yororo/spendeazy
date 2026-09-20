import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { UnauthenticatedError } from '../authentication/authentication-errors';
import {
  ApplicationError,
  type ErrorDetail,
} from '../errors/application-error';
import {
  CATEGORY_INACTIVE_CODE,
  CATEGORY_NAME_ALREADY_EXISTS_CODE,
  CATEGORY_NOT_FOUND_CODE,
} from '../categories/application/category-errors';
import { BUDGET_NOT_FOUND_CODE } from '../categories/application/budget-errors';
import {
  CATEGORY_RULE_NOT_FOUND_CODE,
  CATEGORY_RULE_PATTERN_ALREADY_EXISTS_CODE,
} from '../category-rules/application/category-rule-errors';
import {
  CONFLICT_CODE,
  HTTP_ERROR_CODE,
  INTERNAL_ERROR_CODE,
  INVALID_JSON_CODE,
  NOT_ACCEPTABLE_CODE,
  RESOURCE_NOT_FOUND_CODE,
  ROUTE_NOT_FOUND_CODE,
  SERVICE_UNAVAILABLE_CODE,
  STALE_EDIT_CODE,
  UNAUTHENTICATED_CODE,
  UNSUPPORTED_MEDIA_TYPE_CODE,
  VALIDATION_FAILED_CODE,
  USER_NOT_FOUND_CODE,
  USER_NOT_PROVISIONED_CODE,
  SPACE_NOT_FOUND_CODE,
  SPACE_NOT_WRITABLE_CODE,
} from '../errors/application-error-codes';
import { TRANSACTION_NOT_FOUND_CODE } from '../transactions/application/transaction-errors';
import { IMPORTED_TRANSACTION_IMMUTABLE_CODE } from '../transactions/application/transaction-errors';
import {
  STATEMENT_IMPORT_FILE_ALREADY_EXISTS_CODE,
  STATEMENT_IMPORT_FILE_HASH_INVALID_CODE,
  STATEMENT_IMPORT_NOT_FOUND_CODE,
  STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE,
} from '../statement-imports/application/statement-import-errors';
import {
  POSTGRES_CHECK_VIOLATION,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INVALID_TEXT_REPRESENTATION,
  POSTGRES_NOT_NULL_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from '../database/database-error-codes';
import { USER_EMAIL_ALREADY_EXISTS_CODE } from '../users/application/user-errors';
import {
  exceptionLogger,
  type ExceptionReporter,
} from '../logging/exception-logger';

interface ErrorResponse {
  code: string;
  message: string;
  details: ErrorDetail[];
}

interface ErrorEnvelope {
  error: ErrorResponse;
}

const HTTP_EXCEPTION_CODES: Readonly<Record<number, string>> = {
  [HttpStatus.UNAUTHORIZED]: UNAUTHENTICATED_CODE,
  [HttpStatus.NOT_FOUND]: ROUTE_NOT_FOUND_CODE,
  [HttpStatus.NOT_ACCEPTABLE]: NOT_ACCEPTABLE_CODE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: UNSUPPORTED_MEDIA_TYPE_CODE,
  [HttpStatus.PAYLOAD_TOO_LARGE]: HTTP_ERROR_CODE,
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: ExceptionReporter = exceptionLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mappedError = mapException(exception);
    if (mappedError.status >= 500) {
      this.logger.report('request_failed', exception, mappedError.status);
    }
    if (exception instanceof UnauthenticatedError) {
      response.setHeader?.('WWW-Authenticate', 'Bearer');
    }
    response.status(mappedError.status).json(mappedError.body);
  }
}

function mapException(exception: unknown): {
  status: number;
  body: ErrorEnvelope;
} {
  if (exception instanceof ApplicationError) {
    const status = applicationErrorStatus(exception.code);
    if (status === Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      return internalServerError();
    }

    return {
      status,
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      },
    };
  }

  if (exception instanceof HttpException) {
    if (isMalformedJsonHttpException(exception)) {
      return clientError(
        HttpStatus.BAD_REQUEST,
        INVALID_JSON_CODE,
        'Request body must be valid JSON',
      );
    }

    const status = exception.getStatus();
    return {
      status,
      body: {
        error: {
          code: httpExceptionCode(status),
          message: 'Request failed',
          details: [],
        },
      },
    };
  }

  if (isMalformedJsonError(exception)) {
    return clientError(
      HttpStatus.BAD_REQUEST,
      INVALID_JSON_CODE,
      'Request body must be valid JSON',
    );
  }

  if (isBodyParserLimitError(exception)) {
    return clientError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      HTTP_ERROR_CODE,
      'Request failed',
    );
  }

  if (exception instanceof QueryFailedError) {
    return mapDatabaseException(exception);
  }

  return internalServerError();
}

function httpExceptionCode(status: number): string {
  return HTTP_EXCEPTION_CODES[status] ?? HTTP_ERROR_CODE;
}

function isMalformedJsonError(exception: unknown): boolean {
  if (!(exception instanceof SyntaxError)) {
    return false;
  }

  const parserError = exception as SyntaxError & { type?: unknown };
  return parserError.type === 'entity.parse.failed';
}

function isMalformedJsonHttpException(exception: HttpException): boolean {
  if (exception.getStatus() !== Number(HttpStatus.BAD_REQUEST)) {
    return false;
  }

  const response = exception.getResponse();
  const message =
    typeof response === 'string'
      ? response
      : isRecord(response)
        ? response.message
        : undefined;

  return (
    typeof message === 'string' &&
    /^Unexpected (?:end of JSON input|token\b.*(?:in JSON|is not valid JSON)|non-whitespace character after JSON\b)/u.test(
      message,
    )
  );
}

function isBodyParserLimitError(exception: unknown): boolean {
  if (!(exception instanceof Error)) {
    return false;
  }

  const parserError = exception as Error & { type?: unknown };
  return parserError.type === 'entity.too.large';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapDatabaseException(exception: { driverError: unknown }): {
  status: number;
  body: ErrorEnvelope;
} {
  const driverError = exception.driverError as { code?: unknown };
  const databaseCode =
    typeof driverError.code === 'string' ? driverError.code : undefined;
  switch (databaseCode) {
    case POSTGRES_UNIQUE_VIOLATION:
      return clientError(
        HttpStatus.CONFLICT,
        CONFLICT_CODE,
        'Request conflicts with existing data',
      );
    case POSTGRES_FOREIGN_KEY_VIOLATION:
      return clientError(
        HttpStatus.NOT_FOUND,
        RESOURCE_NOT_FOUND_CODE,
        'A referenced resource was not found',
      );
    case POSTGRES_CHECK_VIOLATION:
    case POSTGRES_INVALID_TEXT_REPRESENTATION:
    case POSTGRES_NOT_NULL_VIOLATION:
      return clientError(
        HttpStatus.BAD_REQUEST,
        VALIDATION_FAILED_CODE,
        'The request contains invalid fields.',
      );
    default:
      return internalServerError();
  }
}

function clientError(
  status: HttpStatus,
  code: string,
  message: string,
): { status: number; body: ErrorEnvelope } {
  return {
    status,
    body: { error: { code, message, details: [] } },
  };
}

function internalServerError(): {
  status: number;
  body: ErrorEnvelope;
} {
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      error: {
        code: INTERNAL_ERROR_CODE,
        message: 'An internal error occurred',
        details: [],
      },
    },
  };
}

function applicationErrorStatus(code: string): number {
  switch (code) {
    case VALIDATION_FAILED_CODE:
    case INVALID_JSON_CODE:
      return HttpStatus.BAD_REQUEST;
    case NOT_ACCEPTABLE_CODE:
      return HttpStatus.NOT_ACCEPTABLE;
    case UNAUTHENTICATED_CODE:
      return HttpStatus.UNAUTHORIZED;
    case USER_NOT_PROVISIONED_CODE:
      return HttpStatus.FORBIDDEN;
    case SERVICE_UNAVAILABLE_CODE:
      return HttpStatus.SERVICE_UNAVAILABLE;
    case UNSUPPORTED_MEDIA_TYPE_CODE:
      return HttpStatus.UNSUPPORTED_MEDIA_TYPE;
    case STATEMENT_IMPORT_FILE_HASH_INVALID_CODE:
      return HttpStatus.BAD_REQUEST;
    case USER_EMAIL_ALREADY_EXISTS_CODE:
      return HttpStatus.CONFLICT;
    case USER_NOT_FOUND_CODE:
    case SPACE_NOT_FOUND_CODE:
    case CATEGORY_NOT_FOUND_CODE:
    case BUDGET_NOT_FOUND_CODE:
    case STATEMENT_IMPORT_NOT_FOUND_CODE:
    case TRANSACTION_NOT_FOUND_CODE:
      return HttpStatus.NOT_FOUND;
    case CATEGORY_NAME_ALREADY_EXISTS_CODE:
    case STALE_EDIT_CODE:
    case CATEGORY_RULE_PATTERN_ALREADY_EXISTS_CODE:
    case CATEGORY_INACTIVE_CODE:
    case STATEMENT_IMPORT_FILE_ALREADY_EXISTS_CODE:
    case STATEMENT_IMPORT_PROBABLE_DUPLICATES_CODE:
    case IMPORTED_TRANSACTION_IMMUTABLE_CODE:
      return HttpStatus.CONFLICT;
    case CATEGORY_RULE_NOT_FOUND_CODE:
      return HttpStatus.NOT_FOUND;
    case SPACE_NOT_WRITABLE_CODE:
      return HttpStatus.FORBIDDEN;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
