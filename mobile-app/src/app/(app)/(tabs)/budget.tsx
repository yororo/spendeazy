import { BodyText, Screen, StackGap } from '@/components/screen';
import { SpaceStatus } from '@/components/space-status';
import { useSpaces } from '@/application/spaces/provider';

export default function BudgetScreen() {
  const { refresh, loading, refreshing } = useSpaces();
  return (
    <Screen title="Budget" refreshing={loading || refreshing} onRefresh={refresh}>
      <StackGap>
        <SpaceStatus />
        <BodyText>Budgets and Categories are not available yet. This screen has not saved any Budget.</BodyText>
      </StackGap>
    </Screen>
  );
}
