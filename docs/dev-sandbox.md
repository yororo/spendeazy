# Mobile dev sandbox

Run the Spendeazy mobile toolchain in a Dev Container, and run the Android emulator on the Windows 11 host. The container's `adb` client uses the host adb server (`ADB_SERVER_SOCKET=tcp:host.docker.internal:5037`). The emulator stays on Windows Hypervisor Platform. Metro runs in the container on port 8081.

This is optional. The [local runbook](local-testing.md) remains the workflow for API, PostgreSQL, Clerk, and a toolchain installed directly on the machine. Expo Go is not the target. The app is the Expo SDK 58 client in `mobile-app/` (`com.seyfsasy.spendeazymobile`).

Secrets stay in gitignored env files. The image build does not copy the repository. `mobile-app/.env.example` and `api/.env.example` already list the variables; copy them to `.env.local` as the runbook describes. Do not commit `.env` or `.env.local`.

## What runs where

| Piece | Where |
| --- | --- |
| Node 24.11.1, npm, JDK 17, Android SDK platform-tools (`adb`), Android 16 platform (API 36), build-tools 36.0.0, Maestro 2.12.1, EAS CLI 27.4.1 | Dev Container |
| Expo CLI | `npx expo` from `mobile-app/` after `npm ci` (not a global install) |
| Android Studio AVD (Google Play system image) and `adb -a nodaemon server start` | Windows host |
| PostgreSQL and the API | [Local runbook](local-testing.md), reached from the emulator at `http://10.0.2.2:4000` |

`10.0.2.2` is the Windows host as seen by the Android Studio emulator. Keep the API on the host (or on a port published on the Windows host). Do not point `EXPO_PUBLIC_API_BASE_URL` at the container's loopback.

## One-time Windows setup

1. In BIOS/UEFI, enable Intel VT-x or AMD SVM.
2. In Windows Features, enable **Virtual Machine Platform**, **Windows Subsystem for Linux**, and **Windows Hypervisor Platform**. Restart.
3. Install WSL2: `wsl --install`. Confirm with `wsl -l -v` that the distro version is 2.
4. Install Docker Desktop and turn on **Use the WSL 2 based engine**. In Docker Desktop settings, enable integration for that distro.
5. Install Android Studio. Install **Android SDK Platform-Tools**. Create an AVD with a **Google Play** image (the runbook prefers `Pixel_10`). Put `%LOCALAPPDATA%\Android\Sdk\platform-tools` on the user `PATH`.

Windows Hypervisor Platform runs the emulator. Docker Desktop uses WSL2. They run side by side; the container does not need `/dev/kvm` for this path.

## Start the host adb server

Android Studio's default adb listens on Windows localhost only. The container cannot reach that. Stop any existing server, then start one that listens on all interfaces, and leave the window open:

```powershell
adb kill-server
adb -a nodaemon server start
```

`-a` is what makes port 5037 reachable from Docker. When Windows Firewall prompts, allow `adb.exe` on private networks only. Do not publish port 5037 through a router; the socket is an unauthenticated debug bridge.

Start the AVD from Android Studio after the server is listening so the emulator attaches to it. Check from Windows:

```powershell
adb devices -l
```

The serial should say `device`.

## Clone on the WSL filesystem

Clone inside the Linux home directory, not under `/mnt/c`. Metro file watching and Dev Container bind mounts are slow and unreliable on the Windows drive.

```bash
cd ~
git clone https://github.com/yororo/spendeazy.git
cd spendeazy
cp mobile-app/.env.example mobile-app/.env.local
cp api/.env.example api/.env.local
```

Fill both `.env.local` files from the [local runbook](local-testing.md) (section "Configure values"). From the emulator, `EXPO_PUBLIC_API_BASE_URL` is `http://10.0.2.2:4000`.

Open that WSL checkout in Cursor or VS Code (for example `\\wsl$\Ubuntu\home\<user>\spendeazy`), then **Dev Containers: Reopen in Container**. The definition is `.devcontainer/devcontainer.json`. The first open builds the image and runs `npm ci` plus `npm run statement-import:prepare` in `mobile-app/`.

## Run the app on the emulator

In a container terminal:

```bash
# cwd: mobile-app
npm run sandbox:android
```

That script checks `ADB_SERVER_SOCKET`, requires an emulator in the `device` state, runs `adb reverse tcp:8081 tcp:8081`, and starts `npx expo start --dev-client --host lan --port 8081`. The packager hostname is `127.0.0.1`, so the dev client loads Metro through the reverse tunnel rather than a container-only address.

Confirm the editor's Ports view shows **8081** forwarded. `adb reverse` targets the Windows host's localhost, and that forward is what delivers it into the container. If you change the port, set `EXPO_PORT`, forward that port, and reverse the same number on both sides (`npm run sandbox:reverse` reverses 8081 only).

With no development build installed yet, stop Metro and install one from the container. The host adb server receives the install:

```bash
# cwd: mobile-app
npx expo run:android --device
```

The first build can download the NDK into `/opt/android-sdk`. `expo run:android` may rewrite the `android` and `ios` scripts in `package.json`; restore them unless that change is intended. Native module or app-config changes still need a rebuild, as in the [local runbook](local-testing.md).

A new `mobile-app/android/app/debug.keystore` has its own signing SHA-1. Register it on the Android OAuth client, or reuse a keystore that is already registered. See [Android debug signing SHA-1](local-testing-auth.md#android-debug-signing-sha-1).

Startup is complete when the sign-in screen shows **Tap to sign-in**, or Dashboard when this emulator is already signed in.

## Run Maestro

Maestro is on the image `PATH`. With Metro running, the port forwarded, and `adb reverse` in place:

```bash
# cwd: mobile-app
npm run maestro:smoke
```

`mobile-app/.maestro/smoke.yaml` clears local app data, opens the SDK 58 dev-client URL `spendeazymobile://?__expo_url=http://127.0.0.1:8081` with the onboarding, Tools button, and launch dev-menu flags disabled, and asserts the visible sign-in label **Tap to sign-in** (`mobile-app/src/features/auth/sign-in-brand-scene.tsx`). Clearing state signs out the local Clerk session. The flow needs `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; without it the first screen is the configuration message instead.

Other flow files in `mobile-app/.maestro/` run with `maestro test .maestro`.

## Optional: emulator inside WSL2

Leave this path unused unless you want the emulator off the Windows host. It needs nested virtualization and is separate from `ADB_SERVER_SOCKET`.

In `%UserProfile%\.wslconfig`:

```ini
[wsl2]
nestedVirtualization=true
```

Shut WSL down (`wsl --shutdown`) and reopen it. Inside the distro, `/dev/kvm` should exist. Add `"--device=/dev/kvm"` to `runArgs` in `.devcontainer/devcontainer.json`, and remove `ADB_SERVER_SOCKET` from `containerEnv` so `adb` starts a server in the container next to that emulator. This image includes platform-tools and the compile SDK. Install the emulator package and a Google Play system image into `ANDROID_HOME` for this path. Then follow the [local runbook](local-testing.md) emulator steps from inside the container (`emulator -avd Pixel_10`, `adb shell getprop sys.boot_completed`).

The Windows-host emulator and this nested emulator should not both own adb. Use one of the two setups.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `adb` connection refused | The Windows `adb -a nodaemon server start` window must still be open. `netstat -ano \| findstr 5037` on Windows should show `0.0.0.0:5037`. Allow `adb.exe` on private networks. |
| `adb devices` is empty | Start the AVD after the `-a` server. If Android Studio started a localhost-only server first, run `adb kill-server` on Windows and start `adb -a nodaemon server start` again. |
| Dev client cannot load the bundle | Ports view must list 8081. Re-run `npm run sandbox:reverse`. The URL the app opens must be `127.0.0.1:8081`, not the container's eth0 address. |
| Maestro stays on the dev-client launcher | Metro must already be running. The flow opens `spendeazymobile://?__expo_url=http://127.0.0.1:8081` with the launch flags from the smoke file. |
| `unauthorized` | On the emulator, accept the USB debugging prompt, then retry `adb devices`. |
| Sign-in shows a configuration message | Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `mobile-app/.env.local` and reload Metro. |
| Google sign-in developer error | [SHA-1 and client id checks](local-testing-auth.md). |
| Container open fails on `/mnt/c` | Move the clone to the WSL home directory and reopen. |
| `expo run:android` rewrote npm scripts | Restore `android` / `ios` in `mobile-app/package.json`. |
