import { HttpStatus, applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiSchema,
  getSchemaPath,
  type ApiResponseOptions,
  type ContentObject,
  type HeadersObject,
  type ResponseObject,
} from '@nestjs/swagger';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

const ERROR_CODES = [
  'VALIDATION_FAILED',
  'INVALID_JSON',
  'NOT_ACCEPTABLE',
  'UNSUPPORTED_MEDIA_TYPE',
  'ROUTE_NOT_FOUND',
  'HTTP_ERROR',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'UNAUTHENTICATED',
  'USER_NOT_PROVISIONED',
  'CONFLICT',
  'STALE_EDIT',
  'RESOURCE_NOT_FOUND',
  'USER_NOT_FOUND',
  'SPACE_NOT_FOUND',
  'SPACE_NOT_WRITABLE',
  'SPACE_NOTIFICATION_NOT_FOUND',
  'INVITATION_ALREADY_PENDING',
  'INVITATION_INELIGIBLE',
  'INVITATION_CODE_UNAVAILABLE',
  'INVITATION_CODE_RATE_LIMITED',
  'INVITATION_CLAIM_NOT_FOUND',
  'EMAIL_ALREADY_EXISTS',
  'CATEGORY_NOT_FOUND',
  'CATEGORY_NAME_ALREADY_EXISTS',
  'CATEGORY_INACTIVE',
  'BUDGET_NOT_FOUND',
  'CATEGORY_RULE_NOT_FOUND',
  'CATEGORY_RULE_PATTERN_ALREADY_EXISTS',
  'TRANSACTION_NOT_FOUND',
  'STATEMENT_IMPORT_NOT_FOUND',
  'IMPORTED_TRANSACTION_IMMUTABLE',
  'STATEMENT_IMPORT_FILE_ALREADY_EXISTS',
  'STATEMENT_IMPORT_FILE_HASH_INVALID',
  'STATEMENT_IMPORT_PROBABLE_DUPLICATES',
] as const;

const ERROR_DETAIL_CODES = [
  'required',
  'invalid_format',
  'invalid_type',
  'invalid_value',
  'unknown',
  'incompatible',
  'not_allowed',
  'not_unique',
  'too_short',
  'too_long',
  'probable_duplicate',
] as const;

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ErrorDetailDto {
  @ApiPropertyOptional({
    description:
      'Conflicting owned Category identifier for a category-rule duplicate.',
    pattern: '^[1-9]\\d*$',
    example: '42',
  })
  categoryId?: string;

  @ApiProperty({
    description: 'JSON Pointer into the request.',
    example: '/email',
  })
  field!: string;

  @ApiProperty({
    description: 'Stable machine-readable field-detail code.',
    enum: ERROR_DETAIL_CODES,
    enumName: 'ErrorDetailCode',
  })
  code!: (typeof ERROR_DETAIL_CODES)[number];

  @ApiProperty({ description: 'Human-readable detail message.' })
  message!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ProbableDuplicateDetailDto {
  @ApiProperty({ example: '/transactions/0' })
  field!: string;

  @ApiProperty({ enum: ['probable_duplicate'] })
  code!: 'probable_duplicate';

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: 'array', items: { type: 'integer', minimum: 0 } })
  transactionIndexes!: number[];

  @ApiProperty({
    description: 'Public transaction IDs encoded as strings.',
    type: 'array',
    items: { type: 'string', pattern: '^[1-9]\\d*$' },
  })
  committedTransactionIds!: string[];
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryEligibilityDetailDto {
  @ApiProperty({ example: '/transactions/0/categoryId' })
  field!: string;

  @ApiProperty({ enum: ['category_inactive'] })
  code!: 'category_inactive';

  @ApiProperty()
  message!: string;

  @ApiProperty({
    description: 'The inactive Category assigned to the reviewed rows.',
    pattern: '^[1-9]\\d*$',
    example: '42',
  })
  categoryId!: string;

  @ApiProperty({
    description:
      'Zero-based reviewed Transaction indexes requiring correction.',
    type: 'array',
    items: { type: 'integer', minimum: 0 },
  })
  transactionIndexes!: number[];
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ErrorResponseDto {
  @ApiProperty({
    description:
      'Stable error code. Human-readable messages are not a compatibility contract.',
    enum: ERROR_CODES,
    enumName: 'ErrorCode',
  })
  code!: (typeof ERROR_CODES)[number];

  @ApiProperty({ description: 'Human-readable error message.' })
  message!: string;

  @ApiProperty({
    description: 'Structured details for fields or domain-specific conflicts.',
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(ErrorDetailDto) },
        { $ref: getSchemaPath(ProbableDuplicateDetailDto) },
        { $ref: getSchemaPath(CategoryEligibilityDetailDto) },
      ],
    },
  })
  details!: Array<
    ErrorDetailDto | ProbableDuplicateDetailDto | CategoryEligibilityDetailDto
  >;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ErrorEnvelopeDto {
  @ApiProperty({ type: () => ErrorResponseDto })
  error!: ErrorResponseDto;
}

export const API_ERROR_RESPONSE_COMPONENT_KEY = 'x-api-response-component';

export const API_ERROR_RESPONSE_COMPONENTS = {
  UnauthenticatedError: {
    status: HttpStatus.UNAUTHORIZED,
    description:
      'The request does not include valid Clerk session credentials.',
    headers: {
      'WWW-Authenticate': {
        required: true,
        description: 'Authentication scheme accepted by the API.',
        schema: { type: 'string', example: 'Bearer' },
      },
    },
    example: {
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        details: [],
      },
    },
  },
  UserNotProvisionedError: {
    status: HttpStatus.FORBIDDEN,
    description:
      'The verified Clerk identity is not linked to a local User. Provision the User first.',
    example: {
      error: {
        code: 'USER_NOT_PROVISIONED',
        message: 'User is not provisioned',
        details: [],
      },
    },
  },
  ServiceUnavailableError: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'A required external service is temporarily unavailable.',
    example: {
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The identity provider is temporarily unavailable',
        details: [],
      },
    },
  },
  ValidationError: {
    status: HttpStatus.BAD_REQUEST,
    description: 'The request syntax or fields are invalid.',
    examples: {
      invalidField: {
        value: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The request contains invalid fields.',
            details: [
              {
                field: '/email',
                code: 'invalid_format',
                message: 'Email must be a valid email address',
              },
            ],
          },
        },
      },
    },
  },
  NotFoundError: {
    status: HttpStatus.NOT_FOUND,
    description: 'The requested resource is absent or owned by another user.',
    examples: {
      user: {
        value: {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User was not found',
            details: [],
          },
        },
      },
      route: {
        value: {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: 'Request failed',
            details: [],
          },
        },
      },
    },
  },
  RateLimitError: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    description:
      'Too many Invite Code attempts were made for the authenticated User or network source.',
    example: {
      error: {
        code: 'INVITATION_CODE_RATE_LIMITED',
        message: 'Too many Invite Code attempts. Try again later.',
        details: [],
      },
    },
  },
  ConflictError: {
    status: HttpStatus.CONFLICT,
    description: 'The request conflicts with current application state.',
    examples: {
      emailAlreadyExists: {
        value: {
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'Email is already in use',
            details: [
              {
                field: '/email',
                code: 'not_unique',
                message: 'Email is already in use',
              },
            ],
          },
        },
      },
      genericConflict: {
        value: {
          error: {
            code: 'CONFLICT',
            message: 'Request conflicts with existing data',
            details: [],
          },
        },
      },
    },
  },
  ProbableDuplicateConflict: {
    status: HttpStatus.CONFLICT,
    description:
      'Statement import conflicts are stable JSON errors. Exact file duplicates cannot be overridden; probable duplicates require explicit acknowledgement. Internal matching values are never returned.',
    examples: {
      fileAlreadyImported: {
        summary: 'The same file was already imported for this User.',
        value: {
          error: {
            code: 'STATEMENT_IMPORT_FILE_ALREADY_EXISTS',
            message: 'The statement file has already been imported',
            details: [
              {
                field: '/fileHash',
                code: 'not_unique',
                message: 'The statement file has already been imported',
              },
            ],
          },
        },
      },
      withinSubmission: {
        summary: 'Duplicate rows within the submitted statement only.',
        value: {
          error: {
            code: 'STATEMENT_IMPORT_PROBABLE_DUPLICATES',
            message:
              'Probable duplicate imported transactions require acknowledgement',
            details: [
              {
                field: '/transactions/0',
                code: 'probable_duplicate',
                message: 'The reviewed transaction has a probable duplicate',
                transactionIndexes: [0, 2],
                committedTransactionIds: [],
              },
            ],
          },
        },
      },
      committedMatch: {
        summary:
          'A submitted row matches previously committed imported Transactions.',
        value: {
          error: {
            code: 'STATEMENT_IMPORT_PROBABLE_DUPLICATES',
            message:
              'Probable duplicate imported transactions require acknowledgement',
            details: [
              {
                field: '/transactions/1',
                code: 'probable_duplicate',
                message: 'The reviewed transaction has a probable duplicate',
                transactionIndexes: [1],
                committedTransactionIds: ['12', '18'],
              },
            ],
          },
        },
      },
      categoryInactive: {
        summary: 'A reviewed row references an inactive Category.',
        value: {
          error: {
            code: 'CATEGORY_INACTIVE',
            message: 'Category is inactive',
            details: [
              {
                field: '/transactions/0/categoryId',
                code: 'category_inactive',
                message: 'The reviewed transaction uses an inactive Category',
                categoryId: '42',
                transactionIndexes: [0, 2],
              },
            ],
          },
        },
      },
    },
  },
  NotAcceptableError: {
    status: HttpStatus.NOT_ACCEPTABLE,
    description:
      'The client did not accept the representation required by the endpoint.',
    example: {
      error: {
        code: 'NOT_ACCEPTABLE',
        message: 'The endpoint requires an application/json response',
        details: [],
      },
    },
  },
  UnsupportedMediaTypeError: {
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    description: 'A request body must use application/json.',
    example: {
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Request bodies must use application/json',
        details: [],
      },
    },
  },
  InvalidJsonError: {
    status: HttpStatus.BAD_REQUEST,
    description: 'The request body is not valid JSON.',
    example: {
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
        details: [],
      },
    },
  },
  HttpError: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: 'A generic HTTP protocol error.',
    example: {
      error: {
        code: 'HTTP_ERROR',
        message: 'Request failed',
        details: [],
      },
    },
  },
  InternalError: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description:
      'An unexpected server error. Infrastructure details are never returned.',
    example: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        details: [],
      },
    },
  },
} as const;

export type ApiErrorResponseName = keyof typeof API_ERROR_RESPONSE_COMPONENTS;

export type ApiErrorResponseDefinition = {
  status: number;
  description: string;
  headers?: HeadersObject;
  example?: unknown;
  examples?: Record<string, { summary?: string; value: unknown }>;
};

export function ApiStandardErrorResponses(
  ...responseNames: ApiErrorResponseName[]
): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(
      ErrorEnvelopeDto,
      ErrorResponseDto,
      ErrorDetailDto,
      ProbableDuplicateDetailDto,
      CategoryEligibilityDetailDto,
    ),
    ...responseNames.map((responseName) => {
      const response = API_ERROR_RESPONSE_COMPONENTS[
        responseName
      ] as ApiErrorResponseDefinition;
      return ApiResponseWithComponent(responseName, response);
    }),
  );
}

function ApiResponseWithComponent(
  responseName: ApiErrorResponseName,
  response: ApiErrorResponseDefinition,
): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status: response.status,
    description: response.description,
    ...(response.headers ? { headers: response.headers } : {}),
    content: createApiErrorContent(response),
    [API_ERROR_RESPONSE_COMPONENT_KEY]: responseName,
  } as unknown as ApiResponseOptions);
}

export function createApiErrorResponseComponent(
  responseName: ApiErrorResponseName,
): ResponseObject {
  const response = API_ERROR_RESPONSE_COMPONENTS[
    responseName
  ] as ApiErrorResponseDefinition;

  return {
    description: response.description,
    ...(response.headers ? { headers: response.headers } : {}),
    content: createApiErrorContent(response),
  };
}

function createApiErrorContent(
  response: ApiErrorResponseDefinition,
): ContentObject {
  return {
    'application/json': {
      schema: { $ref: getSchemaPath(ErrorEnvelopeDto) },
      ...(response.example !== undefined ? { example: response.example } : {}),
      ...(response.examples !== undefined
        ? { examples: response.examples }
        : {}),
    },
  };
}

export function getApiErrorResponseName(
  response: unknown,
): ApiErrorResponseName | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const responseName = (response as Record<string, unknown>)[
    API_ERROR_RESPONSE_COMPONENT_KEY
  ];
  return isApiErrorResponseName(responseName) ? responseName : undefined;
}

function isApiErrorResponseName(value: unknown): value is ApiErrorResponseName {
  if (typeof value !== 'string') {
    return false;
  }

  return value in API_ERROR_RESPONSE_COMPONENTS;
}
