// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientProvider } from "@/shared/api";
import {
  NavigationGuardProvider,
  useNavigationGuard,
} from "@/shared/navigation";

import type { Statement } from "./statement-parser/transformer";
import { transformStatement } from "./statement-parser/transformer";
import { StatementImportPage } from "./statement-import-page";

vi.mock("./statement-parser/pdf-extractor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./statement-parser/pdf-extractor")>();

  return {
    ...actual,
    extractPdfPages: vi.fn(async () => [
      {
        pageNumber: 1,
        text: [
          "Statement Date August 31, 2026",
          `Total Amount Due ${String.fromCodePoint(0x00e2, 0x201a)} 25.50`,
          "08/29/26 08/30/26 Green Market Cafe 25.50",
        ].join("\n"),
      },
    ]),
  };
});

vi.mock("./statement-parser/transformer", () => ({
  transformStatement: vi.fn(() => ({
    summary: {
      statementDate: new Date("2026-08-31T00:00:00.000Z"),
      provider: "BDO",
      accountType: "AMEX",
      totalTransactions: 1,
      totalAmountDue: 25.5,
      totalExtractedAmount: 25.5,
    },
    transactions: [
      {
        transactionDate: new Date("2026-08-29T00:00:00.000Z"),
        postingDate: new Date("2026-08-30T00:00:00.000Z"),
        description: "Green Market Cafe",
        amount: 25.5,
      },
    ],
  })),
}));

const apiConfig = { baseUrl: "https://api.example.test" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createFetchMock(
  options: {
    readonly accessibleSpaces?: readonly Record<string, unknown>[];
    readonly createdRule?: Record<string, unknown>;
    readonly categoriesResponse?: () => readonly Record<string, unknown>[];
    readonly categoryRules?: readonly Record<string, unknown>[];
    readonly categoryRulesResponse?: () => readonly Record<string, unknown>[];
    readonly recentImports?: readonly Record<string, unknown>[];
    readonly failCategoryRules?: () => boolean;
    readonly createRuleResponse?: () => Promise<Response>;
    readonly commitResponse?: () => Response | Promise<Response>;
  } = {},
) {
  const categoryRules = options.categoryRules ?? [
    {
      id: "1",
      categoryId: "42",
      pattern: "Green",
      matchType: "contains",
    },
    {
      id: "2",
      categoryId: "43",
      pattern: "Market",
      matchType: "contains",
    },
    {
      id: "3",
      categoryId: "88",
      pattern: "Green Market Cafe",
      matchType: "exact",
    },
  ];
  const createdRule = options.createdRule ?? {
    id: "4",
    categoryId: "42",
    pattern: "Green Market Cafe",
    matchType: "contains",
  };

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(input.toString());
      const path = requestUrl.pathname.slice("/api/v1/users/me".length);
      const method = init?.method ?? "GET";

      if (method === "GET" && path === "/spaces") {
        return jsonResponse(options.accessibleSpaces ?? []);
      }

      if (
        method === "GET" &&
        (path === "/categories" || /\/spaces\/\d+\/categories$/u.test(path))
      ) {
        return jsonResponse(
          options.categoriesResponse?.() ?? [
            {
              id: "42",
              name: "Housing",
              description: null,
              isActive: true,
            },
            {
              id: "43",
              name: "Groceries",
              description: null,
              isActive: true,
            },
            {
              id: "88",
              name: "Archived",
              description: null,
              isActive: false,
            },
          ],
        );
      }

      if (
        method === "GET" &&
        (path === "/category-rules" ||
          /\/spaces\/\d+\/category-rules$/u.test(path))
      ) {
        if (options.failCategoryRules?.()) {
          return jsonResponse(
            {
              error: {
                code: "INTERNAL_SERVER_ERROR",
                message: "Category Rules are temporarily unavailable.",
                details: [],
              },
            },
            500,
          );
        }
        return jsonResponse(options.categoryRulesResponse?.() ?? categoryRules);
      }

      if (
        method === "GET" &&
        (path === "/statement-imports" ||
          /\/spaces\/\d+\/statement-imports$/u.test(path))
      ) {
        return jsonResponse({
          items: options.recentImports ?? [],
          nextCursor: null,
        });
      }

      if (
        method === "POST" &&
        (path === "/category-rules" ||
          /\/spaces\/\d+\/category-rules$/u.test(path))
      ) {
        return options.createRuleResponse
          ? options.createRuleResponse()
          : jsonResponse(createdRule, 201);
      }

      if (
        method === "POST" &&
        (path === "/statement-imports" ||
          /\/spaces\/\d+\/statement-imports$/u.test(path))
      ) {
        if (options.commitResponse) return options.commitResponse();

        return jsonResponse(
          {
            id: "100",
            fileName: "wallet-export.pdf",
            statementDate: "2026-08-31",
            bank: "GCash",
            cardType: "E-Wallet",
            importedAt: "2026-09-01T00:00:00.000Z",
            importedByUserId: "1",
          },
          201,
        );
      }

      throw new Error(`Unexpected ${method} ${path}`);
    },
  );

  return fetchMock;
}

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value: T) {
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      rejectPromise(reason);
    },
  };
}

function categoryRulePostCount(fetchMock: ReturnType<typeof createFetchMock>) {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      init?.method === "POST" &&
      new URL(input.toString()).pathname.endsWith("/category-rules"),
  ).length;
}

async function openStatementImportCategorize(
  fetchMock: ReturnType<typeof createFetchMock>,
) {
  renderStatementImportPage(fetchMock);
  await screen.findByRole("heading", { name: "Upload your statement" });
  await uploadStatementFile("statement.pdf");
}

async function openReadyStatementImportReview(
  fetchMock: ReturnType<typeof createFetchMock>,
  options: {
    readonly spaceId?: string;
    readonly onSpaceChange?: (spaceId?: string) => void;
    readonly navigationAction?: () => void;
  } = {},
) {
  renderStatementImportPage(fetchMock, options);
  await screen.findByRole("heading", { name: "Upload your statement" });
  await uploadStatementFile("statement.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Review 1 Transactions" }));
  await screen.findByRole("heading", { name: "Review your imported statement" });
}

async function uploadStatementFile(fileName: string) {
  const namedFile = new File(["pdf"], fileName, {
    type: "application/pdf",
  });
  fireEvent.change(document.getElementById("statement-file")!, {
    target: { files: [namedFile] },
  });
  await screen.findByRole("heading", { name: "Categorize and update" });
}

function NavigationProbe({ onNavigate }: { readonly onNavigate: () => void }) {
  const { requestNavigation } = useNavigationGuard();

  return (
    <button
      type="button"
      onClick={() => {
        if (!requestNavigation(onNavigate)) onNavigate();
      }}
    >
      Attempt Space switch
    </button>
  );
}

async function beginRememberedRuleSave({
  fileName,
  transactionDescription,
  categoryLabel,
  editedDescription,
  amount,
  pattern,
}: {
  readonly fileName: string;
  readonly transactionDescription: string;
  readonly categoryLabel: string;
  readonly editedDescription: string;
  readonly amount: string;
  readonly pattern: string;
}) {
  const isPhone = window.innerWidth < 768;
  const table = isPhone
    ? null
    : screen.getByRole("table", {
        name: `Transactions parsed from ${fileName}`,
      });
  const list = isPhone
    ? screen.getByRole("list", { name: "Transactions to categorize" })
    : null;
  const transactionList = table ?? list;
  if (!transactionList) throw new Error("Categorize Transaction list is missing.");

  fireEvent.click(
    within(transactionList).getByRole("button", {
      name: `Edit ${transactionDescription}`,
    }),
  );

  const editor = isPhone
    ? screen.getByRole("dialog", { name: "Edit Transaction" })
    : transactionList;
  fireEvent.change(
    within(editor).getByRole("textbox", {
      name: `Description for ${transactionDescription}`,
    }),
    { target: { value: editedDescription } },
  );
  fireEvent.change(
    within(editor).getByRole("spinbutton", {
      name: `Amount for ${transactionDescription}`,
    }),
    { target: { value: amount } },
  );
  fireEvent.click(
    within(editor).getByRole("combobox", {
      name: `Category for ${transactionDescription}`,
    }),
  );
  fireEvent.click(screen.getByRole("option", { name: categoryLabel }));
  fireEvent.click(
    within(editor).getByRole("checkbox", {
      name: "Remember this category",
    }),
  );
  fireEvent.change(
    within(editor).getByRole("textbox", {
      name: `Pattern for ${transactionDescription}`,
    }),
    { target: { value: pattern } },
  );
  fireEvent.click(
    within(editor).getByRole("button", {
      name: isPhone ? "Save changes" : `Save changes to ${transactionDescription}`,
    }),
  );
}

async function reenterCategorizeWithPendingSave(
  fetchMock: ReturnType<typeof createFetchMock>,
) {
  fireEvent.click(screen.getByRole("button", { name: "Back to Upload" }));
  fireEvent.click(screen.getByRole("button", { name: "Leave Categorize" }));
  await screen.findByRole("heading", { name: "Upload your statement" });
  setStatementTransactions([
    {
      transactionDate: new Date("2026-08-29T00:00:00.000Z"),
      postingDate: new Date("2026-08-30T00:00:00.000Z"),
      description: "Fresh statement Transaction",
      amount: 25.5,
    },
  ]);
  await uploadStatementFile("reimported.pdf");
  await beginRememberedRuleSave({
    fileName: "reimported.pdf",
    transactionDescription: "Fresh statement Transaction",
    categoryLabel: "Groceries",
    editedDescription: "Current editor draft",
    amount: "42.00",
    pattern: "Current rule",
  });
  await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(2));
}

function setStatementTransactions(transactions: Statement["transactions"]) {
  vi.mocked(transformStatement).mockReturnValue({
    summary: {
      statementDate: new Date("2026-08-31T00:00:00.000Z"),
      provider: "BDO",
      accountType: "AMEX",
      totalTransactions: transactions.length,
      totalAmountDue: 25.5,
      totalExtractedAmount: 25.5,
    },
    transactions,
  });
}

function restoreDefaultStatement() {
  setStatementTransactions([
    {
      transactionDate: new Date("2026-08-29T00:00:00.000Z"),
      postingDate: new Date("2026-08-30T00:00:00.000Z"),
      description: "Green Market Cafe",
      amount: 25.5,
    },
  ]);
}

function renderStatementImportPage(
  fetchMock: ReturnType<typeof createFetchMock>,
  options: {
    readonly spaceId?: string;
    readonly onSpaceChange?: (spaceId?: string) => void;
    readonly navigationAction?: () => void;
  } = {},
) {
  vi.stubGlobal("fetch", fetchMock);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <NavigationGuardProvider>
      <ApiClientProvider
        config={apiConfig}
        getToken={vi.fn(async () => "session-token")}
      >
        <QueryClientProvider client={queryClient}>
          <StatementImportPage
            spaceId={options.spaceId}
            onSpaceChange={options.onSpaceChange}
            onViewTransactions={vi.fn()}
          />
          {options.navigationAction && (
            <NavigationProbe onNavigate={options.navigationAction} />
          )}
        </QueryClientProvider>
      </ApiClientProvider>
    </NavigationGuardProvider>,
  );

  return queryClient;
}

const originalWindowWidth = window.innerWidth;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalWindowWidth,
  });
  restoreDefaultStatement();
});

describe("StatementImportPage Space destination", () => {
  it("identifies a Personal destination with the User name", async () => {
    const fetchMock = createFetchMock({
      accessibleSpaces: [
        {
          id: "1",
          kind: "personal",
          status: "active",
          accessLevel: "write",
          members: [{ id: "1", name: "Ada Lovelace" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    renderStatementImportPage(fetchMock, {
      spaceId: "1",
      onSpaceChange: vi.fn(),
    });

    await screen.findByRole("heading", { name: "Upload your statement" });
    await uploadStatementFile("personal-statement.pdf");

    expect(
      screen.getByText("Destination: Personal Space · Ada Lovelace"),
    ).toBeTruthy();
  });

  it("keeps the selected destination across review and confirmation", async () => {
    const fetchMock = createFetchMock({
      accessibleSpaces: [
        {
          id: "1",
          kind: "personal",
          status: "active",
          accessLevel: "write",
          members: [{ id: "1", name: "Ada Lovelace" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "10",
          kind: "shared",
          status: "active",
          accessLevel: "write",
          members: [
            { id: "1", name: "Ada Lovelace" },
            { id: "2", name: "Grace Hopper" },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      categoryRules: [
        {
          id: "10",
          categoryId: "42",
          pattern: "Green Market Cafe",
          matchType: "exact",
        },
      ],
    });
    renderStatementImportPage(fetchMock, {
      spaceId: "10",
      onSpaceChange: vi.fn(),
    });

    await screen.findByRole("heading", { name: "Upload your statement" });
    expect(screen.getByText("Shared")).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/spaces/10/categories"),
        expect.anything(),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/spaces/10/category-rules"),
        expect.anything(),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/spaces/10/statement-imports"),
        expect.anything(),
      );
    });

    await uploadStatementFile("shared-statement.pdf");
    expect(
      screen.getByText("Destination: Shared Space · Ada Lovelace & Grace Hopper"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review 1 Transactions" }));
    await screen.findByRole("heading", { name: "Review your imported statement" });
    expect(
      screen.getByText("Destination: Shared Space · Ada Lovelace & Grace Hopper"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 Transactions" }));
    await screen.findByRole("heading", { name: "Statement imported" });
    expect(screen.getByText("Shared Space · Ada Lovelace & Grace Hopper")).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/spaces/10/statement-imports"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("identifies both Shared members in recent Statement Import history", async () => {
    const fetchMock = createFetchMock({
      accessibleSpaces: [
        {
          id: "1",
          kind: "personal",
          status: "active",
          accessLevel: "write",
          members: [{ id: "1", name: "Ada Lovelace" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "99",
          kind: "shared",
          status: "active",
          accessLevel: "write",
          members: [
            { id: "10", name: "Ada Lovelace" },
            { id: "11", name: "Grace Hopper" },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      recentImports: [
        {
          id: "101",
          fileName: "ada.pdf",
          statementDate: "2026-08-31",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-09-01T00:00:00.000Z",
          importedByUserId: "10",
          transactionCount: "1",
        },
        {
          id: "100",
          fileName: "grace.pdf",
          statementDate: "2026-08-30",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-08-31T00:00:00.000Z",
          importedByUserId: "11",
          transactionCount: "2",
        },
      ],
    });

    renderStatementImportPage(fetchMock, {
      spaceId: "99",
      onSpaceChange: vi.fn(),
    });

    await screen.findByRole("heading", { name: "Upload your statement" });
    expect(screen.getByText("Imported by Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Imported by Grace Hopper")).toBeTruthy();
  });

  it("retains Deleted user attribution in archived Shared history", async () => {
    const fetchMock = createFetchMock({
      accessibleSpaces: [
        {
          id: "77",
          kind: "shared",
          status: "archived",
          accessLevel: "read",
          members: [
            { id: "10", name: "Ada Lovelace" },
            { id: "12", name: "Deleted user" },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      recentImports: [
        {
          id: "100",
          fileName: "archived.pdf",
          statementDate: "2026-08-30",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-08-31T00:00:00.000Z",
          importedByUserId: "12",
          transactionCount: "1",
        },
      ],
    });

    renderStatementImportPage(fetchMock, {
      spaceId: "77",
      onSpaceChange: vi.fn(),
    });

    await screen.findByRole("heading", { name: "Upload your statement" });
    expect(screen.getByText("Imported by Deleted user")).toBeTruthy();
    expect(screen.queryByText(/Katherine|Grace Hopper|@/u)).toBeNull();
  });

  it("rejects a Shared history item whose importer is not a Space member", async () => {
    const fetchMock = createFetchMock({
      accessibleSpaces: [
        {
          id: "99",
          kind: "shared",
          status: "active",
          accessLevel: "write",
          members: [{ id: "10", name: "Ada Lovelace" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      recentImports: [
        {
          id: "100",
          fileName: "unknown.pdf",
          statementDate: "2026-08-30",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-08-31T00:00:00.000Z",
          importedByUserId: "99",
          transactionCount: "1",
        },
      ],
    });

    renderStatementImportPage(fetchMock, {
      spaceId: "99",
      onSpaceChange: vi.fn(),
    });

    expect(
      await screen.findByText(
        "The API returned an unknown Statement Import importer.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Imported by/u)).toBeNull();
  });
});

describe("StatementImportPage GCash recipient flow", () => {
  it("keeps matching Debits visible and out of Review totals and confirmation", async () => {
    const recipient = "09999999999";
    const firstTransfer =
      "Transfer from 09111111111 to 09999999999 [Ref. #: 5043775892919]";
    const secondTransfer =
      "Transfer from 09222222222 to 09999999999 [Ref. #: 5044211321443]";
    const parsedPhoneDescription =
      "Buy Load Transaction for 09999999999 [Ref. #: 5000073058896]";
    const parsedStatement: Statement = {
      summary: {
        statementDate: new Date("2026-08-31T00:00:00.000Z"),
        provider: "GCash",
        accountType: "E-Wallet",
        totalTransactions: 3,
        totalAmountDue: 65,
        totalExtractedAmount: 65,
      },
      transactions: [
        {
          transactionDate: new Date("2026-08-29T00:00:00.000Z"),
          postingDate: new Date("2026-08-29T00:00:00.000Z"),
          description: firstTransfer,
          amount: 40,
        },
        {
          transactionDate: new Date("2026-08-30T00:00:00.000Z"),
          postingDate: new Date("2026-08-30T00:00:00.000Z"),
          description: secondTransfer,
          amount: 15,
        },
        {
          transactionDate: new Date("2026-08-31T00:00:00.000Z"),
          postingDate: new Date("2026-08-31T00:00:00.000Z"),
          description: parsedPhoneDescription,
          amount: 10,
        },
      ],
    };
    vi.mocked(transformStatement).mockReturnValueOnce(parsedStatement);

    const fetchMock = createFetchMock({
      categoryRules: [
        {
          id: "10",
          categoryId: "42",
          pattern: parsedPhoneDescription,
          matchType: "exact",
        },
      ],
    });
    renderStatementImportPage(fetchMock);

    await screen.findByRole("heading", { name: "Upload your statement" });
    fireEvent.change(document.getElementById("statement-file")!, {
      target: {
        files: [new File(["pdf"], "wallet-export.pdf", { type: "application/pdf" })],
      },
    });

    await screen.findByRole("dialog", {
      name: "Identify incoming GCash transfers",
    });
    fireEvent.change(screen.getByLabelText("GCash mobile number (optional)"), {
      target: { value: recipient },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByRole("heading", { name: "Categorize and update" });
    const categorizeTable = screen.getByRole("table", {
      name: "Transactions parsed from wallet-export.pdf",
    });
    for (const description of [firstTransfer, secondTransfer]) {
      const row = within(categorizeTable).getByText(description).closest("tr");
      expect(row && within(row).getByText("Debit")).toBeTruthy();
      expect(row && within(row).getByText("Excluded")).toBeTruthy();
      expect(
        row &&
          within(row).getByRole("button", {
            name: `Debit ${description} is permanently excluded`,
          }),
      ).toHaveProperty("disabled", true);
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Review 1 Transactions" }),
    );
    await screen.findByRole("heading", {
      name: "Review your imported statement",
    });
    const mobileReviewSummary = screen.getAllByRole("region", {
      name: "Statement review summary",
    })[0];
    const includedMetric = within(mobileReviewSummary as HTMLElement).getByText(
      "Transactions included",
    ).parentElement;
    expect(includedMetric?.textContent).toContain("1");
    const totalDebitsMetric = screen.getByText("Total debits").parentElement;
    expect(totalDebitsMetric?.textContent).toContain("₱10.00");
    expect(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    );
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            init?.method === "POST" &&
            new URL(input.toString()).pathname.endsWith("/statement-imports"),
        ),
      ).toBe(true);
    });

    const commitRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        init?.method === "POST" &&
        new URL(input.toString()).pathname.endsWith("/statement-imports"),
    );
    const payload = JSON.parse(String(commitRequest?.[1]?.body)) as {
      readonly transactions: readonly { readonly description: string }[];
      readonly [key: string]: unknown;
    };
    expect(payload).not.toHaveProperty("gcashMobileNumber");
    expect(payload.transactions).toEqual([
      expect.objectContaining({ description: parsedPhoneDescription }),
    ]);
    expect(
      payload.transactions.some(({ description }) =>
        description.includes("Transfer from "),
      ),
    ).toBe(false);
    expect(payload.transactions[0]?.description).toContain(recipient);
  });
});

describe("StatementImportPage confirmation lifecycle", () => {
  const readyCategoryRules = [
    {
      id: "1",
      categoryId: "42",
      pattern: "Green Market Cafe",
      matchType: "exact",
    },
  ];

  it("renders the committed result from the workflow and starts another import", async () => {
    const fetchMock = createFetchMock({ categoryRules: readyCategoryRules });
    await openReadyStatementImportReview(fetchMock);

    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    );
    await screen.findByRole("heading", { name: "Statement imported" });
    expect(screen.getByText("Import complete")).toBeTruthy();

    const commitRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        init?.method === "POST" &&
        new URL(input.toString()).pathname.endsWith("/statement-imports"),
    );
    const payload = JSON.parse(String(commitRequest?.[1]?.body)) as {
      readonly acknowledgeProbableDuplicates: boolean;
      readonly transactions: readonly { readonly description: string }[];
    };
    expect(payload.acknowledgeProbableDuplicates).toBe(false);
    expect(payload.transactions).toEqual([
      expect.objectContaining({ description: "Green Market Cafe" }),
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Import another statement" }),
    );
    await screen.findByRole("heading", { name: "Upload your statement" });
  });

  it("keeps normal confirmation retryable after a failed request", async () => {
    let attempt = 0;
    const fetchMock = createFetchMock({
      categoryRules: readyCategoryRules,
      commitResponse: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse(
              {
                error: {
                  code: "INTERNAL_SERVER_ERROR",
                  message: "The API is unavailable.",
                  details: [],
                },
              },
              500,
            )
          : jsonResponse(
              {
                id: "100",
                fileName: "statement.pdf",
                statementDate: "2026-08-31",
                bank: "BDO",
                cardType: "AMEX",
                importedAt: "2026-09-01T00:00:00.000Z",
                importedByUserId: "1",
              },
              201,
            );
      },
    });
    await openReadyStatementImportReview(fetchMock);

    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    );
    await waitFor(() => {
      expect(screen.getAllByText("The API is unavailable.")).toHaveLength(2);
    });
    const retryButton = screen.getByRole("button", {
      name: "Import 1 Transactions",
    });
    expect(retryButton).toHaveProperty("disabled", false);

    fireEvent.click(retryButton);
    await screen.findByRole("heading", { name: "Statement imported" });
    expect(attempt).toBe(2);
  });

  it("requires acknowledgement for Probable Duplicates and blocks an Exact File Duplicate", async () => {
    const probableResponse = () =>
      jsonResponse(
        {
          error: {
            code: "STATEMENT_IMPORT_PROBABLE_DUPLICATES",
            message: "Probable duplicate Transactions found.",
            details: [
              {
                field: "description",
                code: "probable_duplicate",
                message: "Description matched an existing Transaction.",
                transactionIndexes: [0],
                committedTransactionIds: ["existing-transaction"],
              },
            ],
          },
        },
        409,
      );
    const probableFetchMock = createFetchMock({
      categoryRules: readyCategoryRules,
      commitResponse: probableResponse,
    });
    await openReadyStatementImportReview(probableFetchMock);

    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    );
    await waitFor(() => {
      expect(
        screen.getAllByText("Probable duplicate Transactions found."),
      ).toHaveLength(2);
    });
    expect(
      screen.getAllByRole("button", { name: "Import anyway" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Resolve duplicate warning above" }),
    ).toHaveProperty("disabled", true);

    const importAnyway = screen.getAllByRole("button", {
      name: "Import anyway",
    })[0];
    if (!importAnyway) throw new Error("Import anyway action is missing.");
    fireEvent.click(importAnyway);
    await waitFor(() => {
      expect(
        screen.getAllByText("Probable duplicate Transactions found."),
      ).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Import anyway" })).toBeNull();
    });
    const commitRequests = probableFetchMock.mock.calls.filter(
      ([input, init]) =>
        init?.method === "POST" &&
        new URL(input.toString()).pathname.endsWith("/statement-imports"),
    );
    const acknowledgementPayload = JSON.parse(
      String(commitRequests.at(-1)?.[1]?.body),
    ) as { readonly acknowledgeProbableDuplicates: boolean };
    expect(acknowledgementPayload.acknowledgeProbableDuplicates).toBe(true);

    const probableBack = screen.getAllByRole("button", {
      name: "Back to Categorize",
    })[0];
    if (!probableBack) throw new Error("Review Back button is missing.");
    fireEvent.click(probableBack);
    await screen.findByRole("heading", { name: "Categorize and update" });
    fireEvent.click(
      screen.getByRole("button", { name: "Review 1 Transactions" }),
    );
    await screen.findByRole("heading", { name: "Review your imported statement" });
    expect(
      screen.queryByText("Probable duplicate Transactions found."),
    ).toBeNull();

    const exactFetchMock = createFetchMock({
      categoryRules: readyCategoryRules,
      commitResponse: () =>
        jsonResponse(
          {
            error: {
              code: "STATEMENT_IMPORT_FILE_ALREADY_EXISTS",
              message: "The statement file has already been imported.",
              details: [],
            },
          },
          409,
        ),
    });
    cleanup();
    await openReadyStatementImportReview(exactFetchMock);
    fireEvent.click(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    );
    await waitFor(() => {
      expect(screen.getAllByText("Statement already imported")).toHaveLength(2);
    });
    expect(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    ).toHaveProperty("disabled", true);
  });
});

describe("StatementImportPage Categorize lifecycle", () => {
  it("confirms before leaving Categorize even when no transactions changed", async () => {
    const fetchMock = createFetchMock();
    renderStatementImportPage(fetchMock);
    await screen.findByRole("heading", { name: "Upload your statement" });
    await uploadStatementFile("statement.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Back to Upload" }));

    expect(
      screen.getByRole("dialog", { name: "Leave Statement Import?" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Stay in Categorize" }),
    );
    expect(screen.queryByRole("dialog", { name: "Leave Statement Import?" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Categorize and update" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to Upload" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Categorize" }));
    await screen.findByRole("heading", { name: "Upload your statement" });
  });

  it("discards Categorize before completing a requested Space switch", async () => {
    const fetchMock = createFetchMock();
    const navigationAction = vi.fn();
    renderStatementImportPage(fetchMock, { navigationAction });
    await screen.findByRole("heading", { name: "Upload your statement" });
    await uploadStatementFile("statement.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Attempt Space switch" }));
    expect(screen.getByRole("dialog", { name: "Leave Statement Import?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay in Categorize" }));
    expect(navigationAction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Categorize and update" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Attempt Space switch" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Categorize" }));
    expect(navigationAction).toHaveBeenCalledTimes(1);
    await screen.findByRole("heading", { name: "Upload your statement" });
  });

  it("guards Review navigation and preserves reviewed Transactions when canceled", async () => {
    const fetchMock = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Green Market Cafe",
          matchType: "exact",
        },
      ],
    });
    const navigationAction = vi.fn();
    await openReadyStatementImportReview(fetchMock, { navigationAction });

    fireEvent.click(screen.getByRole("button", { name: "Attempt Space switch" }));
    expect(screen.getByRole("dialog", { name: "Leave Statement Import?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay in Review" }));

    expect(navigationAction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Review your imported statement" })).toBeTruthy();
    expect(screen.getAllByText("Green Market Cafe").length).toBeGreaterThan(0);
  });

  it("discards Review before completing a requested Space switch", async () => {
    const fetchMock = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Green Market Cafe",
          matchType: "exact",
        },
      ],
    });
    const navigationAction = vi.fn();
    await openReadyStatementImportReview(fetchMock, { navigationAction });

    fireEvent.click(screen.getByRole("button", { name: "Attempt Space switch" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Review" }));

    expect(navigationAction).toHaveBeenCalledTimes(1);
    await screen.findByRole("heading", { name: "Upload your statement" });
  });

  it("allows a Space switch after the Statement Import finishes", async () => {
    const fetchMock = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Green Market Cafe",
          matchType: "exact",
        },
      ],
    });
    const navigationAction = vi.fn();
    await openReadyStatementImportReview(fetchMock, { navigationAction });

    fireEvent.click(screen.getByRole("button", { name: "Import 1 Transactions" }));
    await screen.findByRole("heading", { name: "Statement imported" });
    fireEvent.click(screen.getByRole("button", { name: "Attempt Space switch" }));

    expect(navigationAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Leave Statement Import?" })).toBeNull();
  });

  it("discards an in-flight confirmation before completing a requested Space switch", async () => {
    const commitResponse = createDeferred<Response>();
    const fetchMock = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Green Market Cafe",
          matchType: "exact",
        },
      ],
      commitResponse: () => commitResponse.promise,
    });
    const navigationAction = vi.fn();
    await openReadyStatementImportReview(fetchMock, { navigationAction });

    fireEvent.click(screen.getByRole("button", { name: "Import 1 Transactions" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            init?.method === "POST" &&
            new URL(input.toString()).pathname.endsWith("/statement-imports"),
        ),
      ).toBe(true);
    });
    expect(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    ).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Attempt Space switch" }));
    expect(screen.getByRole("button", { name: "Leave Review" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Leave Review" }));
    await screen.findByRole("heading", { name: "Upload your statement" });
    expect(navigationAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      commitResponse.resolve(
        jsonResponse(
          {
            id: "100",
            fileName: "statement.pdf",
            statementDate: "2026-08-31",
            bank: "BDO",
            cardType: "AMEX",
            importedAt: "2026-09-01T00:00:00.000Z",
            importedByUserId: "1",
          },
          201,
        ),
      );
      await commitResponse.promise;
    });
    expect(screen.getByRole("heading", { name: "Upload your statement" })).toBeTruthy();
  });

  it("blocks browser exit while Categorize is active", async () => {
    const fetchMock = createFetchMock();
    renderStatementImportPage(fetchMock);
    await screen.findByRole("heading", { name: "Upload your statement" });
    await uploadStatementFile("statement.pdf");

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("abandons the editor when a rule query error displaces Categorize", async () => {
    let failCategoryRules = false;
    const fetchMock = createFetchMock({
      failCategoryRules: () => failCategoryRules,
    });
    const queryClient = renderStatementImportPage(fetchMock);
    await screen.findByRole("heading", { name: "Upload your statement" });
    await uploadStatementFile("statement.pdf");

    const table = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.change(
      within(table).getByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
      { target: { value: "Unsaved query-error draft" } },
    );

    failCategoryRules = true;
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["statement-import", "rules"],
      });
    });
    expect(
      await screen.findByText("Category Rules are temporarily unavailable."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
    ).toBeNull();

    failCategoryRules = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Categorize and update" });

    expect(
      within(screen.getByRole("table", {
        name: "Transactions parsed from statement.pdf",
      })).queryByText("Unsaved query-error draft"),
    ).toBeNull();
    expect(
      screen.getByText("Green Market Cafe", { selector: "span" }),
    ).toBeTruthy();
  });

  it("retains the accepted statement when active Categories temporarily disappear", async () => {
    let categoriesUnavailable = false;
    const fetchMock = createFetchMock({
      categoriesResponse: () =>
        categoriesUnavailable
          ? [
              {
                id: "88",
                name: "Archived",
                description: null,
                isActive: false,
              },
            ]
          : [
              {
                id: "42",
                name: "Housing",
                description: null,
                isActive: true,
              },
              {
                id: "43",
                name: "Groceries",
                description: null,
                isActive: true,
              },
            ],
    });
    const queryClient = renderStatementImportPage(fetchMock);
    await screen.findByRole("heading", { name: "Upload your statement" });
    await uploadStatementFile("statement.pdf");

    categoriesUnavailable = true;
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["statement-import", "categories"],
      });
    });
    expect(
      await screen.findByRole("heading", {
        name: "No active Categories configured",
      }),
    ).toBeTruthy();

    categoriesUnavailable = false;
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["statement-import", "categories"],
      });
    });
    await screen.findByRole("heading", { name: "Categorize and update" });
    expect(
      within(screen.getByRole("table", {
        name: "Transactions parsed from statement.pdf",
      })).getByText("Green Market Cafe"),
    ).toBeTruthy();
  });

  it("keeps the mounted rule snapshot stable and refreshes it on reentry", async () => {
    let useRefreshedRules = false;
    const initialRules = [
      {
        id: "1",
        categoryId: "42",
        pattern: "Green Market Cafe",
        matchType: "exact",
      },
    ];
    const refreshedRules = [
      ...initialRules,
      {
        id: "4",
        categoryId: "42",
        pattern: "Cafe",
        matchType: "contains",
      },
    ];
    const fetchMock = createFetchMock({
      categoryRules: initialRules,
      categoryRulesResponse: () =>
        useRefreshedRules ? refreshedRules : initialRules,
    });
    const queryClient = renderStatementImportPage(fetchMock);
    await screen.findByRole("heading", { name: "Upload your statement" });
    await uploadStatementFile("statement.pdf");
    expect(screen.getByText("1 persisted Rules")).toBeTruthy();

    useRefreshedRules = true;
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ["statement-import", "rules"],
      });
    });
    expect(screen.getByText("1 persisted Rules")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review 1 Transactions" }));
    await screen.findByRole("heading", { name: "Review your imported statement" });
    fireEvent.click(screen.getByRole("button", { name: "Back to Categorize" }));
    await screen.findByRole("heading", { name: "Categorize and update" });
    expect(screen.getByText("2 persisted Rules")).toBeTruthy();
  });
});

describe("StatementImportPage rule resolution", () => {
  it("keeps retained rules for inactive Categories in remember conflict lookup", async () => {
    const fetchMock = createFetchMock();
    renderStatementImportPage(fetchMock);

    await screen.findByRole("heading", { name: "Upload your statement" });
    expect(
      screen.getByText("BDO AMEX, EastWest Visa, and GCash E-Wallet"),
    ).toBeTruthy();
    const file = new File(["pdf"], "statement.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(document.getElementById("statement-file")!, {
      target: { files: [file] },
    });

    await screen.findByRole("heading", { name: "Categorize and update" });
    const desktopTable = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    expect(
      within(desktopTable).getByText("Multiple categories matched"),
    ).toBeTruthy();
    expect(within(desktopTable).getByText("Housing, Groceries")).toBeTruthy();
    expect(screen.getAllByText("1 Ambiguous")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Review 1 Transactions" }),
    ).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(screen.getByRole("option", { name: "Unmapped" }));
    expect(screen.getAllByText("1 of 1 Transactions")).toHaveLength(2);

    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    expect(
      screen
        .getByRole("checkbox", {
          name: "Remember this category",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");

    fireEvent.click(
      within(desktopTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );

    await waitFor(() => {
      expect(
        within(desktopTable).queryByText("Multiple categories matched"),
      ).toBeNull();
    });
    expect(
      screen.getByRole("button", { name: "Review 1 Transactions" }),
    ).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    expect(
      screen
        .getByRole("checkbox", {
          name: "Remember this category",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Exact" }));
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );

    expect(await screen.findByText(/already assigns Category 88/)).toBeTruthy();
    expect(
      await screen.findByText(/Existing Category: .*Archived/),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          init?.method === "POST" &&
          new URL(input.toString()).pathname.endsWith("/category-rules"),
      ),
    ).toHaveLength(0);
  });

  it("persists a selected Contains pattern through the Statement Import page", async () => {
    const fetchMock = createFetchMock({
      createdRule: {
        id: "4",
        categoryId: "42",
        pattern: "Cafe",
        matchType: "contains",
      },
    });
    renderStatementImportPage(fetchMock);

    await screen.findByRole("heading", { name: "Upload your statement" });
    const file = new File(["pdf"], "statement.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(document.getElementById("statement-file")!, {
      target: { files: [file] },
    });

    await screen.findByRole("heading", { name: "Categorize and update" });
    const desktopTable = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      within(desktopTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    expect(
      screen.getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }).textContent,
    ).toContain("Contains");
    expect(
      screen.getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
    ).toHaveProperty("value", "Green Market Cafe");
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
      { target: { value: "Cafe" } },
    );
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );

    await waitFor(() => {
      expect(
        within(desktopTable).queryByRole("button", {
          name: "Save changes to Green Market Cafe",
        }),
      ).toBeNull();
    });

    const ruleRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        init?.method === "POST" &&
        new URL(input.toString()).pathname.endsWith("/category-rules"),
    );
    expect(ruleRequest?.[1]?.body).toBe(
      JSON.stringify({
        pattern: "CAFE",
        categoryId: "42",
        matchType: "contains",
      }),
    );
  });

  it("persists a selected Exact pattern from the mobile Categorize dialog", async () => {
    const fetchMock = createFetchMock({
      createdRule: {
        id: "4",
        categoryId: "42",
        pattern: "CAFE",
        matchType: "exact",
      },
    });
    renderStatementImportPage(fetchMock);

    await screen.findByRole("heading", { name: "Upload your statement" });
    const file = new File(["pdf"], "statement.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(document.getElementById("statement-file")!, {
      target: { files: [file] },
    });

    await screen.findByRole("heading", { name: "Categorize and update" });
    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(editor).getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Exact" }));
    fireEvent.change(
      within(editor).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
      { target: { value: "  Cafe  " } },
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Edit Transaction" }),
      ).toBeNull();
    });

    const ruleRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        init?.method === "POST" &&
        new URL(input.toString()).pathname.endsWith("/category-rules"),
    );
    expect(ruleRequest?.[1]?.body).toBe(
      JSON.stringify({ pattern: "CAFE", categoryId: "42", matchType: "exact" }),
    );
  });
});

describe("StatementImportPage pending Category Rule saves", () => {
  it("locks the shared Categorize edit until one pending save applies", async () => {
    setStatementTransactions([
      {
        transactionDate: new Date("2026-08-29T00:00:00.000Z"),
        postingDate: new Date("2026-08-30T00:00:00.000Z"),
        description: "Green Market Cafe",
        amount: 25.5,
      },
      {
        transactionDate: new Date("2026-08-27T00:00:00.000Z"),
        postingDate: new Date("2026-08-28T00:00:00.000Z"),
        description: "Green Grocer",
        amount: 8.25,
      },
    ]);
    const ruleResponse = createDeferred<Response>();
    const fetchMock = createFetchMock({
      createdRule: {
        id: "4",
        categoryId: "42",
        pattern: "CAFE",
        matchType: "contains",
      },
      createRuleResponse: () => ruleResponse.promise,
    });
    await openStatementImportCategorize(fetchMock);

    const table = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      within(table).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Remember this category" }),
    );
    const pattern = screen.getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    fireEvent.change(pattern, { target: { value: "Cafe" } });

    const saveButton = within(table).getByRole("button", {
      name: "Save changes to Green Market Cafe",
    });
    act(() => {
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
    });

    await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));
    expect(screen.getByRole("status").textContent).toContain("Saving…");
    expect(
      screen.getByLabelText("Date for Green Market Cafe"),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("spinbutton", { name: "Amount for Green Market Cafe" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("checkbox", { name: "Remember this category" }),
    ).toHaveProperty("disabled", true);
    expect(pattern).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }),
    ).toHaveProperty("disabled", true);
    expect(saveButton).toHaveProperty("disabled", true);
    expect(
      within(table).getByRole("button", {
        name: "Cancel changes to Green Market Cafe",
      }),
    ).toHaveProperty("disabled", true);
    expect(
      within(table).getByRole("button", {
        name: "Exclude Green Grocer",
      }),
    ).toHaveProperty("disabled", true);
    expect(
      within(table).getByRole("button", { name: "Edit Green Grocer" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: /Review 2 Transactions/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Back to Upload" })).toHaveProperty(
      "disabled",
      false,
    );

    const search = screen.getByRole("textbox", { name: "Search descriptions" });
    fireEvent.change(search, { target: { value: "nothing matches" } });
    expect(search).toHaveProperty("value", "nothing matches");
    expect(screen.getByRole("button", { name: "Clear filters" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status").textContent).toContain("Saving…");
    expect(categoryRulePostCount(fetchMock)).toBe(1);

    ruleResponse.resolve(
      jsonResponse(
        {
          id: "4",
          categoryId: "42",
          pattern: "CAFE",
          matchType: "contains",
        },
        201,
      ),
    );
    await waitFor(() => {
      expect(
        within(table).queryByRole("button", {
          name: "Save changes to Green Market Cafe",
        }),
      ).toBeNull();
    });
    expect(categoryRulePostCount(fetchMock)).toBe(1);
    expect(within(table).getByText("Manual")).toBeTruthy();
  });

  it("retains the complete draft after a failed request and allows retry", async () => {
    const failedResponse = createDeferred<Response>();
    let saveAttempt = 0;
    const fetchMock = createFetchMock({
      createdRule: {
        id: "4",
        categoryId: "42",
        pattern: "CAFE",
        matchType: "contains",
      },
      createRuleResponse: () => {
        saveAttempt += 1;
        return saveAttempt === 1
          ? failedResponse.promise
          : Promise.resolve(
              jsonResponse(
                {
                  id: "4",
                  categoryId: "42",
                  pattern: "CAFE",
                  matchType: "contains",
                },
                201,
              ),
            );
      },
    });
    await openStatementImportCategorize(fetchMock);

    const table = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      within(table).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Remember this category" }),
    );
    const pattern = screen.getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    fireEvent.change(pattern, { target: { value: "Cafe" } });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );
    await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));

    const search = screen.getByRole("textbox", { name: "Search descriptions" });
    fireEvent.change(search, { target: { value: "nothing matches" } });
    expect(search).toHaveProperty("value", "nothing matches");

    failedResponse.resolve(
      jsonResponse(
        {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "The Category Rule could not be saved.",
            details: [],
          },
        },
        500,
      ),
    );
    expect(
      await screen.findByText("The Category Rule could not be saved."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
    ).toHaveProperty("value", "Green Market Cafe");
    expect(
      screen.getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }).textContent,
    ).toContain("Housing");
    expect(
      screen
        .getByRole("checkbox", { name: "Remember this category" })
        .getAttribute("data-state"),
    ).toBe("checked");
    const recoveredPattern = screen.getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    expect(recoveredPattern).toHaveProperty("value", "Cafe");
    expect(recoveredPattern).toHaveProperty("disabled", false);
    expect(
      within(table).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    ).toHaveProperty("disabled", false);

    fireEvent.click(
      within(table).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );
    await waitFor(() => {
      expect(
        within(table).queryByRole("button", {
          name: "Save changes to Green Market Cafe",
        }),
      ).toBeNull();
    });
    expect(categoryRulePostCount(fetchMock)).toBe(2);
    expect(within(table).getByText("Manual")).toBeTruthy();
  });

  it("keeps a failed desktop edit recoverable after resizing to phone", async () => {
    const failedResponse = createDeferred<Response>();
    let saveAttempt = 0;
    const fetchMock = createFetchMock({
      createdRule: {
        id: "4",
        categoryId: "42",
        pattern: "CAFE",
        matchType: "contains",
      },
      createRuleResponse: () => {
        saveAttempt += 1;
        return saveAttempt === 1
          ? failedResponse.promise
          : Promise.resolve(
              jsonResponse(
                {
                  id: "4",
                  categoryId: "42",
                  pattern: "CAFE",
                  matchType: "contains",
                },
                201,
              ),
            );
      },
    });
    await openStatementImportCategorize(fetchMock);

    const table = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Remember this category" }),
    );
    const pattern = screen.getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    fireEvent.change(pattern, { target: { value: "Cafe" } });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );
    await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    fireEvent(window, new Event("resize"));
    await screen.findByRole("dialog", {
      name: "Edit Transaction",
    });

    failedResponse.resolve(
      jsonResponse(
        {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "The Category Rule could not be saved.",
            details: [],
          },
        },
        500,
      ),
    );
    expect(
      await screen.findByText("The Category Rule could not be saved."),
    ).toBeTruthy();
    const recoveredDialog = screen.getByRole("dialog", {
      name: "Edit Transaction",
    });
    expect(
      within(recoveredDialog).getByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
    ).toHaveProperty("value", "Green Market Cafe");
    expect(
      within(recoveredDialog).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }).textContent,
    ).toContain("Housing");
    expect(
      within(recoveredDialog).getByRole("checkbox", {
        name: "Remember this category",
      }).getAttribute("data-state"),
    ).toBe("checked");
    expect(
      within(recoveredDialog).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
    ).toHaveProperty("value", "Cafe");
    expect(
      within(recoveredDialog).getByRole("button", { name: "Save changes" }),
    ).toHaveProperty("disabled", false);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    fireEvent(window, new Event("resize"));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Edit Transaction" }),
      ).toBeNull();
    });
    expect(
      within(table).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
    ).toHaveProperty("value", "Cafe");

    fireEvent.click(
      within(table).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );
    await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(2));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit Transaction" })).toBeNull();
    });
  });

  it("keeps a conflicting draft open so its rule can be corrected and retried", async () => {
    const fetchMock = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Green",
          matchType: "contains",
        },
        {
          id: "2",
          categoryId: "43",
          pattern: "Market",
          matchType: "contains",
        },
        {
          id: "3",
          categoryId: "43",
          pattern: "Green Market Cafe",
          matchType: "contains",
        },
        {
          id: "88",
          categoryId: "88",
          pattern: "Green Market Cafe",
          matchType: "exact",
        },
      ],
      createdRule: {
        id: "4",
        categoryId: "42",
        pattern: "CAFE",
        matchType: "contains",
      },
    });
    await openStatementImportCategorize(fetchMock);

    const table = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      within(table).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Remember this category" }),
    );
    const pattern = screen.getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    fireEvent.change(pattern, { target: { value: "Green Market Cafe" } });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );

    expect(
      await screen.findByText(/already assigns Category 43/u),
    ).toBeTruthy();
    expect(pattern).toHaveProperty("value", "Green Market Cafe");
    expect(
      screen
        .getByRole("checkbox", { name: "Remember this category" })
        .getAttribute("data-state"),
    ).toBe("checked");
    expect(categoryRulePostCount(fetchMock)).toBe(0);

    fireEvent.change(pattern, { target: { value: "Cafe" } });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );
    await waitFor(() => {
      expect(
        within(table).queryByRole("button", {
          name: "Save changes to Green Market Cafe",
        }),
      ).toBeNull();
    });
    expect(categoryRulePostCount(fetchMock)).toBe(1);
  });

  it("keeps the phone editor open and allows filtering during a pending save", async () => {
    const ruleResponse = createDeferred<Response>();
    const fetchMock = createFetchMock({
      createdRule: {
        id: "4",
        categoryId: "42",
        pattern: "CAFE",
        matchType: "contains",
      },
      createRuleResponse: () => ruleResponse.promise,
    });
    await openStatementImportCategorize(fetchMock);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit Transaction" });
    fireEvent.click(
      within(dialog).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    const pattern = within(dialog).getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    fireEvent.change(pattern, { target: { value: "Cafe" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));
    expect(screen.getByRole("status").textContent).toContain("Saving…");
    const pendingDialog = screen.getByRole("dialog", {
      name: "Edit Transaction",
    });
    const pendingPattern = within(pendingDialog).getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    expect(
      within(pendingDialog).getByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
    ).toHaveProperty("disabled", true);
    expect(pendingPattern).toHaveProperty("disabled", true);
    expect(
      within(pendingDialog).getByRole("checkbox", {
        name: "Remember this category",
      }),
    ).toHaveProperty("disabled", true);
    expect(
      within(pendingDialog).getByRole("button", { name: "Cancel" }),
    ).toHaveProperty("disabled", true);
    expect(
      within(pendingDialog).getByRole("button", { name: "Save changes" }),
    ).toHaveProperty("disabled", true);
    expect(
      within(pendingDialog).getByRole("button", { name: "Close dialog" }),
    ).toHaveProperty("disabled", true);
    expect(
      document.querySelector('[data-slot="dialog-overlay"]'),
    ).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("dialog", { name: "Edit Transaction" })).toBeTruthy();
    const search = screen.getByRole("textbox", {
      name: "Search Transactions",
    });
    fireEvent.change(search, { target: { value: "no matching Transaction" } });
    expect(search).toHaveProperty("value", "no matching Transaction");
    expect(screen.getByRole("dialog", { name: "Edit Transaction" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to Upload" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Categorize" }));
    expect(
      await screen.findByRole("heading", { name: "Upload your statement" }),
    ).toBeTruthy();

    await act(async () => {
      ruleResponse.resolve(
        jsonResponse(
          {
            id: "4",
            categoryId: "42",
            pattern: "CAFE",
            matchType: "contains",
          },
          201,
        ),
      );
      await ruleResponse.promise;
    });
    expect(
      screen.getByRole("heading", { name: "Upload your statement" }),
    ).toBeTruthy();
  });

  it.each([
    { presentation: "desktop", width: 1024 },
    { presentation: "phone", width: 390 },
  ])(
    "keeps reimported Transactions unchanged when an abandoned save succeeds on $presentation",
    async ({ width }) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const abandonedResponse = createDeferred<Response>();
      const fetchMock = createFetchMock({
        createRuleResponse: () => abandonedResponse.promise,
      });
      await openStatementImportCategorize(fetchMock);

      await beginRememberedRuleSave({
        fileName: "statement.pdf",
        transactionDescription: "Green Market Cafe",
        categoryLabel: "Housing",
        editedDescription: "Abandoned draft",
        amount: "91.00",
        pattern: "Abandoned rule",
      });
      await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));

      fireEvent.click(screen.getByRole("button", { name: "Back to Upload" }));
      fireEvent.click(screen.getByRole("button", { name: "Leave Categorize" }));
      await screen.findByRole("heading", { name: "Upload your statement" });
      setStatementTransactions([
        {
          transactionDate: new Date("2026-08-29T00:00:00.000Z"),
          postingDate: new Date("2026-08-30T00:00:00.000Z"),
          description: "Fresh statement Transaction",
          amount: 25.5,
        },
      ]);
      await uploadStatementFile("reimported.pdf");

      const transactions =
        width < 768
          ? screen.getByRole("list", { name: "Transactions to categorize" })
          : screen.getByRole("table", {
              name: "Transactions parsed from reimported.pdf",
            });

      await act(async () => {
        abandonedResponse.resolve(
          jsonResponse(
            {
              id: "4",
              categoryId: "42",
              pattern: "ABANDONED RULE",
              matchType: "contains",
            },
            201,
          ),
        );
        await abandonedResponse.promise;
      });

      expect(
        within(transactions).getByText("Fresh statement Transaction"),
      ).toBeTruthy();
      expect(within(transactions).getByText("-₱25.50")).toBeTruthy();
      expect(
        within(transactions).getAllByText("Unmapped").length,
      ).toBeGreaterThan(0);
      expect(within(transactions).queryByText("Abandoned draft")).toBeNull();
      expect(within(transactions).queryByText("Housing")).toBeNull();
      expect(within(transactions).queryByText("-₱91.00")).toBeNull();
    },
  );

  it.each([
    { presentation: "desktop", width: 1024 },
    { presentation: "phone", width: 390 },
  ])(
    "does not apply an old save to a reimported Transaction while its $presentation editor is saving",
    async ({ width }) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const abandonedResponse = createDeferred<Response>();
      const currentResponse = createDeferred<Response>();
      let saveAttempt = 0;
      const fetchMock = createFetchMock({
        createRuleResponse: () => {
          saveAttempt += 1;
          return saveAttempt === 1
            ? abandonedResponse.promise
            : currentResponse.promise;
        },
      });
      await openStatementImportCategorize(fetchMock);

      await beginRememberedRuleSave({
        fileName: "statement.pdf",
        transactionDescription: "Green Market Cafe",
        categoryLabel: "Housing",
        editedDescription: "Abandoned draft",
        amount: "91.00",
        pattern: "Abandoned rule",
      });
      await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));

      await reenterCategorizeWithPendingSave(fetchMock);

      await act(async () => {
        abandonedResponse.resolve(
          jsonResponse(
            {
              id: "4",
              categoryId: "42",
              pattern: "ABANDONED RULE",
              matchType: "contains",
            },
            201,
          ),
        );
        await abandonedResponse.promise;
      });

      expect(screen.getByRole("status").textContent).toContain("Saving…");
      const table = screen.getByRole("table", {
        name: "Transactions parsed from reimported.pdf",
      });
      const currentEditor =
        width < 768
          ? screen.getByRole("dialog", { name: "Edit Transaction" })
          : table;
      expect(
        within(currentEditor).getByRole("textbox", {
          name: "Description for Fresh statement Transaction",
        }),
      ).toHaveProperty("value", "Current editor draft");
      expect(
        within(currentEditor).getByRole("spinbutton", {
          name: "Amount for Fresh statement Transaction",
        }),
      ).toHaveProperty("value", "42.00");
      expect(categoryRulePostCount(fetchMock)).toBe(2);

      await act(async () => {
        currentResponse.resolve(
          jsonResponse(
            {
              id: "5",
              categoryId: "43",
              pattern: "CURRENT RULE",
              matchType: "contains",
            },
            201,
          ),
        );
        await currentResponse.promise;
      });
      expect(
        width < 768
          ? screen.queryByRole("dialog", { name: "Edit Transaction" })
          : within(table).queryByRole("button", {
              name: "Save changes to Current editor draft",
            }),
      ).toBeNull();
    },
  );

  it.each(["rejection", "conflict"] as const)(
    "does not show a late abandoned %s in the reentered editor",
    async (outcome) => {
      const abandonedResponse = createDeferred<Response>();
      const currentResponse = createDeferred<Response>();
      const baseRules = [
        { id: "1", categoryId: "42", pattern: "Green", matchType: "contains" },
        { id: "2", categoryId: "43", pattern: "Market", matchType: "contains" },
        {
          id: "3",
          categoryId: "88",
          pattern: "Green Market Cafe",
          matchType: "exact",
        },
      ];
      let includeConflictingRule = false;
      let saveAttempt = 0;
      const fetchMock = createFetchMock({
        categoryRulesResponse: () =>
          includeConflictingRule
            ? [
                ...baseRules,
                {
                  id: "9",
                  categoryId: "43",
                  pattern: "ABANDONED RULE",
                  matchType: "contains",
                },
              ]
            : baseRules,
        createRuleResponse: () => {
          saveAttempt += 1;
          return saveAttempt === 1
            ? abandonedResponse.promise
            : currentResponse.promise;
        },
      });
      await openStatementImportCategorize(fetchMock);

      await beginRememberedRuleSave({
        fileName: "statement.pdf",
        transactionDescription: "Green Market Cafe",
        categoryLabel: "Housing",
        editedDescription: "Abandoned draft",
        amount: "91.00",
        pattern: "Abandoned rule",
      });
      await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));

      await reenterCategorizeWithPendingSave(fetchMock);

      if (outcome === "rejection") {
        abandonedResponse.reject(new Error("Abandoned request failed."));
      } else {
        includeConflictingRule = true;
        abandonedResponse.resolve(
          jsonResponse(
            {
              error: {
                code: "CATEGORY_RULE_PATTERN_ALREADY_EXISTS",
                message: "The Category Rule pattern already exists.",
                details: [],
              },
            },
            409,
          ),
        );
      }

      await act(async () => {
        await abandonedResponse.promise.catch(() => undefined);
      });

      expect(screen.getByRole("status").textContent).toContain("Saving…");
      expect(screen.queryByText("Abandoned request failed.")).toBeNull();
      expect(
        screen.queryByText(/Category Rule for “abandoned rule”/iu),
      ).toBeNull();
      const table = screen.getByRole("table", {
        name: "Transactions parsed from reimported.pdf",
      });
      expect(
        within(table).getByRole("textbox", {
          name: "Description for Fresh statement Transaction",
        }),
      ).toHaveProperty("value", "Current editor draft");

      await act(async () => {
        currentResponse.resolve(
          jsonResponse(
            {
              id: "5",
              categoryId: "43",
              pattern: "CURRENT RULE",
              matchType: "contains",
            },
            201,
          ),
        );
        await currentResponse.promise;
      });
    },
  );

  it("keeps a remounted Statement Import independent from a save on the previous page", async () => {
    const abandonedResponse = createDeferred<Response>();
    const currentResponse = createDeferred<Response>();
    let saveAttempt = 0;
    const fetchMock = createFetchMock({
      createRuleResponse: () => {
        saveAttempt += 1;
        return saveAttempt === 1
          ? abandonedResponse.promise
          : currentResponse.promise;
      },
    });
    await openStatementImportCategorize(fetchMock);
    await beginRememberedRuleSave({
      fileName: "statement.pdf",
      transactionDescription: "Green Market Cafe",
      categoryLabel: "Housing",
      editedDescription: "Previous page draft",
      amount: "91.00",
      pattern: "Previous page rule",
    });
    await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(1));

    cleanup();
    await openStatementImportCategorize(fetchMock);
    await beginRememberedRuleSave({
      fileName: "statement.pdf",
      transactionDescription: "Green Market Cafe",
      categoryLabel: "Groceries",
      editedDescription: "Remounted page draft",
      amount: "42.00",
      pattern: "Remounted page rule",
    });
    await waitFor(() => expect(categoryRulePostCount(fetchMock)).toBe(2));

    await act(async () => {
      abandonedResponse.resolve(
        jsonResponse(
          {
            id: "4",
            categoryId: "42",
            pattern: "PREVIOUS PAGE RULE",
            matchType: "contains",
          },
          201,
        ),
      );
      await abandonedResponse.promise;
    });

    expect(screen.getByRole("status").textContent).toContain("Saving…");
    const table = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });
    expect(
      within(table).getByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
    ).toHaveProperty("value", "Remounted page draft");

    await act(async () => {
      currentResponse.resolve(
        jsonResponse(
          {
            id: "5",
            categoryId: "43",
            pattern: "REMOUNTED PAGE RULE",
            matchType: "contains",
          },
          201,
        ),
      );
      await currentResponse.promise;
    });
  });
});
