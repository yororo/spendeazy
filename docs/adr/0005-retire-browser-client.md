# Retire the browser client before the native replacement

The accepted mobile replacement retires the browser app, its hosting and browser-specific delivery gates at the start of execution, without waiting for mobile readiness. This is a deliberate trade: the project has one actual User and does not need a legacy client, compatibility window or runnable archive. Keep the API and unrelated server resources, preserve the legacy design asset as a visual reference, and deliver API/PostgreSQL checks independently from native mobile checks. Native builds, device evidence and parser launch validation remain required for personal-use acceptance.

See [issue #140](https://github.com/yororo/spendeazy/issues/140) and its immediate-retirement handoff [issue #133](https://github.com/yororo/spendeazy/issues/133#issuecomment-6378747788); implementation tooling and source retirement are tracked in [issue #141](https://github.com/yororo/spendeazy/issues/141).
