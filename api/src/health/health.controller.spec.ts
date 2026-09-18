import type { Response } from 'express';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns database readiness without infrastructure details', async () => {
    const databaseReadiness = { isReady: jest.fn().mockResolvedValue(true) };
    const controller = new HealthController(databaseReadiness);
    const status = jest.fn();
    const response = { status } as unknown as Response;

    await expect(controller.getHealth(response)).resolves.toEqual({
      status: 'ok',
      database: 'ready',
    });

    expect(status).toHaveBeenCalledWith(200);
  });

  it('returns an opaque unavailable response when the database check fails', async () => {
    const controller = new HealthController({
      isReady: jest
        .fn()
        .mockRejectedValue(new Error('password=secret SQL SELECT 1')),
    });
    const status = jest.fn();
    const response = { status } as unknown as Response;

    const healthResponse = await controller.getHealth(response);

    expect(status).toHaveBeenCalledWith(503);
    expect(healthResponse).toEqual({
      status: 'error',
      database: 'unavailable',
    });
    expect(JSON.stringify(healthResponse)).not.toContain('password');
    expect(JSON.stringify(healthResponse)).not.toContain('SELECT');
    expect(JSON.stringify(healthResponse)).not.toContain('stack');
  });
});
