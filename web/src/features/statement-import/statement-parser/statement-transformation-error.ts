type StatementTransformationErrorCode =
  | "unsupported"
  | "ambiguous"
  | "validation";

class StatementTransformationError extends Error {
  readonly code: StatementTransformationErrorCode;
  readonly provider: string | null;

  constructor(
    code: StatementTransformationErrorCode,
    message: string,
    provider: string | null = null,
  ) {
    super(message);
    this.name = "StatementTransformationError";
    this.code = code;
    this.provider = provider;
  }
}

export { StatementTransformationError };
export type { StatementTransformationErrorCode };
