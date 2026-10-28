import { useRouter } from 'expo-router';
import { ChevronRight, FileUp, PenLine } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText } from '@/components/screen';
import { useSpaces } from '@/application/spaces/provider';
import { useAppTheme } from '@/navigation/app-theme';

function AddChoice({ title, description, icon, onPress }: { title: string; description: string; icon: ReactNode; onPress: () => void }) {
  const { palette, fonts } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${description}`} onPress={onPress} style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.spaceOptionBorder, backgroundColor: palette.spaceOption }}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: palette.selectedSpace, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
    <View style={{ flex: 1, gap: 3 }}><Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 17 }}>{title}</Text><Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{description}</Text></View>
    <ChevronRight accessible={false} size={20} color={palette.textSecondary} />
  </Pressable>;
}

export default function AddScreen() {
  const router = useRouter();
  const { palette } = useAppTheme();
  const { active } = useSpaces();
  const writable = active?.status === 'active' && active.accessLevel === 'write';
  return (
    <View style={{ flex: 1 }}>
      <ChoiceSheet title="Add" visible onDismiss={() => router.back()} showClose>
        {writable ? <>
          <AddChoice title="Import statement" description="Not available yet" icon={<FileUp size={22} color={palette.brandPrimary} />} onPress={() => router.push('/import-statement')} />
          <AddChoice title="Add Expense" description="Enter an Expense manually" icon={<PenLine size={22} color={palette.brandPrimary} />} onPress={() => router.push('/add-expense')} />
        </> : <BodyText>This Space is read-only. Its existing Expenses and import history remain available.</BodyText>}
      </ChoiceSheet>
    </View>
  );
}
