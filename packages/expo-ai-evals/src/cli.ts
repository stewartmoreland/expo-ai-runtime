/**
 * Eval CLI: `npm run eval` (from this package) or `npm run eval` (repo root).
 *
 * Registers an on-device mock provider plus a cloud fallback (the reference
 * server when ENDPOINT is set, otherwise a cloud mock), runs the fixture suite,
 * and prints an EvalResult table. Exit code is non-zero if any case fails.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { clearAdapters, registerAdapter } from "@stewmore/expo-ai-core";
import { createMockAdapter } from "@stewmore/expo-ai-core/testing";

import { runEvalSuite } from "./runEvalSuite.js";
import { sampleFromSchema } from "./sample.js";
import type { EvalCase, EvalResult } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

function loadFixture(name: string): EvalCase[] {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as EvalCase[];
}

async function main(): Promise<void> {
  clearAdapters();

  // On-device system provider (mock). Samples schemas so structured-output
  // cases have valid JSON to return offline.
  registerAdapter(
    createMockAdapter({
      provider: "apple-foundation-models",
      supportsTasks: true,
      respondWith: (prompt) => `On-device: ${prompt.replace(/\s+/g, " ").slice(0, 80)}`,
      objectText: (req) => JSON.stringify(sampleFromSchema(req.schema)),
    }),
  );

  // Cloud fallback: the real reference server if ENDPOINT is set, else a mock.
  const endpoint = process.env.ENDPOINT;
  if (endpoint) {
    const { configureCloud } = await import("@stewmore/expo-ai-cloud");
    configureCloud({ endpoint });
    console.log(`Cloud adapter → ${endpoint}`);
  } else {
    registerAdapter(
      createMockAdapter({
        provider: "cloud",
        supportsTasks: true,
        respondWith: (prompt) => `Cloud: ${prompt.slice(0, 80)}`,
        objectText: (req) => JSON.stringify(sampleFromSchema(req.schema)),
      }),
    );
    console.log("Cloud adapter → mock (set ENDPOINT to use the reference server)");
  }

  const cases: EvalCase[] = [
    ...loadFixture("summarize.json"),
    ...loadFixture("rewrite.json"),
    ...loadFixture("extract.json"),
    ...loadFixture("safety.json"),
  ];

  const suite = await runEvalSuite(cases);
  printTable(suite.results);
  console.log(`\n${suite.passed}/${suite.total} passed, ${suite.failed} failed.`);
  process.exit(suite.failed > 0 ? 1 : 0);
}

function printTable(results: EvalResult[]): void {
  const headers = ["test", "provider", "result", "ms", "fallback", "schema", "error"] as const;
  const rows = results.map((r) => [
    r.testName,
    r.provider,
    r.passed ? "PASS" : "FAIL",
    r.latencyMs.toFixed(1),
    r.usedFallback ? "yes" : "no",
    r.schemaValid === undefined ? "-" : r.schemaValid ? "valid" : "invalid",
    r.errorCode ?? "",
  ]);

  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => String(row[col]).length)),
  );
  const renderRow = (cells: readonly string[]): string =>
    cells.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join("  ");

  console.log("\n" + renderRow(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(renderRow(row));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
