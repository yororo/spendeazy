import type { Request } from 'express';
import { isPublicRoute } from './public-route-paths';

describe('public documentation routes', () => {
  it.each(['/health', '/docs', '/docs-json', '/docs-yaml'])(
    'recognizes %s as a public GET route',
    (path) => {
      expect(isPublicRoute(request({ method: 'GET', path }))).toBe(true);
    },
  );

  it('recognizes Swagger UI assets below the documentation route', () => {
    expect(
      isPublicRoute(request({ method: 'GET', path: '/docs/swagger-ui.js' })),
    ).toBe(true);
  });

  it('does not make unrelated routes or mutating methods public', () => {
    expect(
      isPublicRoute(request({ method: 'GET', path: '/docs-private' })),
    ).toBe(false);
    expect(isPublicRoute(request({ method: 'POST', path: '/docs-yaml' }))).toBe(
      false,
    );
  });

  it('does not make retired invitation links public', () => {
    const token = 'a'.repeat(43);
    expect(
      isPublicRoute(
        request({ method: 'GET', path: `/api/v1/invitations/${token}` }),
      ),
    ).toBe(false);
    expect(
      isPublicRoute(
        request({
          method: 'POST',
          path: `/api/v1/invitations/${token}/decline`,
        }),
      ),
    ).toBe(false);
    expect(
      isPublicRoute(
        request({ method: 'POST', path: `/api/v1/invitations/${token}` }),
      ),
    ).toBe(false);
  });
});

function request(values: Record<string, unknown>): Request {
  return values as unknown as Request;
}
