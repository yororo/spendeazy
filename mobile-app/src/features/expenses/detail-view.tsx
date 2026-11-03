import { Popover } from '@/components/popover';
import { type ElementRef, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  CompactAction,
  PrimaryButton,
  SecondaryButton,
} from "@/components/buttons";
import { CenteredDialog } from "@/components/choice-sheet";
import { MoneyAmount } from "@/components/money-amount";
import {
  BodyText,
  Screen,
  StackGap,
  SupportingText,
} from "@/components/screen";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Shapes,
  Trash2,
  X,
} from "lucide-react-native";
import { ExpenseFields } from "./expense-fields";
import { ExpenseNotice } from "./expense-notice";
import { space, typeScale } from "@/constants/theme";
import { useAppTheme } from "@/navigation/app-theme";
import type { ExpenseActivitySnapshot } from "@/api/expense-response";
import type { ManualExpenseDraft, ManualExpenseField } from "./manual-draft";

import { PersonAvatar } from "@/components/person-avatar";

type DetailActivity = {
  id: string;
  type: "created" | "edited" | "deleted";
  actorName: string;
  actorPhotoUrl?: string | null;
  occurredAt: string;
  before: (ExpenseActivitySnapshot & { categoryName: string }) | null;
  after: (ExpenseActivitySnapshot & { categoryName: string }) | null;
};

export type ExpenseDetailViewState = {
  phase: "loading" | "error" | "ready";
  error: string | null;
  spaceName: string;
  archived: boolean;
  activity: DetailActivity[];
  expense: {
    id: string;
    description: string;
    amount: string;
    expenseDate: string;
    categoryName: string;
    source: "manual" | "imported";
    addedByName: string | null;
    addedByPhotoUrl?: string | null;
    statementImportId: string | null;
    sourceRowId: string | null;
    deletedAt: string | null;
  } | null;
  canEdit: boolean;
  editor: {
    open: boolean;
    phase: "ready" | "saving" | "reviewing";
    draft: ManualExpenseDraft | null;
    issues: Partial<Record<ManualExpenseField, string>>;
    error: string | null;
    needsReview: boolean;
    latest: {
      description: string;
      amount: string;
      expenseDate: string;
      categoryName: string;
    } | null;
    categories: readonly { id: string; name: string; isActive: boolean }[];
    canSave: boolean;
  };
  deleting: boolean;
  deleteError: string | null;
};

export function ExpenseDetail({
  state,
  onRetry,
  onBack,
  onChangeEdit = () => {},
  onSaveEdit = () => {},
  onReviewLatest = () => {},
  onContinueWithMyChanges = () => {},
  onDelete = async () => false,
}: {
  state: ExpenseDetailViewState;
  onRetry: () => void;
  onBack: () => void;
  onChangeEdit?: (patch: Partial<ManualExpenseDraft>) => void;
  onSaveEdit?: () => void;
  onReviewLatest?: () => void;
  onContinueWithMyChanges?: () => void;
  onDelete?: () => Promise<boolean>;
}) {
  const { palette, fonts } = useAppTheme();
  const { phase, error, expense } = state;
  const [snapshotEventId, setSnapshotEventId] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const categoryRef = useRef<ElementRef<typeof View>>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const activeEditCategories = state.editor.categories.filter(
    (category) =>
      category.isActive || category.id === state.editor.draft?.categoryId,
  );
  const selectedCategory = state.editor.categories.find(
    (category) => category.id === state.editor.draft?.categoryId,
  );
  const allowEditSave = state.editor.canSave && !state.editor.needsReview;

  async function confirmDelete() {
    if (await onDelete()) setDeleteOpen(false);
  }

  return (
    <Screen
      compactHeader
      title={state.canEdit ? "Edit expense" : "Expense"}
      headerAccessory={
        <CompactAction
          variant="icon"
          label="Close"
          icon={<X size={20} color={palette.textSecondary} />}
          onPress={onBack}
        />
      }
    >
      <StackGap>
        {phase === "loading" ? <BodyText>Loading Expense.</BodyText> : null}
        {phase === "error" && error ? (
          <StackGap>
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: palette.textPrimary,
                fontFamily: fonts.regular,
                fontSize: typeScale.body,
              }}
            >
              {error}
            </Text>
            <SecondaryButton label="Retry" onPress={onRetry} />
          </StackGap>
        ) : null}
        {phase === "ready" && expense ? (
          <StackGap>
            {state.canEdit ? (
              <View style={{ gap: space.dialogGap }}>
                {state.editor.draft ? (
                  <ExpenseFields nativeDatePicker categoryRef={categoryRef}
                    disabled={
                      state.editor.phase !== "ready" ||
                      state.editor.needsReview ||
                      state.deleting
                    }
                    draft={state.editor.draft}
                    issues={state.editor.issues}
                    categoryLabel={
                      selectedCategory
                        ? selectedCategory.name +
                          (selectedCategory.isActive ? "" : " (inactive)")
                        : "Choose Category"
                    }
                    onChange={onChangeEdit}
                    onOpenCategories={() => setCategoryOpen(true)}
                  />
                ) : null}
                {state.editor.error ? (
                  <ExpenseNotice message={state.editor.error} />
                ) : null}
                {state.editor.needsReview ? (
                  state.editor.latest ? (
                    <StackGap>
                      <SupportingText>
                        {`Latest version · ${state.editor.latest.description} · ${state.editor.latest.amount} PHP · ${state.editor.latest.expenseDate} · ${state.editor.latest.categoryName}`}
                      </SupportingText>
                      <SecondaryButton
                        label="Continue with my changes"
                        onPress={onContinueWithMyChanges}
                      />
                    </StackGap>
                  ) : (
                    <SecondaryButton
                      label={
                        state.editor.phase === "reviewing"
                          ? "Reviewing latest version"
                          : "Review latest version"
                      }
                      onPress={onReviewLatest}
                    />
                  )
                ) : null}
                <PrimaryButton
                  label={state.editor.error ? "Try again" : "Save changes"}
                  onPress={onSaveEdit}
                  busy={state.editor.phase === "saving"}
                  disabled={!allowEditSave}
                />
              </View>
            ) : (
              <>
                <View
                  style={{ alignItems: "center", gap: 5, paddingVertical: 12 }}
                >
                  <Text
                    style={{
                      color: palette.textSecondary,
                      fontFamily: fonts.regular,
                      fontSize: 14,
                      textAlign: "center",
                    }}
                  >
                    {expense.description}
                  </Text>
                  <MoneyAmount amount={expense.amount} variant="total" />
                  <SupportingText>PHP</SupportingText>
                </View>
                <View
                  style={{
                    minHeight: 58,
                    flexDirection: "row",
                    gap: 14,
                    alignItems: "center",
                    borderBottomWidth: 1,
                    borderColor: palette.fieldBorder,
                  }}
                >
                  <CalendarDays
                    color={palette.textSecondary}
                    size={20}
                    accessible={false}
                  />
                  <SupportingText>{expense.expenseDate}</SupportingText>
                </View>
                <View
                  style={{
                    minHeight: 58,
                    flexDirection: "row",
                    gap: 14,
                    alignItems: "center",
                    borderBottomWidth: 1,
                    borderColor: palette.fieldBorder,
                  }}
                >
                  <Shapes
                    color={palette.textSecondary}
                    size={20}
                    accessible={false}
                  />
                  <SupportingText>{expense.categoryName}</SupportingText>
                </View>
              </>
            )}
            {state.canEdit ? (
              <View style={{ alignItems: "flex-end" }}>
                <CompactAction
                  variant="icon"
                  label="Delete Expense"
                  icon={<Trash2 size={20} color={palette.stateNegative} />}
                  disabled={state.editor.phase === "saving" || state.deleting}
                  onPress={() => setDeleteOpen(true)}
                />
              </View>
            ) : null}
            {state.deleteError ? (
              <ExpenseNotice message={state.deleteError} />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Activity"
              accessibilityState={{ expanded: activityOpen }}
              onPress={() => setActivityOpen(!activityOpen)}
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderColor: palette.fieldBorder,
              }}
            >
              <Text
                style={{
                  color: palette.textPrimary,
                  fontFamily: fonts.semibold,
                  fontSize: typeScale.sectionTitle,
                }}
              >
                Activity
              </Text>
              {activityOpen ? (
                <ChevronUp
                  accessible={false}
                  size={18}
                  color={palette.textSecondary}
                />
              ) : (
                <ChevronDown
                  accessible={false}
                  size={18}
                  color={palette.textSecondary}
                />
              )}
            </Pressable>
            {activityOpen ? (
              <StackGap>
                <SupportingText>
                  {expense.source === "manual" ? "Cash" : "Imported"}
                </SupportingText>
                <SupportingText>{`Space · ${state.spaceName}`}</SupportingText>
                {state.archived ? (
                  <SupportingText>
                    This Shared Space is archived. Expense and Activity history
                    are read-only.
                  </SupportingText>
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <PersonAvatar
                    name={expense.addedByName ?? "Person unavailable"}
                    photoUrl={expense.addedByPhotoUrl}
                  />
                  <View style={{ flex: 1 }}>
                    <SupportingText>
                      {expense.addedByName
                        ? `Added By ${expense.addedByName}`
                        : "Added By is kept with this Expense."}
                    </SupportingText>
                  </View>
                </View>
                {expense.source === "imported" ? (
                  <StackGap>
                    <SupportingText>
                      {expense.statementImportId
                        ? `Statement Import ${expense.statementImportId}`
                        : "Statement Import reference retained"}
                    </SupportingText>
                    {expense.sourceRowId ? (
                      <SupportingText>{`Source row ${expense.sourceRowId}`}</SupportingText>
                    ) : null}
                  </StackGap>
                ) : null}
                {expense.deletedAt ? (
                  <SupportingText>{`Deleted ${expense.deletedAt.slice(0, 10)}. This Expense is retained for history.`}</SupportingText>
                ) : null}
                <View style={{ gap: space.rowGap }}>
                  {state.activity.length === 0 ? (
                    <SupportingText>
                      No Activity has been recorded.
                    </SupportingText>
                  ) : null}
                  {state.activity.map((event) => (
                    <View
                      key={event.id}
                      style={{
                        gap: space.fieldLabelGap,
                        paddingVertical: 14,
                        borderTopWidth: 1,
                        borderColor: palette.fieldBorder,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <PersonAvatar
                          name={event.actorName}
                          photoUrl={event.actorPhotoUrl}
                        />
                        <View style={{ flex: 1 }}>
                          <SupportingText>
                            {`${activityLabel(event.type)} · ${event.actorName} · ${event.occurredAt.slice(0, 16).replace("T", " ")}`}
                          </SupportingText>
                        </View>
                      </View>
                      {event.type === "edited" && event.before && event.after ? (
                        <>
                          {activityChanges(event.before, event.after).map(({ label, before, after }) => (
                            <SupportingText key={label}>{`${label} · ${before} → ${after}`}</SupportingText>
                          ))}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ expanded: snapshotEventId === event.id }}
                            onPress={() => setSnapshotEventId(snapshotEventId === event.id ? null : event.id)}
                            style={{ minHeight: 48, justifyContent: "center" }}
                          >
                            <SupportingText>Snapshots</SupportingText>
                          </Pressable>
                        </>
                      ) : null}
                      {event.type !== "edited" || snapshotEventId === event.id || !event.before || !event.after ? (
                        <>
                          {event.before ? <SupportingText>{`Before · ${snapshotLabel(event.before)}`}</SupportingText> : null}
                          {event.after ? <SupportingText>{`After · ${snapshotLabel(event.after)}`}</SupportingText> : null}
                        </>
                      ) : null}
                    </View>
                  ))}
                </View>
              </StackGap>
            ) : null}
          </StackGap>
        ) : null}
      </StackGap>

      <Popover anchorRef={categoryRef} showHeader={false}
        title="Category"
        visible={categoryOpen && state.editor.open}
        onDismiss={() => setCategoryOpen(false)}
      >
        {activeEditCategories.map((category) => (
          <SecondaryButton
            key={category.id}
            label={`${category.id === state.editor.draft?.categoryId ? "✓ " : ""}${category.name}${category.isActive ? "" : " (inactive)"}`}
            selected={category.id === state.editor.draft?.categoryId}
            onPress={() => {
              onChangeEdit({ categoryId: category.id });
              setCategoryOpen(false);
            }}
          />
        ))}
      </Popover>
      <CenteredDialog
        title="Delete Expense?"
        showClose
        visible={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
      >
        <ExpenseNotice
          warning
          message="This Expense will leave active totals and remain in Deleted Expenses with its Activity history."
        />
        {state.deleteError ? (
          <SupportingText>{state.deleteError}</SupportingText>
        ) : null}
        <PrimaryButton
          label="Delete Expense"
          tone="destructive"
          onPress={() => {
            void confirmDelete();
          }}
          busy={state.deleting}
        />
        <SecondaryButton
          label="Keep Expense"
          onPress={() => setDeleteOpen(false)}
        />
      </CenteredDialog>
    </Screen>
  );
}

function activityLabel(type: DetailActivity["type"]): string {
  if (type === "created") return "Expense added";
  if (type === "edited") return "Expense corrected";
  return "Expense deleted";
}

function snapshotLabel(
  snapshot: ExpenseActivitySnapshot & { categoryName: string },
): string {
  return `${snapshot.expenseDate} · ${snapshot.amount} PHP · ${snapshot.description} · ${snapshot.categoryName}`;
}

function activityChanges(
  before: NonNullable<DetailActivity["before"]>,
  after: NonNullable<DetailActivity["after"]>,
) {
  return [
    { label: "Amount", before: `₱${before.amount}`, after: `₱${after.amount}` },
    { label: "Description", before: before.description || "Empty", after: after.description || "Empty" },
    { label: "Date", before: before.expenseDate, after: after.expenseDate },
    { label: "Category", before: before.categoryName, after: after.categoryName },
  ].filter((change) => change.before !== change.after);
}
