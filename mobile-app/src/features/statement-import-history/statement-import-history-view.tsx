import { PersonAvatar } from '@/components/person-avatar';
import { useState } from "react";
import type { StatementImportHistoryItem } from "@/api/statement-import-history-api-client";
import {
  FileClock,
  LockKeyhole,
  CreditCard,
  Wallet,
  CircleCheck,
  ChevronRight,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SecondaryButton } from "@/components/buttons";
import { ChoiceSheet } from "@/components/choice-sheet";
import { TextField } from "@/components/text-field";
import { DesignSurface } from "@/components/design-surface";
import { Screen, StackGap, SupportingText } from "@/components/screen";
import { useAppTheme } from "@/navigation/app-theme";
import type { useStatementImportHistory } from "./use-statement-import-history";
import { ALL_DATES } from "./history-workflow";

export function StatementImportHistoryView({
  controller,
  onBack,
  onOpenImport,
}: {
  controller: ReturnType<typeof useStatementImportHistory>;
  onBack: () => void;
  onOpenImport: (spaceId: string, id: string) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    active,
    items,
    nextCursor,
    error,
    loading,
    refreshing,
    loadingMore,
    loadMore,
    refresh,
    filters,
    changeFilters,
  } = controller;
  const filtered = !!filters.fromDate || !!filters.toDate;
  return (
    <>
      <Screen
        title="Statement Import history"
        refreshing={refreshing}
        onRefresh={refresh}
      >
        <StackGap>
          <SupportingText>
            Recorded Statement Imports for this Space. Dates use confirmation
            time in Asia/Manila.
          </SupportingText>
          <SecondaryButton
            label="Confirmation dates"
            onPress={() => setFiltersOpen(true)}
          />
          {filtered ? (
            <>
              <SupportingText>{`${filters.fromDate || "Any start"} to ${filters.toDate || "Any end"}`}</SupportingText>
              <SecondaryButton
                label="Clear filters"
                onPress={() => changeFilters(ALL_DATES)}
              />
            </>
          ) : null}
          {controller.filterError ? (
            <SupportingText>{controller.filterError}</SupportingText>
          ) : null}
          {active?.status === "archived" ? (
            <DesignSurface style={{ padding: 20, gap: 10 }}>
              <LockKeyhole
                accessible={false}
                size={20}
                color={palette.stateWarning}
              />
              <SupportingText>
                This archived Shared Space is read-only. Its import history is
                retained.
              </SupportingText>
            </DesignSurface>
          ) : null}
          {!controller.filterError &&
          (loading || (!error && active)) &&
          items.length === 0 ? (
            <DesignSurface style={{ padding: 22, gap: 14 }}>
              <FileClock
                accessible={false}
                size={28}
                color={palette.brandPrimary}
              />
              <SupportingText>
                {loading
                  ? "Loading Statement Import history."
                  : filtered
                    ? "No Statement Imports were confirmed in these dates."
                    : "No Statement Imports have been recorded in this Space."}
              </SupportingText>
            </DesignSurface>
          ) : null}
          <View>
            {items.map((item) => (
              <ImportHistoryItem
                key={item.id}
                item={item}
                importer={controller.importerName(item.importedByUserId)}
                photoUrl={controller.importerPhoto(item.importedByUserId)}
                onPress={() => {
                  if (active) onOpenImport(active.id, item.id);
                }}
              />
            ))}
          </View>
          {error ? (
            <>
              <Text
                selectable
                accessibilityLiveRegion="polite"
                style={{
                  color: palette.stateNegative,
                  fontFamily: fonts.regular,
                  fontSize: 16,
                }}
              >
                {error}
              </Text>
              <SecondaryButton
                label="Retry history"
                onPress={controller.retry}
              />
            </>
          ) : null}
          {nextCursor ? (
            <SecondaryButton
              label="Load more history"
              busy={loadingMore}
              onPress={() => void loadMore()}
            />
          ) : null}
          <SecondaryButton label="Back" onPress={onBack} />
        </StackGap>
      </Screen>
      <ChoiceSheet
        title="Confirmation dates"
        visible={filtersOpen}
        onDismiss={() => setFiltersOpen(false)}
      >
        <StackGap>
          <TextField
            label="From"
            value={filters.fromDate}
            placeholder="YYYY-MM-DD"
            onChangeText={(fromDate) => changeFilters({ ...filters, fromDate })}
          />
          <TextField
            label="To"
            value={filters.toDate}
            placeholder="YYYY-MM-DD"
            onChangeText={(toDate) => changeFilters({ ...filters, toDate })}
          />
          {controller.filterError ? (
            <SupportingText>{controller.filterError}</SupportingText>
          ) : null}
          <SecondaryButton
            label="Clear filters"
            onPress={() => changeFilters(ALL_DATES)}
          />
          <SecondaryButton label="Done" onPress={() => setFiltersOpen(false)} />
        </StackGap>
      </ChoiceSheet>
    </>
  );
}

export function ImportHistoryItem({
  item,
  importer,
  photoUrl,
  onPress,
}: {
  item: StatementImportHistoryItem;
  importer: string;
  photoUrl?: string | null;
  onPress(): void;
}) {
  const { palette, fonts } = useAppTheme();
  const provider = providerLabel(item);
  const confirmed =
    item.originalExpenseCount === null
      ? `Original count unavailable · ${item.expenseCount} current Expenses`
      : `${item.originalExpenseCount} originally confirmed Expenses`;
  const imported = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(item.importedAt));
  const Icon = item.statementType === "credit_card" ? CreditCard : Wallet;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${provider}, ${item.fileName}, PDF, ${confirmed}, ${importer}, confirmed ${imported} Asia/Manila, successful. Open Statement Import`}
      onPress={onPress}
      style={{
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderColor: palette.divider,
      }}
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 44,
          height: 48,
          borderRadius: 14,
          backgroundColor: palette.selectedSpace,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={20} color={palette.brandPrimary} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text
          style={{
            color: palette.textPrimary,
            fontFamily: fonts.medium,
            fontSize: 15,
          }}
        >
          {provider}
        </Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontFamily: fonts.regular,
            fontSize: 12,
          }}
        >{`${confirmed} · PDF`}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PersonAvatar name={importer} photoUrl={photoUrl} />
          <Text style={{ flex: 1, color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{`${importer} · ${imported}`}</Text>
        </View>
        <Text
          style={{
            color: palette.textSecondary,
            fontFamily: fonts.regular,
            fontSize: 12,
          }}
        >
          Successfully imported
        </Text>
      </View>
      <CircleCheck accessible={false} size={18} color={palette.brandPrimary} />
      <ChevronRight
        accessible={false}
        size={16}
        color={palette.textSecondary}
      />
    </Pressable>
  );
}
function providerLabel(item: StatementImportHistoryItem): string {
  const provider = item.provider.toLowerCase();
  if (provider === "bdo")
    return item.accountFormat?.toLowerCase() === "amex" ? "BDO AMEX" : "BDO";
  if (provider === "eastwest")
    return item.accountFormat?.toLowerCase() === "visa"
      ? "EastWest Visa"
      : "EastWest";
  if (provider === "gcash") return "GCash";
  return (
    item.provider.trim() ||
    (item.statementType === "credit_card"
      ? "Credit Card statement"
      : "E-Wallet statement")
  );
}
