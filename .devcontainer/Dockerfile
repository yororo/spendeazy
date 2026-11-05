FROM node:24.11.1-bookworm

# Tool versions are pinned so the image does not drift between rebuilds.
# Node matches CI and docs/local-testing.md. EAS CLI satisfies mobile-app/eas.json
# (>= 25.2.0). Expo CLI is not installed globally; the project dependency supplies it.
ARG EAS_CLI_VERSION=27.4.1
ARG MAESTRO_VERSION=2.12.1
ARG ANDROID_CMDLINE_TOOLS_REV=13114758

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:${PATH}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
        git \
        g++ \
        make \
        openjdk-17-jdk-headless \
        openssh-client \
        python3 \
        unzip \
    && ln -sfn /usr/lib/jvm/java-17-openjdk-* /usr/lib/jvm/java-17-openjdk \
    && rm -rf /var/lib/apt/lists/*

# platform-tools provides adb. Platform 36 and build-tools 36.0.0 match the
# Android 16 SDK Expo currently requires to compile a development build.
# The emulator and system images stay on the Windows host.
# This image does not copy the repository, so gitignored env files and secrets
# never enter the image. devcontainer.json sets ADB_SERVER_SOCKET.
RUN mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_REV}_latest.zip" -o /tmp/cmdline-tools.zip \
    && unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools \
    && mv /tmp/cmdline-tools/cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-tools \
    && yes | sdkmanager --sdk_root="${ANDROID_HOME}" --licenses >/dev/null \
    && sdkmanager --sdk_root="${ANDROID_HOME}" --install \
        "platform-tools" \
        "platforms;android-36" \
        "build-tools;36.0.0" \
    && chown -R node:node "${ANDROID_HOME}"

RUN curl -fsSL "https://github.com/mobile-dev-inc/maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip" -o /tmp/maestro.zip \
    && unzip -q /tmp/maestro.zip -d /opt \
    && ln -sf /opt/maestro/bin/maestro /usr/local/bin/maestro \
    && rm /tmp/maestro.zip \
    && npm install --global "eas-cli@${EAS_CLI_VERSION}" \
    && npm cache clean --force \
    && test -x "${JAVA_HOME}/bin/java" \
    && java -version \
    && node -v \
    && npm -v \
    && adb version \
    && maestro --version \
    && CI=1 eas --version

# Maestro's installer enables anonymous analytics and prints a banner.
# Opt out for sandbox shells; this does not affect the Spendeazy app.
ENV MAESTRO_CLI_NO_ANALYTICS=1 \
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

# Login shells reset PATH in /etc/profile. Put adb back on PATH for those,
# and link it into /usr/local/bin so a default PATH still finds it.
RUN printf '%s\n' \
        'export PATH="/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:${PATH}"' \
        > /etc/profile.d/android-sdk.sh \
    && ln -sf /opt/android-sdk/platform-tools/adb /usr/local/bin/adb \
    && ln -sf /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager /usr/local/bin/sdkmanager

USER node
WORKDIR /workspaces/spendeazy
