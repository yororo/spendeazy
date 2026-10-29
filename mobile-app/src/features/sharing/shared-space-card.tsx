import { ChevronRight, UserRoundCheck } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { AccessibleSpace } from '@/application/spaces/active-space';
import { SupportingText } from '@/components/screen';
import { useAppTheme } from '@/navigation/app-theme';

export function SharedSpaceCard({ space, ownMemberId, onManage }: {
  space: AccessibleSpace;
  ownMemberId?: string;
  onManage?: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const partners = space.members.filter((member) => member.id !== ownMemberId);
  const title = space.members.map((member) => member.name).join(' & ');
  const heading = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 21 }}>{title}</Text>
      <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{`${space.members.length} members · ${space.status === 'archived' ? 'Archived · Read-only' : 'Shared Space'}`}</Text>
    </View>
    {onManage ? <ChevronRight accessible={false} size={20} color={palette.textSecondary} /> : null}
  </View>;

  return <View style={{ backgroundColor: palette.sharedCard, borderColor: palette.sharedCardBorder, borderWidth: 1, borderRadius: 24, padding: 20, gap: 20 }}>
    {onManage ? <Pressable accessibilityRole="button" accessibilityLabel={`Manage Shared Spaces: ${title}`} onPress={onManage} style={{ minHeight: 48, justifyContent: 'center' }}>{heading}</Pressable> : heading}
    {partners.length ? <View style={{ height: 1, backgroundColor: palette.divider }} /> : null}
    {partners.map((member) => <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: palette.memberAvatar, alignItems: 'center', justifyContent: 'center' }}>
        <Text maxFontSizeMultiplier={1.5} style={{ color: palette.statePositive, fontFamily: fonts.medium, fontSize: 20 }}>{member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 16 }}>{member.name}</Text>
        <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 13 }}>Shared member</Text>
      </View>
      <UserRoundCheck accessible={false} size={18} color={palette.statePositive} />
    </View>)}
    {space.status === 'archived' ? <SupportingText>This Shared Space and its history are read-only.</SupportingText> : null}
  </View>;
}
