import { PersonAvatar } from '@/components/person-avatar';
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ImportEvidenceRow } from "@/api/statement-import-detail-response";
import { SecondaryButton } from "@/components/buttons";
import { CanvasBackground, DesignSurface } from "@/components/design-surface";
import { BodyText, StackGap, SupportingText } from "@/components/screen";
import { ScreenHeader } from "@/components/screen-header";
import { space } from "@/constants/theme";
import { useAppTheme } from "@/navigation/app-theme";
import { spaceIdentityLabel } from "@/application/spaces/active-space";
import type { useStatementImportDetail } from "./use-statement-import-detail";

export function StatementImportDetailView({
  controller: c,
  onBack,
  onExpenses,
  onExpense,
}: {
  controller: ReturnType<typeof useStatementImportDetail>;
  onBack: () => void;
  onExpenses: (mode: "active" | "deleted") => void;
  onExpense: (id: string) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const d = c.detail;
  const confirmation = d?.confirmation;
  const heading = (label: string) => (
    <Text
      accessibilityRole="header"
      style={{
        color: palette.textPrimary,
        fontFamily: fonts.semibold,
        fontSize: 15,
      }}
    >
      {label}
    </Text>
  );
  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <CanvasBackground />
      <FlatList<ImportEvidenceRow>
        data={expanded ? (d?.rows ?? []) : []}
        keyExtractor={(row) => row.sourceRowId}
        contentContainerStyle={{
          paddingTop: insets.top + space.cardGap,
          paddingHorizontal: space.screenHorizontal,
          paddingBottom: insets.bottom + 24,
          gap: space.cardGap,
        }}
        refreshControl={
          <RefreshControl
            refreshing={c.loading}
            onRefresh={c.refresh}
            tintColor={palette.brandPrimary}
          />
        }
        ListHeaderComponent={
          <StackGap>
            <ScreenHeader title="Statement Import" />
            <SecondaryButton label="Back" onPress={onBack} />
            {c.contextUnavailable ? (
              <SupportingText>
                {c.spacesLoading
                  ? "Loading Space…"
                  : "This import is unavailable in the current Space. Return and select its source Space."}
              </SupportingText>
            ) : null}
            {c.loading && !d ? (
              <SupportingText>Loading Statement Import…</SupportingText>
            ) : null}
            {c.error ? (
              <>
                <SupportingText>
                  {c.unavailable
                    ? "This Statement Import is unavailable."
                    : c.error}
                </SupportingText>
                <SecondaryButton label="Retry" onPress={c.refresh} />
              </>
            ) : null}
            {d && c.active ? (
              <>
                {c.active.accessLevel === "read" ||
                c.active.status === "archived" ? (
                  <SupportingText>
                    This Space is read-only. Retained Expenses and Activity
                    remain available.
                  </SupportingText>
                ) : null}
                <DesignSurface style={{ padding: 22, gap: 10 }}>
                  {heading(
                    (
                      {
                        bdo: "BDO",
                        eastwest: "EastWest",
                        gcash: "GCash",
                      } as Record<string, string>
                    )[d.provider.toLowerCase()] ??
                      (d.provider.trim() || "Statement provider unavailable"),
                  )}
                  <BodyText>{`${d.statementType === "credit_card" ? "Credit card" : "E-wallet"} · ${d.accountFormat ?? "Account format unavailable"}`}</BodyText>
                  <BodyText>{`PDF · ${d.fileName}`}</BodyText>
                  <SupportingText>{`Statement date: ${d.statementDate ?? "Unavailable"}`}</SupportingText>
                  <SupportingText>{`History dates: ${d.historyFromDate ?? "Unavailable"} to ${d.historyToDate ?? "Unavailable"}`}</SupportingText>
                  <SupportingText>{`Confirmed ${manilaTime(d.importedAt)} · Asia/Manila`}</SupportingText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <PersonAvatar name={c.importer} photoUrl={c.importerPhoto} />
                    <View style={{ flex: 1 }}><BodyText>{`Imported by ${c.importer}`}</BodyText></View>
                  </View>
                  <BodyText>{`Destination: ${spaceIdentityLabel(c.active)} · Space ${c.active.id}`}</BodyText>
                </DesignSurface>
                <DesignSurface style={{ padding: 22, gap: 10 }}>
                  {heading("Originally confirmed Expenses")}
                  <BodyText>
                    {confirmation
                      ? `${confirmation.originalExpenseCount} Expenses · PHP ${confirmation.originalExpenseTotal}`
                      : "Original confirmation result unavailable for this legacy import."}
                  </BodyText>
                  {confirmation ? (
                    <SupportingText>{`${confirmation.includedCount} included · ${confirmation.excludedCount} excluded`}</SupportingText>
                  ) : null}
                </DesignSurface>
                <DesignSurface style={{ padding: 22, gap: 10 }}>
                  {heading("Current Expenses")}
                  <BodyText>{`${d.currentExpenses.count} nondeleted Expenses · PHP ${d.currentExpenses.totalAmount}`}</BodyText>
                  <SecondaryButton
                    label="View current Expenses"
                    onPress={() => onExpenses("active")}
                  />
                  <SecondaryButton
                    label="View deleted Expenses"
                    onPress={() => onExpenses("deleted")}
                  />
                </DesignSurface>
                {heading("Original statement evidence")}
                {!confirmation ? (
                  <SupportingText>
                    Original controls, reconciliation and extraction diagnostics
                    are unavailable for this legacy import.
                  </SupportingText>
                ) : (
                  <>
                    <SupportingText>
                      Statement controls are evidence and can differ from
                      confirmed spending.
                    </SupportingText>
                    {confirmation.evidence.controlTotals.length === 0 ? (
                      <BodyText>Statement controls unavailable.</BodyText>
                    ) : (
                      confirmation.evidence.controlTotals.map(
                        (control, index) => (
                          <BodyText
                            key={`${control.key}:${index}`}
                          >{`${control.label}: ${control.amount === null ? "Unavailable / unparseable" : "PHP " + control.amount} · Original: ${control.originalText}`}</BodyText>
                        ),
                      )
                    )}
                    <BodyText>{`Reconciliation: ${confirmation.evidence.reconciliation.status}`}</BodyText>
                    <BodyText>{`Extraction: ${confirmation.evidence.completeness.assessment} · Failed pages: ${confirmation.evidence.completeness.failedPageIndices.map((p) => p + 1).join(", ") || "None"} · Unreadable pages: ${confirmation.evidence.completeness.unreadablePageIndices.map((p) => p + 1).join(", ") || "None"}`}</BodyText>
                    {confirmation.evidence.reconciliation.comparisons.map(
                      (comparison, i) => (
                        <SupportingText
                          key={i}
                        >{`${comparison.equation} · Expected ${comparison.expectedAmount ?? "Unavailable"} · Extracted ${comparison.extractedAmount ?? "Unavailable"} · Difference ${comparison.difference ?? "Unavailable"}`}</SupportingText>
                      ),
                    )}
                    {confirmation.evidence.reconciliation.diagnostics.map(
                      (diagnostic, i) => (
                        <SupportingText
                          key={i}
                        >{`${diagnostic.code}: ${diagnostic.message} · Pages: ${diagnostic.pageIndices.map((p) => p + 1).join(", ") || "Unspecified"} · Rows: ${diagnostic.sourceRowIds.join(", ") || "Unspecified"}`}</SupportingText>
                      ),
                    )}
                    {confirmation.acknowledgedWarnings.map((warning) => (
                      <SupportingText
                        key={warning.id}
                      >{`Acknowledged: ${warning.message}`}</SupportingText>
                    ))}
                    <SupportingText>{`Parser ${confirmation.evidence.parserVersion} · Extraction engine ${confirmation.evidence.extractionEngineVersion}`}</SupportingText>
                  </>
                )}
                {d.rows.length ? (
                  <SecondaryButton
                    label={`${expanded ? "Hide" : "Show"} all ${d.rows.length} original rows`}
                    onPress={() => setExpanded(!expanded)}
                  />
                ) : (
                  <SupportingText>
                    Original row evidence unavailable.
                  </SupportingText>
                )}
              </>
            ) : null}
          </StackGap>
        }
        renderItem={({ item: row }) => (
          <DesignSurface style={{ padding: 22, gap: 10 }}>
            {heading(
              `${row.disposition === "included" ? "Included" : "Excluded"} · Row ${row.originalEvidence.sourceOrder + 1} · Page ${row.originalEvidence.pageIndex + 1}`,
            )}
            <BodyText>{row.originalEvidence.original.description}</BodyText>
            <SupportingText>{`Original date: ${row.originalEvidence.original.dateText} · Posting: ${row.originalEvidence.original.postingDateText ?? "Unavailable"}`}</SupportingText>
            <BodyText>{`Original amount: ${row.originalEvidence.original.amountText} · Balance: ${row.originalEvidence.original.balanceText ?? "Unavailable"}`}</BodyText>
            <SupportingText>{`Normalized: ${row.originalEvidence.normalized.date ?? "Unavailable"} · ${row.originalEvidence.normalized.amount ?? "Unavailable"} · ${row.originalEvidence.classification}`}</SupportingText>
            {row.originalEvidence.classificationEvidence.map((e, i) => (
              <SupportingText
                key={i}
              >{`${e.kind}: ${e.value ?? "Unavailable"}`}</SupportingText>
            ))}
            {row.confirmedValues ? (
              <BodyText>{`Originally confirmed: ${row.confirmedValues.expenseDate} · ${row.confirmedValues.description} · PHP ${row.confirmedValues.amount} · ${c.categoryName(row.confirmedValues.categoryId)} (Category ${row.confirmedValues.categoryId})`}</BodyText>
            ) : (
              <BodyText>{`Excluded: ${row.exclusion?.reason ?? "Unavailable"}${row.exclusion?.automatic ? " · Automatic" : ""}`}</BodyText>
            )}
            {row.expense?.edited ? (
              <BodyText>Edited since confirmation</BodyText>
            ) : null}
            {row.expense?.deletedAt ? (
              <BodyText>{`Deleted · ${manilaTime(row.expense.deletedAt)} Asia/Manila`}</BodyText>
            ) : null}
            {row.expense ? (
              <SecondaryButton
                label={
                  row.expense.deletedAt
                    ? "Inspect deleted Expense and Activity"
                    : "Inspect Expense and Activity"
                }
                onPress={() => onExpense(row.expense!.id)}
              />
            ) : row.disposition === "included" ? (
              <SupportingText>Linked Expense unavailable.</SupportingText>
            ) : null}
          </DesignSurface>
        )}
      />
    </View>
  );
}

function manilaTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
