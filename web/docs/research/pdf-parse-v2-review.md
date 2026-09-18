# `pdf-parse` v2 implementation review

Research date: 2026-08-22

Target: `src/features/statement-import/pdf-parser/pdf-parse-v2.ts`

## Scope and source baseline

This review uses first-party sources only. The project currently resolves `pdf-parse` 2.4.5, and the maintainer's [official releases page marks v2.4.5 as the latest stable release](https://github.com/mehmet-kozan/pdf-parse/releases/tag/v2.4.5). The upstream `main` branch is already labeled `3.0.0-beta.0`, so its unreleased API should not be treated as the contract for this v2 integration. The applicable sources are therefore the current official TypeDoc and the source and README pinned to the `v2.4.5` tag.

## Executive findings

| Priority       | Finding                                                                                                    | Recommended action                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 reliability | The parser is never destroyed.                                                                             | Keep the `PDFParse` instance in a guarded outer local and always `await parser?.destroy()` in `finally`.                                              |
| P1 privacy     | `console.log(result)` prints extracted financial-statement content.                                        | Remove the log; use non-sensitive, structured diagnostics only if diagnostics are required.                                                           |
| P2 deployment  | Worker configuration is repeated for every parse and can drift from the installed library version.         | Configure the worker once and make the library/worker version one deployable unit. Prefer a bundled or self-hosted worker from the installed package. |
| P2 correctness | Text extraction and error-recovery defaults are implicit.                                                  | Choose and test explicit options, especially `pageJoiner` and `stopAtErrors`.                                                                         |
| P2 UX          | All upstream failures become one generic application error.                                                | Preserve the current `cause`, and discriminate password/invalid-PDF cases if the import workflow can act on them.                                     |
| P2 testability | File reading, global worker setup, parser construction, extraction, and cleanup are coupled in one method. | Isolate one-time worker setup and inject a small parser factory or adapter for lifecycle unit tests.                                                  |

## Detailed comparison

### 1. Parser lifecycle and cleanup

`PDFParse` construction is lazy: loading occurs when an extraction method such as `getText()` calls the internal loader. The official exception-handling example says to [always call `destroy()` in `finally` to free memory](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/README.md#exception-handling--type-usage), and [`destroy()` is an asynchronous public method](https://mehmet-kozan.github.io/pdf-parse/typedoc/classes/index.PDFParse.html#destroy). The [v2.4.5 implementation](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/src/pdf-parse/PDFParse.ts#L39-L44) destroys the loaded document, clears its reference, and is a no-op when no document was loaded. It is consequently safe to call after constructor, file-read, load, or extraction failures and after prior cleanup.

The current implementation creates `parser` inside `try`, leaving `finally` unable to reach it. This leaks the loaded PDF/worker resources after successful extraction and after failures that occur once loading has begun.

Recommended lifecycle shape:

```ts
let parser: PDFParse | undefined;

try {
  const bytes = new Uint8Array(await file.arrayBuffer());
  parser = new PDFParse(loadParameters);
  const result = await parser.getText(parseParameters);
  return result.text;
} catch (cause) {
  throw new PdfExtractorError(message, { cause });
} finally {
  await parser?.destroy();
}
```

This matches the upstream lifecycle guidance. If cleanup failure handling is later customized, it must not silently erase the primary parsing failure.

### 2. Browser worker configuration

The [official v2.4.5 browser guidance](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/README.md#web--browser) requires the web worker to be set explicitly and permits a custom/self-hosted worker. The current CDN path is one of the documented paths and matches 2.4.5 today.

However, [`PDFParse.setWorker()` writes PDF.js global worker configuration](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/src/pdf-parse/PDFParse.ts#L60-L77). Calling it inside every `parse()` is redundant global mutation and makes an instance method responsible for application bootstrapping. Configure it once at module initialization or application bootstrap instead.

There is also a version-skew risk: the app dependency is `^2.4.5`, while the runtime worker URL is fixed at `2.4.5`. A later dependency resolution could run a newer library against the old worker. For deterministic builds, prefer bundling or self-hosting the worker artifact that came from the installed dependency. If CDN delivery is retained, pin the package exactly and centralize/document the invariant that package and worker versions change together. Do not use `@latest` in production because it breaks that invariant. The bundling preference and version invariant are application-level reliability conclusions based on the documented explicit/custom worker support.

Runtime CDN delivery also adds network, CSP, and third-party availability failure modes to local file parsing. Exercise worker loading in a browser integration test in the deployed build shape.

### 3. Input and result usage

The current conversion to `Uint8Array` follows the official [`LoadParameters.data` recommendation](https://mehmet-kozan.github.io/pdf-parse/typedoc/interfaces/index.LoadParameters.html#data) to use typed arrays for better memory usage. The same documentation warns that a typed array is generally transferred to the worker, which takes ownership, so it should not be reused after parser loading begins.

Passing `password` through the load parameters is supported by [`LoadParameters.password`](https://mehmet-kozan.github.io/pdf-parse/typedoc/interfaces/index.LoadParameters.html#password). Returning `result.text` also matches the documented [`getText()` result](https://mehmet-kozan.github.io/pdf-parse/typedoc/classes/index.PDFParse.html#getText), which provides both per-page text and a concatenated document string.

### 4. Parsing defaults should be a domain decision

Calling `getText()` without options inherits several defaults that affect statement parsing. The official [parse-parameter documentation](https://mehmet-kozan.github.io/pdf-parse/typedoc/documents/options.html#parse-parameters) specifies, among others:

- `lineEnforce: true` with `lineThreshold: 4.6`;
- `cellSeparator: "\t"` with `cellThreshold: 7`;
- `pageJoiner: "\n-- page_number of total_number --"`;
- `disableNormalization: false`, which is recommended for plain text.

Synthetic `-- 1 of N --` markers may pollute transaction matching. Passing `pageJoiner: ""` prevents those markers while retaining the library's ordinary page separation. Line/cell thresholds can materially affect columns in bank-generated PDFs, so they should be documented and verified against representative statement fixtures rather than tuned without evidence.

The load option [`stopAtErrors` defaults to `false`](https://mehmet-kozan.github.io/pdf-parse/typedoc/interfaces/index.LoadParameters.html#stopAtErrors), allowing PDF.js to recover partial content where possible. For a financial import pipeline, silently incomplete text may be riskier than rejecting the statement. Strongly consider `stopAtErrors: true`, but treat this as an application policy: validate it against malformed-yet-usable statement fixtures and the downstream reconciliation checks.

### 5. Error handling and sensitive output

Wrapping an upstream failure in `PdfExtractorError` with `{ cause }` is good: it gives the feature a stable boundary without discarding diagnostics. The official v2 example documents typed failures including `PasswordException`, `InvalidPDFException`, `FormatError`, `ResponseException`, `AbortException`, and `UnknownErrorException`, and demonstrates [handling `PasswordException` separately](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/README.md#exception-handling--type-usage). The TypeDoc clarifies that [`PasswordException`](https://mehmet-kozan.github.io/pdf-parse/typedoc/classes/index.PasswordException.html) covers a missing or incorrect password.

If the Statement Import workflow supports password retry or an invalid-file message, map those cases to actionable application error kinds while retaining the upstream cause. Otherwise, keeping one public error type with an inspectable cause is acceptable.

Remove `console.log(result)`. `TextResult` contains the full extracted statement, so this exposes financial data in browser logs and makes normal parsing noisy. Upstream examples log only to demonstrate the API; they are not production observability guidance.

### 6. Testability and verification

`PDFParse.setWorker()` is static/global, while parser construction and file reading currently occur inside the business method. A small injected factory or adapter is sufficient to unit-test the contract without a real browser worker:

```ts
type PdfParseInstance = Pick<PDFParse, "getText" | "destroy">;
type PdfParseFactory = (params: LoadParameters) => PdfParseInstance;
```

This is a project-level design recommendation, not a library requirement. Keep it narrow: the production factory can remain `params => new PDFParse(params)`.

Unit tests should prove:

- correct text is returned and the password/load options are forwarded;
- explicit parse options are forwarded;
- `destroy()` is awaited after success and after `getText()` rejects;
- `File.arrayBuffer()` and parser failures retain their cause in `PdfExtractorError`;
- expected typed exceptions can be mapped without string matching;
- statement contents are not logged.

Add browser integration tests with local PDF fixtures for a representative multi-page statement, a password-protected statement with missing/wrong/correct passwords, a corrupt or non-PDF file, and page-boundary/column behavior. Upstream likewise maintains [unit tests](https://github.com/mehmet-kozan/pdf-parse/tree/v2.4.5/tests/unit) and [environment integration tests](https://github.com/mehmet-kozan/pdf-parse/tree/v2.4.5/tests/integration), with official examples for password, page selection, base64, URL, and large-file behavior linked from its [v2.4.5 README](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/README.md#gettext--extract-text).

### 7. Self-hosting with Vite

Recommended: copy the worker from the installed `pdf-parse` package on every Vite serve/build with `vite-plugin-static-copy`, then point `PDFParse` at that same-origin file. This keeps the parser and worker in one dependency/lockfile update instead of committing a second, manually maintained copy. Upstream explicitly supports a self-hosted `pdf.worker.mjs` and requires browser callers to set it ([v2.4.5 browser guidance](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/README.md#web--browser)). The copy plugin serves source files directly during development, copies them under `build.outDir` for production, and requires normalized paths on Windows ([plugin documentation](https://github.com/sapphi-red/vite-plugin-static-copy#usage)). Its current 4.1.1 release declares Vite 8 support ([package manifest](https://github.com/sapphi-red/vite-plugin-static-copy/blob/v4.1.1/package.json)).

Install the pinned development dependency:

```powershell
npm install --save-dev --save-exact vite-plugin-static-copy@4.1.1
```

Configure `vite.config.ts` (retain the existing plugins/options around this):

```ts
import { fileURLToPath } from "node:url";

import { defineConfig, normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const pdfParseWorkerPath = normalizePath(
  fileURLToPath(
    new URL("../web/pdf.worker.mjs", import.meta.resolve("pdf-parse")),
  ),
);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: pdfParseWorkerPath,
          dest: "assets",
        },
      ],
    }),
  ],
});
```

`import.meta.resolve("pdf-parse")` finds the installed package entry; resolving `../web/pdf.worker.mjs` from it selects the worker shipped with that exact installation. `normalizePath` converts the resulting Windows path to the forward-slash form the plugin's globbing requires. The output/dev URL is `assets/pdf.worker.mjs`:

```ts
const PDF_WORKER_URL = `${import.meta.env.BASE_URL}assets/pdf.worker.mjs`;

PDFParse.setWorker(PDF_WORKER_URL);
```

`import.meta.env.BASE_URL` supports Vite's default `/` base and nested absolute bases such as `/spendeazy/`; Vite documents it as the build-time public base for dynamically constructed URLs ([Vite 8 public-base guidance](https://v8.vite.dev/guide/build#public-base-path)). If deployment uses a relative `base` (`"./"` or `""`), do not assume the concatenated URL is stable on deep client-side routes: configure an absolute asset base or verify the deployed route shape explicitly.

Alternatives:

- A manual copy to `public/assets/pdf.worker.mjs` also works: Vite serves `public` at `/` during development and copies it unchanged to the output root ([Vite static-asset guidance](https://vite.dev/guide/assets.html#the-public-directory)). It has no plugin dependency, but the checked-in worker can become stale after a `pdf-parse` upgrade, so it is less reliable unless a script and CI check refresh it from `node_modules`.
- Vite's preferred asset path would normally be `import workerUrl from "...pdf.worker.mjs?url"`; `?url` gives a hashed, base-aware asset URL ([Vite explicit URL imports](https://vite.dev/guide/assets.html#explicit-url-imports)). It is not a supported option for `pdf-parse` 2.4.5: that release exports only `.`, `./worker`, and `./node`, not the browser-worker file ([v2.4.5 export map](https://github.com/mehmet-kozan/pdf-parse/blob/v2.4.5/package.json#L8-L54)), and package export maps prevent imports of unexported subpaths ([Node package-entry documentation](https://nodejs.org/api/packages.html#package-entry-points)). `pdf-parse/worker?url` resolves the Node-oriented helper module rather than `dist/pdf-parse/web/pdf.worker.mjs`, so it must not be substituted.

## Recommended implementation order

1. Remove statement logging and implement unconditional `destroy()` cleanup.
2. Move worker configuration out of `parse()` and eliminate package/worker version drift.
3. Make `pageJoiner` and the `stopAtErrors` policy explicit.
4. Preserve or map actionable typed errors.
5. Add lifecycle unit tests and representative browser fixtures before tuning line/cell extraction parameters.
