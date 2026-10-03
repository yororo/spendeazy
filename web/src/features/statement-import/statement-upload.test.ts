// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createStatementUpload } from "./statement-upload";
import { categorizeStatement, type CategorizedStatement } from "./statement-categorizer";
import type { CategoryRule } from "./statement-import-service";
import { PdfExtractionError } from "./statement-parser/pdf-extractor";
import { transformStatement } from "./statement-parser/transformer";
import bdoFixture from "../../../docs/pdf-parser/bdo-amex-sample-extracted-text.txt?raw";
import gcashFixture from "../../../docs/pdf-parser/gcash-sample-extracted-text.txt?raw";

const card: CategorizedStatement = { summary: transformStatement(bdoFixture).summary, transactions: [] };
const wallet: CategorizedStatement = { summary: transformStatement(gcashFixture).summary, transactions: [
  { id: "incoming", transactionDate: new Date("2026-09-01"), postingDate: new Date("2026-09-01"), description: "Transfer from 09111111111 to 09999999999", amount: -100, categoryId: null, assignment: "unmapped", matchedCategoryIds: [], isExcluded: false },
  { id: "outgoing", transactionDate: new Date("2026-09-01"), postingDate: new Date("2026-09-01"), description: "Transfer from 09999999999 to 09111111111", amount: -200, categoryId: null, assignment: "unmapped", matchedCategoryIds: [], isExcluded: false },
] };
const file = () => new File(["pdf"], "statement.pdf");
function deferred() {
  let resolve!: (statement: CategorizedStatement) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<CategorizedStatement>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup(prepare = vi.fn<typeof categorizeStatement>(() => Promise.resolve(card))) {
  const onPrepared = vi.fn();
  const inputs: { rules: CategoryRule[]; activeCategoryIds: Set<string> } = { rules: [], activeCategoryIds: new Set() };
  const upload = createStatementUpload({ prepare, getCategorizationInputs: () => inputs, onPrepared });
  return { upload, prepare, onPrepared, inputs };
}

it.each(["success", "rejection"])("discards late %s after abandonment even after another Upload begins", async (outcome) => {
  const old = deferred();
  const newer = deferred();
  const { upload, onPrepared } = setup(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise));
  const pending = upload.selectFile(file());
  upload.abandon();
  const nextFile = file();
  const next = upload.selectFile(nextFile);
  const observed = vi.fn();
  upload.subscribe(observed);
  if (outcome === "success") old.resolve(wallet); else old.reject(new Error("old failure"));
  await pending;
  expect(upload.getState().stage).toBe("processing");
  expect(observed).not.toHaveBeenCalled();
  expect(onPrepared).not.toHaveBeenCalled();
  newer.resolve(card);
  await next;
  expect(onPrepared).toHaveBeenCalledExactlyOnceWith(nextFile, card);
  expect(upload.getState()).toEqual({ stage: "idle", error: null });
});

it("rejects unsupported and oversized files before preparation", async () => {
  const { upload, prepare } = setup();
  await upload.selectFile(new File(["text"], "statement.txt"));
  expect(upload.getState()).toEqual({ stage: "idle", error: "Choose a PDF file." });
  const large = file();
  Object.defineProperty(large, "size", { value: 100 * 1024 * 1024 });
  await upload.selectFile(large);
  expect(upload.getState()).toMatchObject({ stage: "idle", error: expect.stringContaining("MB or smaller") });
  expect(prepare).not.toHaveBeenCalled();
});

it("blocks duplicate selection and retries while extraction runs", async () => {
  const extraction = deferred();
  const { upload, prepare } = setup(vi.fn(() => extraction.promise));
  const pending = upload.selectFile(file());
  await upload.selectFile(file());
  await upload.retryPassword();
  upload.cancelPassword();
  expect(upload.getState().stage).toBe("processing");
  expect(prepare).toHaveBeenCalledTimes(1);
  extraction.resolve(card);
  await pending;
});

it("preserves exact passwords and captures fresh categorization inputs for each retry", async () => {
  const first = deferred();
  const retry = deferred();
  const { upload, prepare, inputs } = setup(vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise).mockResolvedValueOnce(card));
  inputs.activeCategoryIds.add("old");
  inputs.rules.push({ id: "rule", categoryId: "old", pattern: "Shop", matchType: "exact" });
  const pending = upload.selectFile(file());
  inputs.activeCategoryIds.clear();
  inputs.rules[0] = { ...inputs.rules[0], pattern: "Updated" };
  expect(prepare.mock.calls[0][2]).toEqual([{ id: "rule", categoryId: "old", pattern: "Shop", matchType: "exact" }]);
  expect(prepare.mock.calls[0][3]).toEqual(new Set(["old"]));
  first.reject(new PdfExtractionError("password", "Password required"));
  await pending;
  upload.setPassword(" exact password ");
  inputs.activeCategoryIds.add("new");
  const opening = upload.retryPassword();
  expect(prepare.mock.calls[1][2]).toEqual(inputs.rules);
  expect(prepare.mock.calls[1][1]).toBe(" exact password ");
  expect(prepare.mock.calls[1][3]).toEqual(new Set(["new"]));
  upload.cancelPassword();
  expect(upload.getState().stage).toBe("processing");
  retry.reject(new PdfExtractionError("password", "Wrong password"));
  await opening;
  expect(upload.getState()).toMatchObject({ stage: "password", password: " exact password ", error: expect.stringContaining("incorrect") });
  upload.setPassword("correct");
  await upload.retryPassword();
  expect(upload.getState()).toEqual({ stage: "idle", error: null });
});

it("clears challenges on cancellation and terminal failure", async () => {
  const { upload, onPrepared } = setup(vi.fn().mockRejectedValueOnce(new PdfExtractionError("password", "locked")).mockRejectedValueOnce(new Error("Unreconciled statement")));
  await upload.selectFile(file());
  upload.setPassword("secret");
  upload.cancelPassword();
  expect(upload.getState()).toEqual({ stage: "idle", error: null });
  await upload.selectFile(file());
  expect(upload.getState()).toEqual({ stage: "idle", error: "Unreconciled statement" });
  expect(onPrepared).not.toHaveBeenCalled();
});

it("keeps invalid recipient input pending, then excludes only recognized incoming transfers", async () => {
  const { upload, onPrepared } = setup(vi.fn().mockResolvedValue(wallet));
  const selected = file();
  await upload.selectFile(selected);
  upload.setRecipient("invalid");
  upload.completeRecipient();
  expect(upload.getState()).toMatchObject({ stage: "recipient", recipient: "invalid", error: "Enter exactly 11 digits starting with 09." });
  expect(onPrepared).not.toHaveBeenCalled();
  upload.setRecipient(" 09999999999 ");
  upload.completeRecipient();
  expect(onPrepared.mock.calls[0][1].transactions).toMatchObject([
    { id: "incoming", amount: 100, isExcluded: true },
    { id: "outgoing", amount: -200, isExcluded: false },
  ]);
  upload.skipRecipient();
  expect(onPrepared).toHaveBeenCalledTimes(1);
  expect(upload.getState()).toEqual({ stage: "idle", error: null });
});

it.each(["skip", "empty"])("completes optional recipient handling through %s", async (action) => {
  const { upload, onPrepared } = setup(vi.fn().mockResolvedValue(wallet));
  const selected = file();
  await upload.selectFile(selected);
  if (action === "skip") upload.skipRecipient(); else upload.completeRecipient();
  expect(onPrepared).toHaveBeenCalledExactlyOnceWith(selected, wallet);
  expect(upload.getState()).toEqual({ stage: "idle", error: null });
});

it("clears recipient inputs on abandonment and replacement", async () => {
  const { upload, onPrepared } = setup(vi.fn().mockResolvedValue(wallet));
  await upload.selectFile(file());
  upload.setRecipient("09999999999");
  upload.abandon();
  expect(upload.getState()).toEqual({ stage: "idle", error: null });
  await upload.selectFile(file());
  expect(upload.getState()).toMatchObject({ stage: "recipient", recipient: "", error: null });
  upload.setRecipient("secret");
  await upload.selectFile(file());
  expect(upload.getState()).toMatchObject({ stage: "recipient", recipient: "", error: null });
  expect(onPrepared).not.toHaveBeenCalled();
});


it.each(["+639112334455", "0911233445", "08112334455", "09A12334455", "09112 334455"])("keeps invalid recipient %s pending", async (recipient) => {
  const { upload, onPrepared } = setup(vi.fn().mockResolvedValue(wallet));
  await upload.selectFile(file());
  upload.setRecipient(recipient);
  upload.completeRecipient();
  expect(upload.getState()).toMatchObject({ stage: "recipient", recipient, error: "Enter exactly 11 digits starting with 09." });
  expect(onPrepared).not.toHaveBeenCalled();
});

it("abandons a protected attempt without allowing late password challenges or errors", async () => {
  const retry = deferred();
  const { upload, onPrepared } = setup(vi.fn().mockRejectedValueOnce(new PdfExtractionError("password", "locked")).mockReturnValueOnce(retry.promise));
  await upload.selectFile(file());
  upload.setPassword("secret");
  const opening = upload.retryPassword();
  upload.abandon();
  retry.reject(new PdfExtractionError("password", "wrong"));
  await opening;
  expect(upload.getState()).toEqual({ stage: "idle", error: null });
  expect(onPrepared).not.toHaveBeenCalled();
});
