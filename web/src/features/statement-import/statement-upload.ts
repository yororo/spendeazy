import { importFileRules } from "./statement-import-data";
import {
  categorizeStatement,
  type CategorizedStatement,
} from "./statement-categorizer";
import {
  applyGcashRecipientExclusion,
  isGcashStatement,
  validateGcashMobileNumber,
} from "./gcash-recipient";
import type { CategoryRule } from "./statement-import-service";
import { PdfExtractionError } from "./statement-parser/pdf-extractor";

type StatementUploadState =
  | { readonly stage: "idle"; readonly error: string | null }
  | {
      readonly stage: "processing";
      readonly file: File;
      readonly challenge: boolean;
      readonly password: string;
    }
  | {
      readonly stage: "password";
      readonly file: File;
      readonly password: string;
      readonly error: string | null;
    }
  | {
      readonly stage: "recipient";
      readonly file: File;
      readonly statement: CategorizedStatement;
      readonly recipient: string;
      readonly error: string | null;
    };

interface StatementUploadDependencies {
  readonly prepare?: typeof categorizeStatement;
  readonly getCategorizationInputs: () => {
    readonly rules: readonly CategoryRule[];
    readonly activeCategoryIds: ReadonlySet<string>;
  };
  readonly onPrepared: (file: File, statement: CategorizedStatement) => void;
}

function validateFile(file: File) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!importFileRules.formats.some((format) => extension === `.${format.toLowerCase()}`)) {
    return `Choose a ${importFileRules.formats.join(", ")} file.`;
  }
  if (file.size > importFileRules.maxSizeMb * 1024 * 1024) {
    return `File must be ${importFileRules.maxSizeMb} MB or smaller.`;
  }
  return null;
}

function createStatementUpload(dependencies: StatementUploadDependencies) {
  let state: StatementUploadState = { stage: "idle", error: null };
  let operation = 0;
  const listeners = new Set<() => void>();

  function publish(next: StatementUploadState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function abandon() {
    operation += 1;
    publish({ stage: "idle", error: null });
  }

  function complete(file: File, statement: CategorizedStatement) {
    abandon();
    dependencies.onPrepared(file, statement);
  }

  async function process(file: File, password?: string) {
    const attempt = ++operation;
    const inputs = dependencies.getCategorizationInputs();
    const rules = inputs.rules.map((rule) => ({ ...rule }));
    const activeCategoryIds = new Set(inputs.activeCategoryIds);
    publish({
      stage: "processing",
      file,
      challenge: password !== undefined,
      password: password ?? "",
    });
    try {
      const statement = await (dependencies.prepare ?? categorizeStatement)(
        file, password, rules, activeCategoryIds,
      );
      // Extraction still releases its parser; abandoned results cannot affect Upload.
      if (attempt !== operation) return;
      if (isGcashStatement(statement)) {
        publish({ stage: "recipient", file, statement, recipient: "", error: null });
      } else {
        complete(file, statement);
      }
    } catch (cause) {
      if (attempt !== operation) return;
      if (cause instanceof PdfExtractionError && cause.code === "password") {
        publish({
          stage: "password",
          file,
          password: password ?? "",
          error: password === undefined ? null :
            "The password you entered is incorrect. Please try a different password.",
        });
      } else {
        publish({
          stage: "idle",
          error: cause instanceof Error ? cause.message : "Unable to process this statement.",
        });
      }
    }
  }

  return {
    updateDependencies(next: StatementUploadDependencies) {
      dependencies = next;
    },
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    abandon,
    async selectFile(file?: File) {
      if (!file || state.stage === "processing") return;
      abandon();
      const error = validateFile(file);
      if (error) {
        publish({ stage: "idle", error });
        return;
      }
      await process(file);
    },
    setPassword(password: string) {
      if (state.stage === "password") publish({ ...state, password, error: null });
    },
    async retryPassword() {
      if (state.stage !== "password" || !state.password) return;
      await process(state.file, state.password);
    },
    cancelPassword() {
      if (state.stage === "password") abandon();
    },
    setRecipient(recipient: string) {
      if (state.stage === "recipient") publish({ ...state, recipient, error: null });
    },
    completeRecipient() {
      if (state.stage !== "recipient") return;
      const error = validateGcashMobileNumber(state.recipient);
      if (error) {
        publish({ ...state, error });
        return;
      }
      complete(state.file, applyGcashRecipientExclusion(state.statement, state.recipient));
    },
    skipRecipient() {
      if (state.stage === "recipient") complete(state.file, state.statement);
    },
  };
}

export { createStatementUpload };
export type { StatementUploadState };
