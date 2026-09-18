import type { OpenAPIObject } from '@nestjs/swagger';
import {
  createApiErrorResponseComponent,
  getApiErrorResponseName,
  type ApiErrorResponseName,
} from '../http/api-error.dto';

const METHODS = [
  'get',
  'put',
  'post',
  'patch',
  'delete',
  'options',
  'head',
] as const;

export function addApiErrorResponseComponents(document: OpenAPIObject): void {
  const usedResponseNames = new Set<ApiErrorResponseName>();

  for (const pathItem of Object.values(document.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }

      for (const [status, response] of Object.entries(operation.responses)) {
        const responseName = getApiErrorResponseName(response);
        if (!responseName) {
          continue;
        }

        usedResponseNames.add(responseName);
        operation.responses[status] = {
          $ref: `#/components/responses/${responseName}`,
        };
      }
    }
  }

  if (usedResponseNames.size === 0) {
    return;
  }

  document.components ??= {};
  document.components.responses ??= {};
  for (const responseName of usedResponseNames) {
    document.components.responses[responseName] =
      createApiErrorResponseComponent(responseName);
  }
}
