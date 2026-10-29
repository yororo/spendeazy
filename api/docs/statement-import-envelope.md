# Reviewed import payload envelope evidence

Measured 2026-10-30 on Windows using Node's `Buffer.byteLength(JSON.stringify(payload), 'utf8')`. The unchanged parser limit is 1,048,576 bytes. These are complete synthetic JSON request bodies, not PDF file sizes or certified provider/device limits.

`test/support/confirmation-envelope.ts` derives each probe from the actual mobile serializer golden fixture. Every ten-row block retains two included rows and eight exclusions (payment/refund/cash-in/credit, locked invalid/unknown rows and manual exclusion), original and applied values, original 10,000/9,500 reconciliation, nullable control, page/completeness diagnostics, one remembered Rule and three synthetic warning IDs plus a 64-character acknowledgment digest. Descriptions include multi-byte `café`. Card probes use their admitted provider tuples and omit wallet-only references; GCash retains ephemeral fictional references. Engine versions and acknowledgments are explicitly fictional. These probes measure protocol overhead; they do not assert that a live preview produces those IDs or that these are parsed provider PDFs.

| Provider / format | 10 rows (2 included / 8 excluded) | 1,000 rows (200 / 800) | 3,000 rows (600 / 2,400) |
| --- | ---: | ---: | ---: |
| BDO / Amex | 6,264 bytes | 465,651 bytes | 1,400,251 bytes |
| EastWest / Visa | 6,274 bytes | 465,661 bytes | 1,400,261 bytes |
| GCash / Wallet | 6,689 bytes | 507,566 bytes | 1,528,166 bytes |

The existing HTTP suite validates every probe through the application validator and verifies all source rows have dispositions. It runs automatically through `npm run test:postgres` / `test:e2e`; no new database variable is required. Existing critical atomic/replay/race tests remain in the imported-Expense/Space suite and reuse its isolated database. Mobile confirmation adapter/controller/serializer tests are already registered in `npm test`.

For both preview POST and operation PUT, the real configured HTTP parser receives a complete valid 1,000-row GCash body followed by legal JSON whitespace to reach exactly 1,048,575 bytes. It accepts the decoded payload unchanged. Adding two bytes yields 1,048,577 bytes and 413 without another service call. Service fakes isolate parser/DTO behavior; financial atomicity is established separately by the PostgreSQL suites. Whitespace is used only for the exact boundary pair; measured table sizes are compact unpadded JSON.

## Follow-up decision and delivery gates

The 3,000-row envelopes exceed the current limit for every provider. They are unsupported as single confirmations today. Required supported ledger sizes still need a product/protocol decision coordinated with #138 and representative native evidence. This record does not approve a smaller ledger limit, dropped evidence, truncation, chunking or a raised HTTP limit. More/longer descriptions, diagnostics, Rules, pages or warning IDs change size; even the fitting probes do not establish a general supported row count. Full envelope acceptance remains open until that decision resolves required large ledgers.

#138's provisional 10 MiB/100-page development guards remain uncertified. #154 must integrate durable receipt-before-send and recovery/status/fencing before production mobile PUT is enabled. #155 owns full committed-import presentation. Android and physical-iPhone review-to-Confirm journeys, accessibility, appearance, native lifecycle and successful submission after #154 integration remain pending; automated fixture/HTTP/PostgreSQL checks do not certify them.
