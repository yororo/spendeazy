import { useEffect, useMemo, useSyncExternalStore } from "react";

import type {
  CategoryCatalogOption,
  CategoryColorOption,
  CategorySuggestion,
  CategorySuggestionFetcher,
} from "./statement-import-service";
import type { CategorizedTransaction } from "./statement-categorizer";
import { isIncludedStatementTransaction, normalizeDescription } from "./statement-import-utils";

const MAX_CONCURRENT_SUGGESTION_REQUESTS = 3;
const CATEGORY_SUGGESTION_TIMEOUT_MS = 10_000;

type CategorySuggestionState =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "suggested";
      readonly suggestions: readonly CategorySuggestion[];
    };

interface PendingSuggestionRequest {
  readonly controller: AbortController;
  cancelled: boolean;
  timedOut: boolean;
}

interface CategorySuggestionCoordinatorOptions {
  readonly fetchSuggestion?: CategorySuggestionFetcher;
  readonly spaceId?: string;
  readonly catalogKey: string;
}

class CategorySuggestionCoordinator {
  private readonly options: CategorySuggestionCoordinatorOptions;
  private readonly listeners = new Set<() => void>();
  private readonly cachedResults = new Map<string, CategorySuggestionState>();
  private readonly queuedDescriptions = new Map<string, string>();
  private readonly pendingRequests = new Map<
    string,
    PendingSuggestionRequest
  >();
  private candidates = new Map<string, string>();
  private snapshot: ReadonlyMap<string, CategorySuggestionState> = new Map();
  private activeRequestCount = 0;
  private isActive = false;

  constructor(options: CategorySuggestionCoordinatorOptions) {
    this.options = options;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  activate() {
    if (this.isActive) return;
    this.isActive = true;
    this.queueMissingCandidates();
    this.publish();
    this.pumpQueue();
  }

  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    for (const request of this.pendingRequests.values()) {
      request.cancelled = true;
      request.controller.abort();
    }
    this.pendingRequests.clear();
    this.queuedDescriptions.clear();
    this.activeRequestCount = 0;
    this.publish();
  }

  updateCandidates(candidates: ReadonlyMap<string, string>) {
    this.candidates = new Map(candidates);

    for (const normalizedDescription of this.queuedDescriptions.keys()) {
      if (!this.candidates.has(normalizedDescription)) {
        this.queuedDescriptions.delete(normalizedDescription);
      }
    }

    for (const [normalizedDescription, request] of this.pendingRequests) {
      if (this.candidates.has(normalizedDescription)) continue;
      request.cancelled = true;
      request.controller.abort();
    }

    this.queueMissingCandidates();
    this.publish();
    this.pumpQueue();
  }

  private queueMissingCandidates() {
    if (!this.options.fetchSuggestion || !this.options.spaceId) return;

    for (const [normalizedDescription, description] of this.candidates) {
      if (
        this.cachedResults.has(this.cacheKey(normalizedDescription)) ||
        this.pendingRequests.has(normalizedDescription) ||
        this.queuedDescriptions.has(normalizedDescription)
      ) {
        continue;
      }
      this.queuedDescriptions.set(normalizedDescription, description);
    }
  }

  private pumpQueue() {
    if (!this.isActive || !this.options.fetchSuggestion || !this.options.spaceId) {
      return;
    }

    while (
      this.activeRequestCount < MAX_CONCURRENT_SUGGESTION_REQUESTS &&
      this.queuedDescriptions.size > 0
    ) {
      const [normalizedDescription, description] =
        this.queuedDescriptions.entries().next().value as [string, string];
      this.queuedDescriptions.delete(normalizedDescription);
      if (
        !this.candidates.has(normalizedDescription) ||
        this.cachedResults.has(this.cacheKey(normalizedDescription)) ||
        this.pendingRequests.has(normalizedDescription)
      ) {
        continue;
      }

      const request: PendingSuggestionRequest = {
        controller: new AbortController(),
        cancelled: false,
        timedOut: false,
      };
      this.pendingRequests.set(normalizedDescription, request);
      this.activeRequestCount += 1;
      void this.runRequest(normalizedDescription, description, request);
    }
    this.publish();
  }

  private async runRequest(
    normalizedDescription: string,
    description: string,
    request: PendingSuggestionRequest,
  ) {
    const { fetchSuggestion, spaceId } = this.options;
    if (!fetchSuggestion || !spaceId) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    try {
      const aborted = new Promise<null>((resolve) => {
        abortHandler = () => resolve(null);
        request.controller.signal.addEventListener("abort", abortHandler, {
          once: true,
        });
      });
      timeoutId = setTimeout(() => {
        request.timedOut = true;
        request.controller.abort();
      }, CATEGORY_SUGGESTION_TIMEOUT_MS);

      const result = await Promise.race([
        Promise.resolve()
          .then(() =>
            fetchSuggestion(
              description,
              request.controller.signal,
              spaceId,
            ),
          )
          .then(
            (suggestions) => ({ kind: "success" as const, suggestions }),
            () => ({ kind: "failure" as const }),
          ),
        aborted.then(() => ({ kind: "aborted" as const })),
      ]);

      if (result.kind === "aborted") {
        if (request.timedOut) {
          this.cacheResult(
            normalizedDescription,
            { status: "unavailable" },
            request,
          );
        }
        return;
      }
      if (result.kind === "failure") {
        this.cacheResult(
          normalizedDescription,
          { status: "unavailable" },
          request,
        );
        return;
      }
      this.cacheResult(
        normalizedDescription,
        result.suggestions && result.suggestions.length > 0
          ? { status: "suggested", suggestions: result.suggestions }
          : { status: "none" },
        request,
      );
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (abortHandler) {
        request.controller.signal.removeEventListener("abort", abortHandler);
      }

      if (this.pendingRequests.get(normalizedDescription) === request) {
        this.pendingRequests.delete(normalizedDescription);
        this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
        if (
          this.isActive &&
          !this.cachedResults.has(this.cacheKey(normalizedDescription)) &&
          this.candidates.has(normalizedDescription)
        ) {
          const currentDescription = this.candidates.get(normalizedDescription);
          if (currentDescription) {
            this.queuedDescriptions.set(
              normalizedDescription,
              currentDescription,
            );
          }
        }
      }
      this.publish();
      this.pumpQueue();
    }
  }

  private cacheResult(
    normalizedDescription: string,
    result: CategorySuggestionState,
    request: PendingSuggestionRequest,
  ) {
    if (
      !this.isActive ||
      this.pendingRequests.get(normalizedDescription) !== request ||
      request.cancelled ||
      !this.candidates.has(normalizedDescription)
    ) {
      return;
    }
    this.cachedResults.set(this.cacheKey(normalizedDescription), result);
  }

  private publish() {
    const nextSnapshot = new Map<string, CategorySuggestionState>();
    for (const normalizedDescription of this.candidates.keys()) {
      const result = this.cachedResults.get(
        this.cacheKey(normalizedDescription),
      );
      if (result) {
        nextSnapshot.set(normalizedDescription, result);
      } else if (
        this.queuedDescriptions.has(normalizedDescription) ||
        this.pendingRequests.has(normalizedDescription)
      ) {
        nextSnapshot.set(normalizedDescription, { status: "loading" });
      }
    }
    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) listener();
  }

  private cacheKey(normalizedDescription: string) {
    return JSON.stringify([
      this.options.spaceId ?? null,
      this.options.catalogKey,
      normalizedDescription,
    ]);
  }
}

interface UseStatementCategorySuggestionsOptions {
  readonly transactions: readonly CategorizedTransaction[];
  readonly editingTransaction: CategorizedTransaction | undefined;
  readonly editingDescription: string | null;
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly categoryLabels: readonly CategoryCatalogOption[];
  readonly spaceId?: string;
  readonly getCategorySuggestion?: CategorySuggestionFetcher;
}

function useStatementCategorySuggestions({
  transactions,
  editingTransaction,
  editingDescription,
  categoryOptions,
  categoryLabels,
  spaceId,
  getCategorySuggestion,
}: UseStatementCategorySuggestionsOptions) {
  const catalogKey = JSON.stringify({
    active: categoryOptions
      .map(({ value, label, color }) => [value, label, color])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
    catalog: categoryLabels
      .map(({ value, label, color, description, isActive }) => [
        value,
        label,
        color,
        description ?? null,
        isActive,
      ])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  });
  const coordinator = useMemo(
    () =>
      new CategorySuggestionCoordinator({
        fetchSuggestion: getCategorySuggestion,
        spaceId,
        catalogKey,
      }),
    [catalogKey, getCategorySuggestion, spaceId],
  );
  const candidateDescriptions = useMemo(
    () =>
      getCandidateDescriptions(
        transactions,
        editingTransaction,
        editingDescription,
      ),
    [transactions, editingTransaction, editingDescription],
  );
  const results = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );

  useEffect(() => {
    coordinator.activate();
    return () => coordinator.deactivate();
  }, [coordinator]);

  useEffect(() => {
    coordinator.updateCandidates(candidateDescriptions);
  }, [candidateDescriptions, coordinator]);

  return {
    results,
    isAvailable: Boolean(getCategorySuggestion && spaceId),
  };
}

function getCandidateDescriptions(
  transactions: readonly CategorizedTransaction[],
  editingTransaction: CategorizedTransaction | undefined,
  editingDescription: string | null,
): Map<string, string> {
  const descriptions = new Map<string, string>();
  for (const transaction of transactions) {
    if (
      transaction.assignment !== "unmapped" ||
      !isIncludedStatementTransaction(transaction)
    ) {
      continue;
    }
    addDescription(descriptions, transaction.description);
  }

  if (
    editingTransaction?.assignment === "unmapped" &&
    isIncludedStatementTransaction(editingTransaction) &&
    editingDescription
  ) {
    addDescription(descriptions, editingDescription);
  }

  return descriptions;
}

function addDescription(descriptions: Map<string, string>, description: string) {
  const normalizedDescription = normalizeDescription(description);
  if (normalizedDescription && !descriptions.has(normalizedDescription)) {
    descriptions.set(normalizedDescription, description);
  }
}

export { useStatementCategorySuggestions };
export type { CategorySuggestionState };
