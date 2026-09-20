export interface ErrorDetail {
  field: string;
  code: string;
  message: string;
  categoryId?: string;
}

export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class StaleEditError extends ApplicationError {
  constructor() {
    super(
      'STALE_EDIT',
      'This resource changed elsewhere. Reload and review your edits before saving.',
      [
        {
          field: '/updatedAt',
          code: 'incompatible',
          message:
            'The resource changed elsewhere. Reload and review your edits before saving.',
        },
      ],
    );
  }
}
