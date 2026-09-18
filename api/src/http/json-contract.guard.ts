import {
  type CanActivate,
  Injectable,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { API_PREFIX } from '../config/app-config';
import { ApplicationError } from '../errors/application-error';
import {
  NOT_ACCEPTABLE_CODE,
  UNSUPPORTED_MEDIA_TYPE_CODE,
} from '../errors/application-error-codes';
import {
  DOCUMENTATION_PATH,
  isDocumentationAssetPath,
  YAML_DOCUMENT_PATH,
  normalizeRequestPath,
} from './public-route-paths';

export class JsonContractError extends ApplicationError {
  constructor(
    code: typeof NOT_ACCEPTABLE_CODE | typeof UNSUPPORTED_MEDIA_TYPE_CODE,
    message: string,
  ) {
    super(code, message);
  }
}

@Injectable()
export class JsonContractGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const normalizedPath = normalizeRequestPath(request.path);

    if (normalizedPath === `/${DOCUMENTATION_PATH}`) {
      if (!acceptsMediaType(request.headers.accept, ['text/html'])) {
        throw new JsonContractError(
          NOT_ACCEPTABLE_CODE,
          'The documentation endpoint requires an HTML response',
        );
      }
      return true;
    }

    if (isDocumentationAssetPath(normalizedPath)) {
      return true;
    }

    const responseMediaTypes =
      normalizedPath === `/${YAML_DOCUMENT_PATH}`
        ? ['text/yaml', 'application/yaml']
        : ['application/json'];
    if (!acceptsMediaType(request.headers.accept, responseMediaTypes)) {
      throw new JsonContractError(
        NOT_ACCEPTABLE_CODE,
        normalizedPath === `/${YAML_DOCUMENT_PATH}`
          ? 'The endpoint requires a YAML response'
          : 'The endpoint requires an application/json response',
      );
    }

    if (requiresJsonBody(request) && !isJsonContentType(request)) {
      throw new JsonContractError(
        UNSUPPORTED_MEDIA_TYPE_CODE,
        'Request bodies must use application/json',
      );
    }

    return true;
  }
}

function requiresJsonBody(request: Request): boolean {
  if (
    request.method === 'PUT' &&
    normalizeRequestPath(request.path) === `/${API_PREFIX}/users/me`
  ) {
    return false;
  }

  return ['POST', 'PUT', 'PATCH'].includes(request.method);
}

function isJsonContentType(request: Request): boolean {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string') {
    return false;
  }

  return (
    contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json'
  );
}

function acceptsMediaType(
  header: string | undefined,
  mediaTypes: readonly string[],
): boolean {
  if (!header?.trim()) {
    return true;
  }

  return header.split(',').some((part) => {
    const [range, ...parameters] = part.trim().toLowerCase().split(';');
    const quality = parameters.find((parameter) =>
      parameter.trim().startsWith('q='),
    );
    const qualityValue =
      quality === undefined ? 1 : Number(quality.trim().slice(2));
    if (!Number.isFinite(qualityValue) || qualityValue <= 0) {
      return false;
    }

    const mediaRange = range.trim();
    return mediaRange === '*/*' || mediaTypes.includes(mediaRange);
  });
}
