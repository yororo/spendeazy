import { useRouter } from "expo-router";
import { ExpenseBrowse } from "@/features/expenses/browse-view";
import { useExpenseBrowse } from "@/features/expenses/use-expense-browse";
import { SpaceStatus } from "@/components/space-status";

export default function DeletedExpensesScreen() {
  const router = useRouter();
  const controller = useExpenseBrowse({ deletedOnly: true });
  return (
    <ExpenseBrowse
      controller={controller}
      spaceStatus={<SpaceStatus />}
      onOpenExpense={(expenseId) =>
        router.push({ pathname: "/expense/[expenseId]", params: { expenseId } })
      }
      onOpenOtherList={() => router.back()}
    />
  );
}
