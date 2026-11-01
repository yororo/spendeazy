import { useRouter } from 'expo-router';
import { FileUp, PenLine } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Popover } from '@/components/popover';
import { BodyText } from '@/components/screen';
import { useSpaces } from '@/application/spaces/provider';
import { useAppTheme } from '@/navigation/app-theme';

function AddChoice({ title, icon, onPress }: { title: string; icon: ReactNode; onPress: () => void }) {
  const { palette, fonts } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 }}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{icon}</View>
    <Text style={{ flex: 1, color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 15 }}>{title}</Text>
  </Pressable>;
}

export default function AddScreen() {
  const router = useRouter();
  const { palette } = useAppTheme();
  const { active } = useSpaces();
  const writable = active?.status === 'active' && active.accessLevel === 'write';
  return (
    <View style={{ flex: 1 }}>
      <Popover title="Add" presentation="inline" visible onDismiss={() => router.back()} showHeader={false}>
        {writable ? <>
          <AddChoice title="Add expense" icon={<PenLine size={20} color={palette.brandPrimary} />} onPress={() => router.push('/add-expense')} />
          <AddChoice title="Import statement" icon={<FileUp size={20} color={palette.brandPrimary} />} onPress={() => router.push('/import-statement')} />
        </> : <BodyText>This Space is read-only. Its existing Expenses and import history remain available.</BodyText>}
      </Popover>
    </View>
  );
}
