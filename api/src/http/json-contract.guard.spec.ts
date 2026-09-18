import type { ExecutionContext } from '@nestjs/common';
import { JsonContractError, JsonContractGuard } from './json-contract.guard';

describe('JsonContractGuard', () => {
  it('accepts JSON requests with omitted or wildcard Accept headers', () => {
    const guard = new JsonContractGuard();

    expect(
      guard.canActivate(httpContext({ method: 'GET', path: '/api/v1/users' })),
    ).toBe(true);
    expect(
      guard.canActivate(
        httpContext({
          method: 'POST',
          path: '/api/v1/users',
          headers: { accept: '*/*', 'content-type': 'application/json' },
        }),
      ),
    ).toBe(true);
  });

  it('honors quality parameters with optional whitespace', () => {
    const guard = new JsonContractGuard();

    expect(
      guard.canActivate(
        httpContext({
          method: 'GET',
          path: '/api/v1/users',
          headers: { accept: 'text/html; q=0.2, application/json; q=0.5' },
        }),
      ),
    ).toBe(true);
  });

  it('rejects a request that does not accept JSON', () => {
    const guard = new JsonContractGuard();

    expectGuardError(
      () =>
        guard.canActivate(
          httpContext({
            method: 'GET',
            path: '/api/v1/users',
            headers: { accept: 'text/html' },
          }),
        ),
      'NOT_ACCEPTABLE',
    );
  });

  it('rejects body methods that do not declare JSON content', () => {
    const guard = new JsonContractGuard();

    expectGuardError(
      () =>
        guard.canActivate(
          httpContext({
            method: 'PATCH',
            path: '/api/v1/users/1',
            headers: {
              accept: 'application/json',
              'content-type': 'text/plain',
            },
          }),
        ),
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });

  it('allows bodyless User provisioning without a request content type', () => {
    const guard = new JsonContractGuard();

    expect(
      guard.canActivate(
        httpContext({
          method: 'PUT',
          path: '/api/v1/users/me',
          headers: { accept: 'application/json' },
        }),
      ),
    ).toBe(true);
  });

  it('allows the rendered documentation endpoint to negotiate HTML', () => {
    const guard = new JsonContractGuard();

    expect(
      guard.canActivate(
        httpContext({
          method: 'GET',
          path: '/docs',
          headers: { accept: 'text/html' },
        }),
      ),
    ).toBe(true);
  });

  it.each(['text/yaml', 'application/yaml'])(
    'allows the YAML documentation endpoint to negotiate %s',
    (accept) => {
      const guard = new JsonContractGuard();

      expect(
        guard.canActivate(
          httpContext({
            method: 'GET',
            path: '/docs-yaml',
            headers: { accept },
          }),
        ),
      ).toBe(true);
    },
  );

  it('rejects a YAML documentation request that only accepts JSON', () => {
    const guard = new JsonContractGuard();

    expectGuardError(
      () =>
        guard.canActivate(
          httpContext({
            method: 'GET',
            path: '/docs-yaml',
            headers: { accept: 'application/json' },
          }),
        ),
      'NOT_ACCEPTABLE',
    );
  });

  it('allows Swagger UI assets without imposing an API response media type', () => {
    const guard = new JsonContractGuard();

    expect(
      guard.canActivate(
        httpContext({
          method: 'GET',
          path: '/docs/swagger-ui.css',
          headers: { accept: 'text/css' },
        }),
      ),
    ).toBe(true);
  });
});

function httpContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, ...request }) }),
  } as unknown as ExecutionContext;
}

function expectGuardError(action: () => boolean, code: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error: unknown) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(JsonContractError);
  expect((thrown as JsonContractError).code).toBe(code);
}
