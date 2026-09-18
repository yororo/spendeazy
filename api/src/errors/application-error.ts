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
