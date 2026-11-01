import { useLocalSearchParams, useRouter } from "expo-router";
import { ExpenseDetail } from "@/features/expenses/detail-view";
import { useExpenseDetail } from "@/features/expenses/use-expense-detail";
import { BodyText, Screen } from "@/components/screen";
import { useSpaces } from "@/application/spaces/provider";
export default function ExpenseDetailScreen() {
  const { expenseId, sourceSpaceId } = useLocalSearchParams();
  const { active } = useSpaces();
  const router = useRouter();
  if (
    sourceSpaceId !== undefined &&
    (typeof sourceSpaceId !== "string" ||
      !/^[1-9]\d*$/.test(sourceSpaceId) ||
      sourceSpaceId !== active?.id)
  ) {
    return (
      <Screen title="Expense" onBack={() => router.back()}>
        <BodyText>This Expense is unavailable in the current Space.</BodyText>
      </Screen>
    );
  }
  if (typeof expenseId !== "string" || expenseId.length === 0) {
    return (
      <Screen title="Expense">
        <BodyText>This Expense could not be opened.</BodyText>
      </Screen>
    );
  }
  return <ExpenseDetailContainer expenseId={expenseId} />;
}

function ExpenseDetailContainer({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const controller = useExpenseDetail(expenseId);
  return (
    <ExpenseDetail
      state={controller.state}
      onRetry={() => {
        void controller.retry();
      }}
      onBack={() => router.back()}
      onChangeEdit={controller.updateEdit}
      onSaveEdit={() => {
        void controller.saveEdit().then((saved) => { if (saved) router.back(); });
      }}
      onReviewLatest={() => {
        void controller.reviewLatest();
      }}
      onContinueWithMyChanges={controller.continueWithMyChanges}
      onDelete={async () => {
        const deleted = await controller.deleteExpense();
        if (deleted) router.back();
        return deleted;
      }}
    />
  );
}
