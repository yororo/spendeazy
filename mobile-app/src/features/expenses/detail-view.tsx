import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "@/components/buttons";
import { ChoiceSheet } from "@/components/choice-sheet";
import { MoneyAmount } from "@/components/money-amount";
import {
  BodyText,
  Screen,
  StackGap,
  SupportingText,
} from "@/components/screen";
import { TextField } from "@/components/text-field";
import { radius, space, typeScale } from "@/constants/theme";
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
            <BodyText>{expense.description}</BodyText>
            <MoneyAmount amount={expense.amount} />
            <SupportingText>{expense.expenseDate}</SupportingText>
            <SupportingText>{expense.categoryName}</SupportingText>
            <SupportingText>
              {expense.source === "manual" ? "Cash" : "Imported"}
            </SupportingText>
            <SupportingText>{`Space · ${state.spaceName}`}</SupportingText>
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
                  <SecondaryButton label="Edit Expense" onPress={onBeginEdit} />
                </View>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
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
                    paddingVertical: space.fieldLabelGap,
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
        <SecondaryButton label="Back" onPress={onBack} />
      </StackGap>

      <Modal
        visible={state.editor.open}
        transparent
        animationType="none"
        onRequestClose={onCancelEdit}
        accessibilityViewIsModal
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: space.screenHorizontal,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss edit dialog"
            onPress={onCancelEdit}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: palette.scrim,
            }}
          />
          <View
            style={{
              maxHeight: "90%",
              backgroundColor: palette.surfaceModal,
              borderRadius: radius.dialog,
              borderCurve: "continuous",
              padding: space.dialogInset,
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: space.dialogGap }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  color: palette.textPrimary,
                  fontFamily: fonts.semibold,
                  fontSize: typeScale.sectionTitle,
                }}
              >
                Edit Expense
              </Text>
              {state.editor.draft ? (
                <>
                  <TextField
                    label="Amount"
                    value={state.editor.draft.amount}
                    onChangeText={(amount) => onChangeEdit({ amount })}
                    error={state.editor.issues.amount}
                    placeholder="12.50"
                    keyboardType="decimal-pad"
                  />
                  <TextField
                    label="Description"
                    value={state.editor.draft.description}
                    onChangeText={(description) =>
                      onChangeEdit({ description })
                    }
                    error={state.editor.issues.description}
                    placeholder="What was this Expense?"
                  />
                  <View style={{ gap: space.fieldLabelGap }}>
                    <SupportingText>Category</SupportingText>
                    <SecondaryButton
                      label={
                        selectedCategory
                          ? `${selectedCategory.name}${selectedCategory.isActive ? "" : " (inactive)"}`
                          : "Choose Category"
                      }
                      onPress={() => setCategoryOpen(true)}
                    />
                    {state.editor.issues.categoryId ? (
                      <SupportingText>
                        {state.editor.issues.categoryId}
                      </SupportingText>
                    ) : null}
                  </View>
                  <TextField
                    label="Date"
                    value={state.editor.draft.expenseDate}
                    onChangeText={(expenseDate) =>
                      onChangeEdit({ expenseDate })
                    }
                    error={state.editor.issues.expenseDate}
                    placeholder="YYYY-MM-DD"
                  />
                </>
              ) : null}
              {state.editor.error ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{
                    color: palette.stateNegative,
                    fontFamily: fonts.regular,
                    fontSize: typeScale.body,
                  }}
                >
                  {state.editor.error}
                </Text>
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
              <SecondaryButton label="Cancel" onPress={onCancelEdit} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ChoiceSheet
        title="Category"
        visible={categoryOpen}
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
      <Modal
        visible={deleteOpen}
        transparent
        animationType="none"
        onRequestClose={() => setDeleteOpen(false)}
        accessibilityViewIsModal
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: space.screenHorizontal,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss delete confirmation"
            onPress={() => setDeleteOpen(false)}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: palette.scrim,
            }}
          />
          <View
            style={{
              backgroundColor: palette.surfaceModal,
              borderRadius: radius.dialog,
              borderCurve: "continuous",
              padding: space.dialogInset,
              gap: space.dialogGap,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                color: palette.textPrimary,
                fontFamily: fonts.semibold,
                fontSize: typeScale.sectionTitle,
              }}
            >
              Delete Expense?
            </Text>
            <BodyText>
              This Expense will leave active totals and remain in Deleted
              Expenses with its Activity history.
            </BodyText>
            {state.deleteError ? (
              <SupportingText>{state.deleteError}</SupportingText>
            ) : null}
            <PrimaryButton
              label="Delete Expense"
              onPress={() => {
                void confirmDelete();
              }}
              busy={state.deleting}
            />
            <SecondaryButton
              label="Keep Expense"
              onPress={() => setDeleteOpen(false)}
            />
          </View>
        </View>
      </Modal>
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
