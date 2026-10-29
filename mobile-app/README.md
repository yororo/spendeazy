# Spendeazy mobile

Native Android/iPhone application built with Expo Router. Follow the [local runbook](../docs/local-testing.md) for installed development builds and device setup; Expo Go is not the acceptance target. [Coding standards](CODING_STANDARDS.md) describe feature/controller/adapter ownership. The [OpenAPI contract](../api/docs/openapi.yaml) owns shipped HTTP behavior.

Run `npm test`, `npm run parser:test`, `npm run lint` and `npm run typecheck` from this directory. Application tests include review/session lifecycle, confirmation serialization/controller and HTTP adapter parity checks. Parser fixtures use fictional data and establish no native device certification.

The [Statement Import feature guide](src/features/statement-import/README.md) owns extraction, review and the public confirmation handoff. Confirm supports final inspection and warning previews. Production submission remains disabled until #154 supplies durable receipt-before-send and recovery integration. #155 owns committed-import history/detail presentation. The [complete JSON envelope evidence](../api/docs/statement-import-envelope.md) records fitting and overflowing probes under the unchanged 1 MiB API limit. Native Android/physical-iPhone acceptance and #138's parser launch limits remain pending.
