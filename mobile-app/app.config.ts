import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME?.trim();
  return {
    ...config,
    extra: {
      ...config.extra,
      EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID:
        process.env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID,
      ...(iosUrlScheme
        ? { EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME: iosUrlScheme }
        : {}),
    },
  };
};
