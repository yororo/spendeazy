import { readFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import {
  generateOpenApiArtifacts,
  writeOpenApiArtifacts,
} from './generate-openapi';

describe('OpenAPI artifact generation', () => {
  it('renders one validated document deterministically as JSON and YAML', async () => {
    const firstArtifacts = await generateOpenApiArtifacts();
    const secondArtifacts = await generateOpenApiArtifacts();

    expect(firstArtifacts).toEqual(secondArtifacts);
    expect(JSON.parse(firstArtifacts.json)).toEqual(load(firstArtifacts.yaml));
    expect(firstArtifacts.json.endsWith('\n')).toBe(true);
    expect(firstArtifacts.yaml.endsWith('\n')).toBe(true);

    const document = JSON.parse(firstArtifacts.json) as {
      info: { version: string };
      paths: Record<string, unknown>;
    };
    expect(document.info.version).toBe('1.0.0');
    expect(document.paths['/api/v1/users/me/category-summaries']).toBeDefined();
    expect(document.paths['/docs']).toBeUndefined();
    expect(document.paths['/docs-json']).toBeUndefined();
    expect(document.paths['/docs-yaml']).toBeUndefined();
  });

  it('writes both artifacts to the requested documentation directory', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'spendeazy-openapi-'));

    try {
      const artifacts = await writeOpenApiArtifacts(outputDirectory);

      await expect(
        readFile(join(outputDirectory, 'openapi.json'), 'utf8'),
      ).resolves.toBe(artifacts.json);
      await expect(
        readFile(join(outputDirectory, 'openapi.yaml'), 'utf8'),
      ).resolves.toBe(artifacts.yaml);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });
});
