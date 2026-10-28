import { useState } from "react";
import { Text, View } from "react-native";
import { CompactAction, PrimaryButton, SecondaryButton } from "@/components/buttons";
import { CenteredDialog, ChoiceSheet } from "@/components/choice-sheet";
import { MoneyAmount } from "@/components/money-amount";
import {
  BodyText,
  Screen,
  StackGap,
  SupportingText,
} from "@/components/screen";
import { CalendarDays, Pencil, Shapes, Trash2 } from "lucide-react-native";
import { ExpenseFields } from "./expense-fields";
import { ExpenseNotice } from "./expense-notice";
import { space, typeScale } from "@/constants/theme";
import { useAppTheme } from "@/navigation/app-theme";
import type { ExpenseActivitySnapshot } from "@/api/expense-response";
import type { ManualExpenseDraft, ManualExpenseField } from "./manual-draft";

type DetailActivity = {
  id: string;
  type: "created" | "edited" | "deleted";
  actorName: string;
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
  onBeginEdit = () => {},
  onChangeEdit = () => {},
  onSaveEdit = () => {},
  onCancelEdit = () => {},
  onReviewLatest = () => {},
  onContinueWithMyChanges = () => {},
  onDelete = async () => false,
}: {
  state: ExpenseDetailViewState;
  onRetry: () => void;
  onBack: () => void;
  onBeginEdit?: () => void;
  onChangeEdit?: (patch: Partial<ManualExpenseDraft>) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onReviewLatest?: () => void;
  onContinueWithMyChanges?: () => void;
  onDelete?: () => Promise<boolean>;
}) {
  const { palette, fonts } = useAppTheme();
  const { phase, error, expense } = state;
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    <Screen title="Expense">
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
            <View style={{ alignItems: 'center', gap: 5, paddingVertical: 12 }}>
              <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center' }}>{expense.description}</Text>
              <MoneyAmount amount={expense.amount} variant="total" />
              <SupportingText>PHP</SupportingText>
            </View>
            <View style={{ minHeight: 58, flexDirection: 'row', gap: 14, alignItems: 'center', borderBottomWidth: 1, borderColor: palette.fieldBorder }}><CalendarDays color={palette.textSecondary} size={20} accessible={false} /><SupportingText>{expense.expenseDate}</SupportingText></View>
            <View style={{ minHeight: 58, flexDirection: 'row', gap: 14, alignItems: 'center', borderBottomWidth: 1, borderColor: palette.fieldBorder }}><Shapes color={palette.textSecondary} size={20} accessible={false} /><SupportingText>{expense.categoryName}</SupportingText></View>
            <SupportingText>
              {expense.source === "manual" ? "Cash" : "Imported"}
            </SupportingText>
            <SupportingText>{`Space · ${state.spaceName}`}</SupportingText>
            {state.archived ? <SupportingText>This Shared Space is archived. Expense and Activity history are read-only.</SupportingText> : null}
            <SupportingText>
              {expense.addedByName
                ? `Added By ${expense.addedByName}`
                : "Added By is kept with this Expense."}
            </SupportingText>
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
            {state.canEdit ? (
              <View style={{ flexDirection: "row", gap: space.cardGap }}>
                <View style={{ flex: 1 }}>
                  <CompactAction label="Edit Expense" icon={<Pencil size={16} color={palette.brandPrimary} />} onPress={onBeginEdit} />
                </View>
                <View style={{ flex: 1 }}>
                  <CompactAction
                    icon={<Trash2 size={16} color={palette.stateNegative} />}
                    label="Delete Expense"
                    onPress={() => setDeleteOpen(true)}
                  />
                </View>
              </View>
            ) : null}
            {state.deleteError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{
                  color: palette.stateNegative,
                  fontFamily: fonts.regular,
                  fontSize: typeScale.body,
                }}
              >
                {state.deleteError}
              </Text>
            ) : null}
            <View style={{ gap: space.rowGap }}>
              <Text
                accessibilityRole="header"
                style={{
                  color: palette.textPrimary,
                  fontFamily: fonts.semibold,
                  fontSize: typeScale.sectionTitle,
                }}
              >
                Activity
              </Text>
              {state.activity.length === 0 ? (
                <SupportingText>No Activity has been recorded.</SupportingText>
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
                  <SupportingText>
                    {`${activityLabel(event.type)} · ${event.actorName} · ${event.occurredAt.slice(0, 16).replace("T", " ")}`}
                  </SupportingText>
                  {event.before ? (
                    <SupportingText>{`Before · ${snapshotLabel(event.before)}`}</SupportingText>
                  ) : null}
                  {event.after ? (
                    <SupportingText>{`After · ${snapshotLabel(event.after)}`}</SupportingText>
                  ) : null}
                </View>
              ))}
            </View>
          </StackGap>
        ) : null}
        <CompactAction variant="quiet" label="Back" onPress={onBack} />
      </StackGap>

      <CenteredDialog title="Edit Expense" showClose visible={state.editor.open && !categoryOpen} onDismiss={onCancelEdit}>
        {state.editor.draft ? (
          <ExpenseFields draft={state.editor.draft} issues={state.editor.issues} categoryLabel={selectedCategory ? selectedCategory.name + (selectedCategory.isActive ? '' : ' (inactive)') : 'Choose Category'} onChange={onChangeEdit} onOpenCategories={() => setCategoryOpen(true)} />
        ) : null}
        {state.editor.error ? <ExpenseNotice message={state.editor.error} /> : null}
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
        <SecondaryButton label="Cancel" onPress={onCancelEdit} />
      </CenteredDialog>
      <ChoiceSheet
        title="Category"
        showClose
        visible={categoryOpen && state.editor.open}
        onDismiss={() => setCategoryOpen(false)}
      >
        {activeEditCategories.map((category) => (
          <SecondaryButton
            key={category.id}
            label={`${category.name}${category.isActive ? "" : " (inactive)"}`}
            selected={category.id === state.editor.draft?.categoryId}
            onPress={() => {
              onChangeEdit({ categoryId: category.id });
              setCategoryOpen(false);
            }}
          />
        ))}
      </ChoiceSheet>
      <CenteredDialog title="Delete Expense?" showClose visible={deleteOpen} onDismiss={() => setDeleteOpen(false)}>
        <ExpenseNotice warning message="This Expense will leave active totals and remain in Deleted Expenses with its Activity history." />
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
