import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('User OpenAPI contract', () => {
  it('describes both User operations, shared errors, and conditional provisioning', async () => {
    const document = await createOpenApiDocument();
    const userPath = document.paths['/api/v1/users/me'];
    const provisionOperation = userPath?.put as OperationObject;
    const getOperation = userPath?.get as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();
    expect(provisionOperation).toMatchObject({
      operationId: 'Users_provisionUser',
      tags: ['Users'],
      summary:
        'Provision or synchronize my User profile. The request body is ignored.',
    });
    expect(getOperation).toMatchObject({
      operationId: 'Users_getUser',
      tags: ['Users'],
      summary: 'Get my User profile.',
    });
    expect(document.tags).toContainEqual({
      name: 'Users',
      description: 'Expense-data owners.',
    });
    expect(provisionOperation.requestBody).toBeUndefined();

    expectResponseReference(provisionOperation, '401', 'UnauthenticatedError');
    expectResponseReference(provisionOperation, '400', 'ValidationError');
    expectResponseReference(provisionOperation, '404', 'NotFoundError');
    expectResponseReference(provisionOperation, '409', 'ConflictError');
    expectResponseReference(
      provisionOperation,
      '503',
      'ServiceUnavailableError',
    );
    expectResponseReference(provisionOperation, '406', 'NotAcceptableError');
    expectResponseReference(provisionOperation, '500', 'InternalError');
    expectResponseReference(getOperation, '401', 'UnauthenticatedError');
    expectResponseReference(getOperation, '403', 'UserNotProvisionedError');
    expectResponseReference(getOperation, '404', 'NotFoundError');
    expectResponseReference(getOperation, '406', 'NotAcceptableError');
    expectResponseReference(getOperation, '500', 'InternalError');
    expect(provisionOperation.responses['403']).toBeUndefined();
    expect(provisionOperation.responses['415']).toBeUndefined();
    expect(provisionOperation.responses['413']).toBeUndefined();
    expect(getOperation.responses['400']).toBeUndefined();
    expect(getOperation.responses['409']).toBeUndefined();
    expect(getOperation.responses['503']).toBeUndefined();

    expect(provisionOperation.responses['200']).toMatchObject({
      description: 'User synchronized.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UserResponseDto' },
        },
      },
    });
    expect(provisionOperation.responses['201']).toMatchObject({
      description: 'User provisioned.',
      headers: {
        Location: {
          required: true,
          schema: { type: 'string', example: '/api/v1/users/me' },
        },
      },
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UserResponseDto' },
        },
      },
    });
    expect(getOperation.responses['200']).toMatchObject({
      description: 'User.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UserResponseDto' },
        },
      },
    });

    expect(provisionOperation.security).toBeUndefined();
    expect(getOperation.security).toBeUndefined();
    expect(document.components?.securitySchemes).toMatchObject({
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    });

    expect(document.components?.responses?.UnauthenticatedError).toMatchObject({
      headers: {
        'WWW-Authenticate': {
          required: true,
          schema: { type: 'string', example: 'Bearer' },
        },
      },
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorEnvelopeDto' },
        },
      },
    });

    expect(document.components?.schemas?.UserResponseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'email', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$', example: '42' },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        email: { type: 'string', format: 'email', maxLength: 320 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(document.components?.schemas?.UserResponseDto).not.toHaveProperty(
      'properties.clerkUserId',
    );
    expect(document.components?.schemas?.ErrorEnvelopeDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['error'],
    });
    expect(document.components?.responses?.ValidationError).not.toHaveProperty(
      'content.application/json.examples.invalidJson',
    );
  });
});

function expectResponseReference(
  operation: OperationObject,
  status: string,
  responseName: string,
): void {
  expect(operation.responses[status]).toEqual({
    $ref: `#/components/responses/${responseName}`,
  });
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}
