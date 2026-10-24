import { useAuth, useUser } from '@clerk/expo';
import { Image } from 'expo-image';
import { useState } from 'react';

import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { SpaceStatus } from '@/components/space-status';
import { type AppearancePreference } from '@/navigation/appearance';
import { useAppTheme } from '@/navigation/app-theme';
import { markExplicitSignOut } from '@/navigation/session-store';

const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { preference, setPreference } = useAppTheme();
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const name = user?.fullName ?? user?.username ?? 'Signed-in User';
  const email = user?.primaryEmailAddress?.emailAddress;

  async function chooseAppearance(next: AppearancePreference) {
    const saved = await setPreference(next);
    setAppearanceError(saved ? null : 'This device could not remember Appearance.');
  }

  return (
    <Screen title="Profile">
      <StackGap>
        {user?.imageUrl ? (
          <Image
            source={{ uri: user.imageUrl }}
            accessibilityLabel={`${name} photo`}
            style={{ width: 64, height: 64, borderRadius: 32 }}
          />
        ) : null}
        <BodyText>{name}</BodyText>
        {email ? <SupportingText>{email}</SupportingText> : null}
        <SupportingText>Name, photo, and email come from your Google sign-in.</SupportingText>
        <SupportingText>Appearance</SupportingText>
        {appearanceOptions.map((option) => (
          <SecondaryButton
            key={option.value}
            label={option.label}
            selected={preference === option.value}
            onPress={() => void chooseAppearance(option.value)}
          />
        ))}
        {appearanceError ? <BodyText>{appearanceError}</BodyText> : null}
        <SpaceStatus />
        <PrimaryButton
          label="Sign out"
          onPress={() => {
            markExplicitSignOut();
            void signOut();
          }}
        />
        <SupportingText>Deleting your sign-in identity is not available yet and has not removed any data.</SupportingText>
      </StackGap>
    </Screen>
  );
}
