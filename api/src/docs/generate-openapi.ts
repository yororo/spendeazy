import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject } from '@nestjs/swagger';
import { dump } from 'js-yaml';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

export const OPENAPI_ARTIFACT_DIRECTORY = resolve(__dirname, '../../docs');
export const OPENAPI_JSON_FILENAME = 'openapi.json';
export const OPENAPI_YAML_FILENAME = 'openapi.yaml';

export interface OpenApiArtifacts {
  json: string;
  yaml: string;
}

export async function generateOpenApiArtifacts(): Promise<OpenApiArtifacts> {
  const document = await createValidatedOpenApiDocument();
  return {
    json: serializeJson(document),
    yaml: serializeYaml(document),
  };
}

export async function generateOpenApiJson(): Promise<string> {
  return (await generateOpenApiArtifacts()).json;
}

export async function generateOpenApiYaml(): Promise<string> {
  return (await generateOpenApiArtifacts()).yaml;
}

export async function writeOpenApiArtifacts(
  outputDirectory = OPENAPI_ARTIFACT_DIRECTORY,
): Promise<OpenApiArtifacts> {
  const artifacts = await generateOpenApiArtifacts();
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, OPENAPI_JSON_FILENAME),
      artifacts.json,
      'utf8',
    ),
    writeFile(
      resolve(outputDirectory, OPENAPI_YAML_FILENAME),
      artifacts.yaml,
      'utf8',
    ),
  ]);
  return artifacts;
}

export async function assertOpenApiArtifactsAreCurrent(
  outputDirectory = OPENAPI_ARTIFACT_DIRECTORY,
): Promise<void> {
  const generatedArtifacts = await generateOpenApiArtifacts();
  const expectedArtifacts = [
    { filename: OPENAPI_JSON_FILENAME, content: generatedArtifacts.json },
    { filename: OPENAPI_YAML_FILENAME, content: generatedArtifacts.yaml },
  ] as const;
  const outOfDateArtifacts: string[] = [];

  for (const artifact of expectedArtifacts) {
    const committedContent = await readArtifact(
      resolve(outputDirectory, artifact.filename),
    );
    if (committedContent !== artifact.content) {
      outOfDateArtifacts.push(artifact.filename);
    }
  }

  if (outOfDateArtifacts.length > 0) {
    throw new Error(
      `OpenAPI artifacts are out of date: ${outOfDateArtifacts.join(', ')}. Run npm run openapi:generate.`,
    );
  }
}

async function readArtifact(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}

async function createValidatedOpenApiDocument(): Promise<OpenAPIObject> {
  const document = await createOpenApiDocument();
  await SwaggerParser.validate(cloneDocument(document));
  return document;
}

function serializeJson(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function serializeYaml(document: OpenAPIObject): string {
  return dump(document, { lineWidth: -1, noRefs: true });
}

async function main(): Promise<void> {
  await writeOpenApiArtifacts();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown OpenAPI generation failure';
    console.error(`OpenAPI generation failed: ${message}`);
    process.exitCode = 1;
  });
}
