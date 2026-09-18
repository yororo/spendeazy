import type { Request } from 'express';

export const HEALTH_PATH = 'health';
export const DOCUMENTATION_PATH = 'docs';
export const JSON_DOCUMENT_PATH = 'docs-json';
export const YAML_DOCUMENT_PATH = 'docs-yaml';
export const PUBLIC_ROUTE_PATHS = [
  HEALTH_PATH,
  JSON_DOCUMENT_PATH,
  YAML_DOCUMENT_PATH,
  DOCUMENTATION_PATH,
] as const;
export const PUBLIC_ROUTE_METHODS = ['GET', 'HEAD'] as const;

export type PublicRouteMethod = (typeof PUBLIC_ROUTE_METHODS)[number];

export function isPublicRoute(request: Request): boolean {
  const normalizedPath = normalizeRequestPath(request.path);
  return (
    PUBLIC_ROUTE_METHODS.some((method) => method === request.method) &&
    (PUBLIC_ROUTE_PATHS.some((path) => `/${path}` === normalizedPath) ||
      isDocumentationAssetPath(normalizedPath))
  );
}

export function isDocumentationAssetPath(path: string): boolean {
  return normalizeRequestPath(path).startsWith(`/${DOCUMENTATION_PATH}/`);
}

export function normalizeRequestPath(path: string): string {
  const withoutTrailingSlash = path.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}
