import type { Request } from 'express';
import { API_PREFIX } from '../config/app-config';

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
const PUBLIC_INVITATION_PREVIEW_PATH_PATTERN = new RegExp(
  `^\\/${API_PREFIX}\\/invitations\\/[A-Za-z0-9_-]{32,128}$`,
  'u',
);
const PUBLIC_INVITATION_DECLINE_PATH_PATTERN = new RegExp(
  `^\\/${API_PREFIX}\\/invitations\\/[A-Za-z0-9_-]{32,128}\\/decline$`,
  'u',
);

export type PublicRouteMethod = (typeof PUBLIC_ROUTE_METHODS)[number];

export function isPublicRoute(request: Request): boolean {
  const normalizedPath = normalizeRequestPath(request.path);
  const isPublicInvitationRoute =
    (request.method === 'GET' &&
      PUBLIC_INVITATION_PREVIEW_PATH_PATTERN.test(normalizedPath)) ||
    (request.method === 'POST' &&
      PUBLIC_INVITATION_DECLINE_PATH_PATTERN.test(normalizedPath));
  return (
    (PUBLIC_ROUTE_METHODS.some((method) => method === request.method) &&
      (PUBLIC_ROUTE_PATHS.some((path) => `/${path}` === normalizedPath) ||
        isDocumentationAssetPath(normalizedPath))) ||
    isPublicInvitationRoute
  );
}

export function isDocumentationAssetPath(path: string): boolean {
  return normalizeRequestPath(path).startsWith(`/${DOCUMENTATION_PATH}/`);
}

export function normalizeRequestPath(path: string): string {
  const withoutTrailingSlash = path.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}
