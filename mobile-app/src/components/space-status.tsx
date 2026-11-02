import { ChevronDown, CircleCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useRef, useState, useSyncExternalStore, type ElementRef } from 'react';
import { session } from '@/application/session-runtime';
import { Pressable, Text, View } from 'react-native';

import { SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { Popover } from '@/components/popover';
import { PersonAvatar } from '@/components/person-avatar';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { spaceIdentityLabel, type AccessibleSpace } from '@/application/spaces/active-space';
import { useSpaces } from '@/application/spaces/provider';
import { useAppTheme } from '@/navigation/app-theme';

function SpaceAvatars({ space, compact = false }: { space: AccessibleSpace; compact?: boolean }) {
  const { palette } = useAppTheme();
  const size = compact ? 28 : 32;
  const members = space.members.slice(0, space.kind === 'personal' ? 1 : 2);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: compact ? size + (members.length - 1) * 18 : 48, height: size }}>
    {members.map((member, index) => <View key={member.id} style={{ position: 'absolute', left: index * (compact ? 18 : 16), width: size, height: size, borderRadius: size / 2, backgroundColor: palette.avatar, borderWidth: 2, borderColor: palette.spaceOption, alignItems: 'center', justifyContent: 'center' }}>
      <PersonAvatar name={member.name} photoUrl={member.photoUrl} size={size - 4} />
    </View>)}
  </View>;
}

export function SpaceStatus({ readOnly = false }: { readOnly?: boolean } = {}) {
  const router = useRouter();
  const { spaces, active, loading, error, memoryError, refresh, selectSpace, hasUnsavedWork, hasImportWork, discardUnsavedWork } = useSpaces();
  const { palette, fonts } = useAppTheme();
  const [open, setOpen] = useState(false);
  const switchTrigger = useRef<ElementRef<typeof View>>(null);
  const [pendingSpaceId, setPendingSpaceId] = useState<string | null>(null);
  const recovering = useSyncExternalStore(session.confirmation.subscribe, session.confirmation.hasReceipt, () => false);

  if (loading && !active) return <SupportingText>Loading Spaces.</SupportingText>;
  if (error || !active) return <StackGap><BodyText>{error ?? 'Personal Space is unavailable.'}</BodyText><SecondaryButton label="Retry" onPress={() => void refresh()} /></StackGap>;

  const badge = <View pointerEvents="none" style={{ minHeight: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 22, borderWidth: 1, borderColor: palette.selectedSpaceBorder, backgroundColor: palette.selectedSpace, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <SpaceAvatars space={active} compact />
    {readOnly ? null : <ChevronDown color={palette.textSecondary} size={14} />}
  </View>;

  if (readOnly) return <View accessible accessibilityLabel={`Destination Space: ${spaceIdentityLabel(active)}`} style={{ alignSelf: 'flex-start', flexShrink: 1 }}>{badge}</View>;

  return (
    <View style={{ flexShrink: 1, gap: 6, alignItems: 'flex-end' }}>
      <Pressable ref={switchTrigger} accessibilityRole="button" accessibilityLabel={`Active Space: ${spaceIdentityLabel(active)}.${recovering ? ' Fixed until import acknowledgment. Check import status' : ' Switch Space'}`} accessibilityState={{ expanded: open }} onPress={() => recovering ? router.push('/import-statement') : setOpen(true)} style={{ minHeight: 48, alignSelf: 'flex-end', justifyContent: 'center' }}>
        {badge}
      </Pressable>
      {active.status === 'archived' ? <SupportingText>Archived · Read-only</SupportingText> : null}
      {memoryError ? <SupportingText>{memoryError}</SupportingText> : null}
      <Popover title="Spaces" visible={!recovering && open && pendingSpaceId === null} onDismiss={() => setOpen(false)} anchorRef={switchTrigger} restoreFocusOnDismiss={pendingSpaceId === null} showHeader={false}>
        {spaces.map((space) => {
          const selected = space.id === active.id;
          return <Pressable key={space.id} accessibilityRole="button" accessibilityLabel={spaceIdentityLabel(space)} accessibilityState={{ selected }} onPress={() => {
            if (selected) setOpen(false);
            else if (hasUnsavedWork) setPendingSpaceId(space.id);
            else { void selectSpace(space); setOpen(false); }
          }} style={{ minHeight: 48, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: selected ? palette.selectedSpace : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SpaceAvatars space={space} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 15 }}>{space.kind === 'personal' ? 'Personal' : space.members.map((member) => member.name).join(' & ')}</Text>
              {space.status === 'archived' ? <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>Archived · Read-only</Text> : null}
            </View>
            <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{selected ? <CircleCheck color={palette.brandPrimary} size={20} /> : null}</View>
          </Pressable>;
        })}
      </Popover>
      <ChoiceSheet title={hasImportWork ? 'Statement Import in progress' : 'Unsaved Expense'} visible={pendingSpaceId !== null} onDismiss={() => setPendingSpaceId(null)}>
        <BodyText>{hasImportWork ? 'This Statement Import belongs to the current Space. Discard unsaved work before switching, then select the file again in the destination Space.' : 'Save this Expense first, or discard it before switching Spaces. Its Category selection clears when you switch.'}</BodyText>
        <SecondaryButton label="Keep editing" onPress={() => setPendingSpaceId(null)} />
        <SecondaryButton label="Discard" onPress={() => {
          const nextSpaceId = pendingSpaceId;
          setPendingSpaceId(null);
          setOpen(false);
          discardUnsavedWork();
          if (nextSpaceId) {
            const nextSpace = spaces.find((space) => space.id === nextSpaceId);
            if (nextSpace) void selectSpace(nextSpace);
          }
        }} />
      </ChoiceSheet>
    </View>
  );
}
