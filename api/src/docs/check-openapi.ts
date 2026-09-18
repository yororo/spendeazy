import { assertOpenApiArtifactsAreCurrent } from './generate-openapi';

async function main(): Promise<void> {
  await assertOpenApiArtifactsAreCurrent();
  console.log('OpenAPI artifacts are up to date.');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown OpenAPI artifact check failure';
    console.error(`OpenAPI artifact check failed: ${message}`);
    process.exitCode = 1;
  });
}
