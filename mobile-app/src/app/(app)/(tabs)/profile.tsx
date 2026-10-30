import { useUser } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { LogOut, Mail, UsersRound } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { CompactAction, SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { SpaceStatus } from '@/components/space-status';
import { useSpaces } from '@/application/spaces/provider';
import { SharedSpaceCard } from '@/features/sharing/shared-space-card';
import { type AppearancePreference } from '@/navigation/appearance';
import { useAppTheme } from '@/navigation/app-theme';
import { useSessionTransport } from '@/application/authorized-client';

const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useSessionTransport();
  const { user } = useUser();
  const { preference, setPreference, palette, fonts } = useAppTheme();
  const { spaces, active, refresh } = useSpaces();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const sharedSpace = active?.kind === 'shared' ? active : spaces.find((space) => space.kind === 'shared' && space.status === 'active');
  const ownMemberId = spaces.find((space) => space.kind === 'personal')?.members[0]?.id;
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const name = user?.fullName ?? user?.username ?? 'Signed-in User';
  const email = user?.primaryEmailAddress?.emailAddress;

  async function chooseAppearance(next: AppearancePreference) {
    const saved = await setPreference(next);
    setAppearanceError(saved ? null : 'This device could not remember Appearance.');
  }

  return (
    <Screen title="Profile" headerAccessory={<SpaceStatus />}>
      <StackGap>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 18 }}>
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              cachePolicy="none"
              accessibilityLabel={`${name} photo`}
              style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: palette.sharedCardBorder }}
            />
          ) : (
            <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: palette.sharedCardBorder, backgroundColor: palette.profileAvatar, alignItems: 'center', justifyContent: 'center' }}>
              <Text maxFontSizeMultiplier={1.5} style={{ color: palette.brandPrimary, fontFamily: fonts.medium, fontSize: 34 }}>{name.trim().slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 25, textAlign: 'center' }}>{name}</Text>
          {email ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Mail accessible={false} size={15} color={palette.textSecondary} />
              <Text selectable style={{ flexShrink: 1, color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center' }}>{email}</Text>
            </View>
          ) : null}
        </View>
        <SecondaryButton label="Edit profile" onPress={() => router.push('../edit-profile')} />
        <SecondaryButton label="Account settings" onPress={() => router.push('../account-settings')} />
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><UsersRound accessible={false} size={18} color={palette.brandPrimary} /><Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 15 }}>Shared Space</Text></View>
          {sharedSpace ? (
            <SharedSpaceCard space={sharedSpace} ownMemberId={ownMemberId} onManage={() => router.push('../sharing')} />
          ) : (
            <View style={{ gap: 14 }}>
              <SupportingText>You do not belong to an active Shared Space. Invite someone or join with an Invite Code.</SupportingText>
              <SecondaryButton label="Manage Shared Spaces" onPress={() => router.push('../sharing')} />
            </View>
          )}
        </View>
        <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 15 }}>Appearance</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 16, backgroundColor: palette.segmentedTrack }}>
          {appearanceOptions.map((option) => (
            <View key={option.value} style={{ flexGrow: 1, flexBasis: 80 }}>
              <CompactAction
                variant="segmented"
                label={option.label}
                selected={preference === option.value}
                onPress={() => void chooseAppearance(option.value)}
              />
            </View>
          ))}
        </View>
        {appearanceError ? <BodyText>{appearanceError}</BodyText> : null}
        <CompactAction
          label="Sign out"
          variant="quiet"
          icon={<LogOut size={17} color={palette.textSecondary} />}
          onPress={() => { void signOut().catch(() => setAppearanceError('Sign-out did not finish. Retry sign out.')); }}
        />
      </StackGap>
    </Screen>
  );
}
