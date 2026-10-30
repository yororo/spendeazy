import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/navigation/app-theme';

export function PersonAvatar({
  name,
  photoUrl,
  size = 28,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const { palette, fonts } = useAppTheme();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return photoUrl && failedPhoto !== photoUrl ? (
    <Image
      source={{ uri: photoUrl }}
      cachePolicy="none"
      onError={() => setFailedPhoto(photoUrl)}
      accessible={false}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette.memberAvatar,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        maxFontSizeMultiplier={1.5}
        style={{
          color: palette.statePositive,
          fontFamily: fonts.medium,
          fontSize: size * 0.43,
        }}
      >
        {name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase()}
      </Text>
    </View>
  );
}
