import { BodyText, Screen, StackGap } from '@/components/screen';
import { SpaceStatus } from '@/components/space-status';
import { useSpaces } from '@/navigation/spaces-provider';

export default function ExpensesScreen() {
  const { refresh, loading, refreshing } = useSpaces();
  return (
    <Screen title="Expenses" refreshing={loading || refreshing} onRefresh={refresh}>
      <StackGap>
        <SpaceStatus />
        <BodyText>Expense browsing is not available yet. This screen has not loaded any Expenses.</BodyText>
      </StackGap>
    </Screen>
  );
}
