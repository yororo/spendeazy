import { INestApplication, RequestMethod } from '@nestjs/common';
import { API_PREFIX } from '../config/app-config';
import {
  PUBLIC_ROUTE_METHODS,
  PUBLIC_ROUTE_PATHS,
  type PublicRouteMethod,
} from './public-route-paths';

export function configureApiRouting(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      ...PUBLIC_ROUTE_METHODS.flatMap((method) =>
        PUBLIC_ROUTE_PATHS.map((path) => ({
          path,
          method: toRequestMethod(method),
        })),
      ),
    ],
  });
}

function toRequestMethod(method: PublicRouteMethod): RequestMethod {
  return method === 'GET' ? RequestMethod.GET : RequestMethod.HEAD;
}
