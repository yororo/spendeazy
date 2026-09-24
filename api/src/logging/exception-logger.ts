import type { LoggerService } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { writeSync } from 'node:fs';
import type { Request, RequestHandler } from 'express';

type ExceptionEvent =
  | 'request_failed'
  | 'default_category_creation_failed'
  | 'database_readiness_failed'
  | 'framework_exception'
  | 'startup_failed'
  | 'uncaught_exception'
  | 'unhandled_rejection';

export interface ExceptionReporter {
  report(event: ExceptionEvent, error: unknown, status?: number): void;
}

const requestContext = new AsyncLocalStorage<{
  requestId: string;
  request: Request;
}>();
const MAX_STACK_FRAMES = 20;
const METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);

export const exceptionRequestContext: RequestHandler = (
  request,
  response,
  next,
) => {
  const requestId = randomUUID();
  response.setHeader('X-Request-ID', requestId);
  requestContext.run({ requestId, request }, next);
};

// Only retain locations in deployed code. Never emit stack headers, function
// names, arbitrary paths, or error messages (including multi-line messages).
export function safeStack(error: unknown): string[] {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return [];
  const frames: string[] = [];
  for (const line of error.stack.split('\n').slice(1)) {
    const match = /^\s+at (?:.* \()?([^()]+):(\d+):(\d+)\)?$/u.exec(line);
    if (!match) continue;
    const file = relative(process.cwd(), resolve(match[1])).replaceAll(
      '\\',
      '/',
    );
    if (!/^(?:src|dist|node_modules)\/[\w@./-]+\.[cm]?[jt]s$/u.test(file))
      continue;
    if (file.split('/').includes('..') || !existsSync(resolve(file))) continue;
    frames.push(`${file}:${match[2]}:${match[3]}`);
    if (frames.length === MAX_STACK_FRAMES) break;
  }
  return frames;
}

export class ExceptionLogger implements ExceptionReporter {
  private readonly reported = new WeakSet<Error>();

  constructor(
    private readonly write: (line: string) => void = (line) => {
      writeSync(2, line);
    },
  ) {}

  report(event: ExceptionEvent, error: unknown, status?: number): void {
    if (error instanceof Error && this.reported.has(error)) return;
    const context = requestContext.getStore();
    const routeDefinition: unknown = context?.request.route;
    const route =
      typeof routeDefinition === 'object' &&
      routeDefinition !== null &&
      'path' in routeDefinition
        ? routeDefinition.path
        : undefined;
    const method = context?.request.method;
    this.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event,
        status,
        requestId: context?.requestId,
        method: method && METHODS.has(method) ? method : undefined,
        route: typeof route === 'string' ? route : undefined,
        stack: safeStack(error),
      }) + '\n',
    );
    if (error instanceof Error) this.reported.add(error);
  }
}

export const exceptionLogger = new ExceptionLogger();

// Nest and its integrations can pass free-text messages, SQL and raw stacks.
// Discard all optional arguments and use a fixed event for framework failures.
export class SafeNestLogger implements LoggerService {
  constructor(private readonly reporter: ExceptionReporter = exceptionLogger) {}
  log(): void {}
  warn(): void {}
  debug(): void {}
  verbose(): void {}
  error(error: unknown): void {
    this.reporter.report('framework_exception', error);
  }
  fatal(error: unknown): void {
    this.reporter.report('framework_exception', error);
  }
}
