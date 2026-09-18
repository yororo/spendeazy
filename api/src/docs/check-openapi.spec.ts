import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertOpenApiArtifactsAreCurrent,
  writeOpenApiArtifacts,
} from './generate-openapi';

describe('OpenAPI artifact checking', () => {
  it('accepts artifacts produced by the authoritative generator', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'spendeazy-openapi-'));

    try {
      await writeOpenApiArtifacts(outputDirectory);

      await expect(
        assertOpenApiArtifactsAreCurrent(outputDirectory),
      ).resolves.toBeUndefined();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it('reports every committed artifact that differs from regeneration', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'spendeazy-openapi-'));

    try {
      await writeOpenApiArtifacts(outputDirectory);
      const jsonPath = join(outputDirectory, 'openapi.json');
      const yamlPath = join(outputDirectory, 'openapi.yaml');
      const json = await readFile(jsonPath, 'utf8');
      const yaml = await readFile(yamlPath, 'utf8');
      await writeFile(jsonPath, `${json} `, 'utf8');
      await writeFile(yamlPath, `${yaml}# drift\n`, 'utf8');

      await expect(
        assertOpenApiArtifactsAreCurrent(outputDirectory),
      ).rejects.toThrow(
        'OpenAPI artifacts are out of date: openapi.json, openapi.yaml. Run npm run openapi:generate.',
      );
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
