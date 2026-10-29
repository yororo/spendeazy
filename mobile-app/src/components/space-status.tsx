import { ChevronDown, CircleCheck, LockKeyhole } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { spaceIdentityLabel, type AccessibleSpace } from '@/application/spaces/active-space';
import { useSpaces } from '@/application/spaces/provider';
import { useAppTheme } from '@/navigation/app-theme';

function SpaceInitials({ space, compact = false }: { space: AccessibleSpace; compact?: boolean }) {
  const { palette, fonts } = useAppTheme();
  const size = compact ? 28 : 32;
  const members = space.members.slice(0, space.kind === 'personal' ? 1 : 2);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: compact ? size + (members.length - 1) * 18 : 48, height: size }}>
    {members.map((member, index) => <View key={member.id} style={{ position: 'absolute', left: index * (compact ? 18 : 16), width: size, height: size, borderRadius: size / 2, backgroundColor: palette.avatar, borderWidth: 2, borderColor: palette.spaceOption, alignItems: 'center', justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={1.5} style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: compact ? 10 : 12 }}>{member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</Text>
    </View>)}
  </View>;
}

export function SpaceStatus() {
  const { spaces, active, loading, error, memoryError, refresh, selectSpace, hasUnsavedWork, discardUnsavedExpense } = useSpaces();
  const { palette, fonts } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [pendingSpaceId, setPendingSpaceId] = useState<string | null>(null);

  if (loading && !active) return <SupportingText>Loading Spaces.</SupportingText>;
  if (error || !active) return <StackGap><BodyText>{error ?? 'Personal Space is unavailable.'}</BodyText><SecondaryButton label="Retry" onPress={() => void refresh()} /></StackGap>;

  return (
    <View style={{ flexShrink: 1, gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Active Space: ${spaceIdentityLabel(active)}. Switch Space`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={{ minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ minHeight: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 22, borderWidth: 1, borderColor: palette.selectedSpaceBorder, backgroundColor: palette.selectedSpace, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SpaceInitials space={active} compact />
          <ChevronDown color={palette.textSecondary} size={14} />
        </View>
      </Pressable>
      {active.status === 'archived' ? <SupportingText>This Shared Space is archived. Expenses, Activity, and import history are read-only.</SupportingText> : null}
      {memoryError ? <SupportingText>{memoryError}</SupportingText> : null}
      <ChoiceSheet title="Switch Space" visible={open && pendingSpaceId === null} onDismiss={() => setOpen(false)} showClose>
        {spaces.map((space) => {
          const selected = space.id === active.id;
          return <Pressable key={space.id} accessibilityRole="button" accessibilityLabel={spaceIdentityLabel(space)} accessibilityState={{ selected }} onPress={() => {
            if (selected) setOpen(false);
            else if (hasUnsavedWork) setPendingSpaceId(space.id);
            else { void selectSpace(space); setOpen(false); }
          }} style={{ minHeight: 76, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: selected ? palette.selectedSpaceBorder : palette.spaceOptionBorder, backgroundColor: selected ? palette.selectedSpace : palette.spaceOption, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <SpaceInitials space={space} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 17 }}>{space.kind === 'personal' ? 'Personal' : space.members.map((member) => member.name).join(' & ')}</Text>
              <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{space.kind === 'personal' ? 'Only you' : space.status === 'archived' ? 'Archived Shared Space · Read-only' : 'Shared Space'}</Text>
            </View>
            <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{selected ? <CircleCheck color={palette.brandPrimary} size={20} /> : space.kind === 'personal' ? <LockKeyhole color={palette.textSecondary} size={20} /> : null}</View>
          </Pressable>;
        })}
      </ChoiceSheet>
      <ChoiceSheet title="Unsaved Expense" visible={pendingSpaceId !== null} onDismiss={() => setPendingSpaceId(null)}>
        <BodyText>Save this Expense first, or discard it before switching Spaces. Its Category selection clears when you switch.</BodyText>
        <SecondaryButton label="Keep working on Expense" onPress={() => setPendingSpaceId(null)} />
        <SecondaryButton label="Discard Expense and switch" onPress={() => {
          const nextSpaceId = pendingSpaceId;
          setPendingSpaceId(null);
          setOpen(false);
          discardUnsavedExpense();
          if (nextSpaceId) {
            const nextSpace = spaces.find((space) => space.id === nextSpaceId);
            if (nextSpace) void selectSpace(nextSpace);
          }
        }} />
      </ChoiceSheet>
    </View>
  );
}
