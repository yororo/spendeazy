# Statement parser proof of concept

This folder is a throwaway Expo development build. It checks that Statement Import PDFs can be parsed on device with the same text as the web app. It is not the product, and it is not for merge.

Do not add authentication, API calls, categorization UI, or a commit step. Do not use EAS, Expo accounts, or Expo Go. Build locally with `npx expo run:android` or, on a Mac, `npx expo run:ios`.

Parser behavior lives in `web/src`. Regenerate the bundles with `npm run prepare:poc` after that code or the pinned `pdf-parse` version changes. Read [README.md](README.md) before changing the extraction path.
