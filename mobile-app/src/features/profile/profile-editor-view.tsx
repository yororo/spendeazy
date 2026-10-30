import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { useAppTheme } from '@/navigation/app-theme';
import type { ProfileEditorState, ProfileNames } from './profile-workflow';

export function ProfileEditorView({
  state,
  photoUrl,
  email,
  onChange,
  onChoosePhoto,
  onSave,
  onBack,
}: {
  state: ProfileEditorState;
  photoUrl: string | null;
  email: string;
  onChange: (names: Partial<ProfileNames>) => void;
  onChoosePhoto: () => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const busy = state.phase === 'saving' || state.phase === 'choosing';
  const editable = !busy && state.phase !== 'sync-needed';
  return (
    <Screen title="Edit profile">
      <StackGap>
        <View style={{ alignItems: 'center', gap: 14 }}>
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              cachePolicy="none"
              accessibilityLabel="Profile photo preview"
              style={{ width: 84, height: 84, borderRadius: 42 }}
            />
          ) : null}
          <SecondaryButton
            label={
              state.phase === 'choosing' ? 'Choosing photo…' : 'Choose photo'
            }
            disabled={!editable}
            onPress={onChoosePhoto}
          />
        </View>
        <TextField
          label="First name"
          value={state.firstName}
          onChangeText={(firstName) => onChange({ firstName })}
          autoCapitalize="words"
          editable={editable}
        />
        <TextField
          label="Last name (optional)"
          value={state.lastName}
          onChangeText={(lastName) => onChange({ lastName })}
          autoCapitalize="words"
          editable={editable}
        />
        <SupportingText>
          {email
            ? `Email · ${email}`
            : 'Email is managed by your sign-in provider.'}
        </SupportingText>
        {state.error ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{
              color: palette.stateNegative,
              fontFamily: fonts.regular,
              fontSize: 15,
            }}
          >
            {state.error}
          </Text>
        ) : null}
        {state.phase === 'saved' ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: palette.statePositive,
              fontFamily: fonts.regular,
              fontSize: 15,
            }}
          >
            Profile saved.
          </Text>
        ) : null}
        <PrimaryButton
          label={
            state.phase === 'sync-needed'
              ? 'Retry synchronization'
              : 'Save profile'
          }
          busy={state.phase === 'saving'}
          disabled={busy}
          onPress={onSave}
        />
        <SecondaryButton
          label="Back to Profile"
          onPress={onBack}
          disabled={busy}
        />
      </StackGap>
    </Screen>
  );
}
