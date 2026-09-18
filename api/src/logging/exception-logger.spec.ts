import express from 'express';
import request from 'supertest';
import { resolve } from 'node:path';
import { QueryFailedError } from 'typeorm';
import {
  ExceptionLogger,
  exceptionRequestContext,
  SafeNestLogger,
} from './exception-logger';

describe('exception logging privacy', () => {
  it('omits raw exceptions, nested causes, SQL and forged stack text', () => {
    const lines: string[] = [];
    const logger = new ExceptionLogger((line) => lines.push(line));
    const error = new QueryFailedError(
      'SELECT private_data',
      ['secret-token'],
      new Error('private@example.com', {
        cause: { password: 'secret-password' },
      }),
    );
    error.stack = [
      'Error: private@example.com',
      '    at password=secret-password',
      '    at /private/customer-name.ts:1:2',
      `    at secret-function (${resolve('src/main.ts')}:10:20)`,
    ].join('\n');
    logger.report('request_failed', error, 500);
    expect(JSON.parse(lines[0])).toEqual({
      timestamp: expect.any(String) as unknown,
      level: 'error',
      event: 'request_failed',
      status: 500,
      stack: ['src/main.ts:10:20'],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].split('\n')).toHaveLength(2);
  });

  it('does not serialize arbitrary thrown objects or framework arguments', () => {
    const lines: string[] = [];
    const logger = new ExceptionLogger((line) => lines.push(line));
    const framework = new SafeNestLogger(logger);
    const untrusted = {
      toJSON: () => {
        throw new Error('must not serialize');
      },
      token: 'secret',
    };
    framework.error(untrusted);
    framework.error('password=secret');
    framework.log();
    framework.warn();
    framework.debug();
    framework.verbose();
    expect(lines).toHaveLength(2);
    expect(lines.join('')).not.toContain('secret');
    expect(lines.map((line) => parseRecord(line).event)).toEqual([
      'framework_exception',
      'framework_exception',
    ]);
  });

  it('logs a propagated Error only once across framework and startup handling', () => {
    const write = jest.fn();
    const logger = new ExceptionLogger(write);
    const error = new Error('secret');
    new SafeNestLogger(logger).error(error);
    logger.report('startup_failed', error);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('isolates concurrent requests and uses generated IDs and route templates', async () => {
    const lines: string[] = [];
    const logger = new ExceptionLogger((line) => lines.push(line));
    const app = express();
    app.use(exceptionRequestContext);
    app.get('/transactions/:id', (_req, res) => {
      setImmediate(() => {
        logger.report('request_failed', new Error('secret'), 500);
        res.sendStatus(500);
      });
    });
    const responses = await Promise.all(
      ['private-a', 'private-b'].map((id) =>
        request(app)
          .get(`/transactions/${id}?email=private@example.com`)
          .set('X-Request-ID', 'untrusted-id')
          .set('Authorization', 'Bearer secret'),
      ),
    );
    const ids = responses.map((response) => response.headers['x-request-id']);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain('untrusted-id');
    expect(lines.map((line) => parseRecord(line).requestId).sort()).toEqual(
      ids.sort(),
    );
    for (const line of lines) {
      expect(JSON.parse(line)).toMatchObject({
        method: 'GET',
        route: '/transactions/:id',
      });
      expect(line).not.toMatch(/private|secret|untrusted/u);
    }
  });
});

function parseRecord(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}
