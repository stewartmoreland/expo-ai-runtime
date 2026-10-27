/**
 * Eval CLI: `npm run eval -- [--providers a,b] [--fallback none|cloud|any]`.
 *
 * Registers a mock adapter per `--providers` entry (default
 * `apple-foundation-models`). `cloud` uses the reference server when ENDPOINT is
 * set (needs the optional peer `@stewmore/expo-ai-cloud`), otherwise a cloud
 * mock. `--fallback` (default `none`) applies to cases that don't set their own.
 * Prints an EvalResult table; exit code is non-zero if any case fails.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { clearAdapters, registerAdapter } from '@stewmore/expo-ai-core';
import type { ExpoAIFallback, ExpoAIProvider } from '@stewmore/expo-ai-core';
import { createMockAdapter } from '@stewmore/expo-ai-core/testing';

import { runEvalSuite } from './runEvalSuite.js';
import { sampleFromSchema } from './sample.js';
import type { EvalCase, EvalResult } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures');

function loadFixture(name: string): EvalCase[] {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as EvalCase[];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      providers: { type: 'string', default: 'apple-foundation-models' },
      fallback: { type: 'string', default: 'none' },
    },
  });
  if (!['none', 'cloud', 'any'].includes(values.fallback)) {
    throw new Error(`--fallback must be none, cloud or any (got "${values.fallback}").`);
  }
  const fallback = values.fallback as ExpoAIFallback;
  const providers = values.providers.split(',').map((p) => p.trim()) as ExpoAIProvider[];
  if (process.env.ENDPOINT && !providers.includes('cloud')) {
    console.warn('ENDPOINT is set but ignored: add "cloud" to --providers to use it.');
  }

  clearAdapters();

  for (const provider of providers) {
    if (provider === 'cloud') {
      await registerCloud();
      continue;
    }
    // Mock provider. Samples schemas so structured-output cases have valid JSON
    // to return offline.
    registerAdapter(
      createMockAdapter({
        provider,
        supportsTasks: true,
        respondWith: (prompt) => `On-device: ${prompt.replace(/\s+/g, ' ').slice(0, 80)}`,
        objectText: (req) => JSON.stringify(sampleFromSchema(req.schema)),
      }),
    );
  }

  const cases: EvalCase[] = [
    ...loadFixture('summarize.json'),
    ...loadFixture('rewrite.json'),
    ...loadFixture('extract.json'),
    ...loadFixture('safety.json'),
  ];

  // A fixture's own `fallback` wins over the CLI default.
  const suite = await runEvalSuite(cases.map((c) => ({ fallback, ...c })));
  printTable(suite.results);
  console.log(`\n${suite.passed}/${suite.total} passed, ${suite.failed} failed.`);
  process.exit(suite.failed > 0 ? 1 : 0);
}

/** Cloud: the real reference server if ENDPOINT is set, else a mock. */
async function registerCloud(): Promise<void> {
  const endpoint = process.env.ENDPOINT;
  if (!endpoint) {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        supportsTasks: true,
        respondWith: (prompt) => `Cloud: ${prompt.slice(0, 80)}`,
        objectText: (req) => JSON.stringify(sampleFromSchema(req.schema)),
      }),
    );
    console.log('Cloud adapter → mock (set ENDPOINT to use the reference server)');
    return;
  }
  let cloud: typeof import('@stewmore/expo-ai-cloud');
  try {
    cloud = await import('@stewmore/expo-ai-cloud');
  } catch {
    throw new Error(
      'ENDPOINT is set but @stewmore/expo-ai-cloud is not installed (optional peer).',
    );
  }
  cloud.configureCloud({ endpoint });
  console.log(`Cloud adapter → ${endpoint}`);
}

function printTable(results: EvalResult[]): void {
  const headers = ['test', 'provider', 'result', 'ms', 'fallback', 'schema', 'error'] as const;
  const rows = results.map((r) => [
    r.testName,
    r.provider,
    r.passed ? 'PASS' : 'FAIL',
    r.latencyMs.toFixed(1),
    r.usedFallback ? 'yes' : 'no',
    r.schemaValid === undefined ? '-' : r.schemaValid ? 'valid' : 'invalid',
    r.errorCode ?? '',
  ]);

  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => String(row[col]).length)),
  );
  const renderRow = (cells: readonly string[]): string =>
    cells.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('  ');

  console.log('\n' + renderRow(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) console.log(renderRow(row));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
