import { Pressable, Text } from 'react-native';

import { BodyText, Screen, StackGap } from '@/components/screen';
import { SpaceStatus } from '@/components/space-status';
import { typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { dismissRecoveryAnnouncement, useSessionSnapshot } from '@/navigation/session-store';
import { useSpaces } from '@/navigation/spaces-provider';

export default function DashboardScreen() {
  const { refresh, loading, refreshing } = useSpaces();
  const session = useSessionSnapshot();
  const { palette, fonts } = useAppTheme();
  return (
    <Screen title="Dashboard" refreshing={loading || refreshing} onRefresh={refresh}>
      <StackGap>
        <SpaceStatus />
        {session.announceRecovery ? (
          <StackGap>
            <BodyText>
              Private work from this session is still here for the same Google account.
            </BodyText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss recovery message"
              onPress={dismissRecoveryAnnouncement}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: palette.brandPrimary, fontFamily: fonts.semibold, fontSize: typeScale.button }}>
                Dismiss
              </Text>
            </Pressable>
          </StackGap>
        ) : null}
        <BodyText>Dashboard reporting is not available yet. This screen has not calculated any spending.</BodyText>
      </StackGap>
    </Screen>
  );
}
