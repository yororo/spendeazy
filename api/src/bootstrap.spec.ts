import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  API_METHODS,
  API_PREFIX,
  MAX_REQUEST_BODY_SIZE,
} from './config/app-config';
import { configureApp } from './bootstrap';
import { ClerkAuthenticationGuard } from './authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from './authentication/provisioned-user.guard';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { JsonContractGuard } from './http/json-contract.guard';
import { exceptionRequestContext } from './logging/exception-logger';

describe('configureApp', () => {
  it('applies the versioned route, strict validation, body limit, and CORS policy', () => {
    const setGlobalPrefix = jest.fn();
    const use = jest.fn();
    const useGlobalPipes = jest.fn();
    const useGlobalFilters = jest.fn();
    const useGlobalGuards = jest.fn();
    const get = jest.fn().mockReturnValue({ canActivate: jest.fn() });
    const enableCors = jest.fn();
    const app = {
      setGlobalPrefix,
      use,
      useGlobalPipes,
      useGlobalFilters,
      useGlobalGuards,
      get,
      enableCors,
    } as unknown as INestApplication;

    configureApp(app, {
      environment: 'test',
      port: 3000,
      databaseUrl: undefined,
      corsOrigins: ['https://app.example.com'],
      clerkJwtKey: 'test-jwt-key',
      clerkSecretKey: 'test-secret-key',
      clerkAuthorizedParties: ['https://app.example.com'],
    });

    expect(setGlobalPrefix).toHaveBeenCalledWith(API_PREFIX, {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'docs-json', method: RequestMethod.GET },
        { path: 'docs-yaml', method: RequestMethod.GET },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'health', method: RequestMethod.HEAD },
        { path: 'docs-json', method: RequestMethod.HEAD },
        { path: 'docs-yaml', method: RequestMethod.HEAD },
        { path: 'docs', method: RequestMethod.HEAD },
      ],
    });
    expect(use).toHaveBeenCalledTimes(4);
    expect(use).toHaveBeenNthCalledWith(1, exceptionRequestContext);
    expect(useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(useGlobalFilters).toHaveBeenCalledWith(
      expect.any(ApiExceptionFilter),
    );
    expect(get).toHaveBeenCalledWith(ClerkAuthenticationGuard);
    expect(get).toHaveBeenCalledWith(ProvisionedUserGuard);
    expect(useGlobalGuards).toHaveBeenCalledWith(
      get.mock.results[0]?.value,
      get.mock.results[1]?.value,
      expect.any(JsonContractGuard),
    );
    expect(enableCors).toHaveBeenCalledWith({
      origin: ['https://app.example.com'],
      methods: [...API_METHODS],
      allowedHeaders: ['Content-Type', 'Authorization', 'If-Match'],
      exposedHeaders: ['Location', 'X-Request-ID'],
      credentials: false,
    });
    expect(MAX_REQUEST_BODY_SIZE).toBe(1024 * 1024);
  });
});
