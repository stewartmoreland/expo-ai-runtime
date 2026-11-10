#!/usr/bin/env node
/**
 * `expo-ai-skills build <dir> [--out skills.manifest.json]`
 *
 * Parses and lints every `<dir>/<name>/SKILL.md`, then writes the manifest the
 * app bundles. Node-only: not exported from the package index, so the React
 * Native bundle never sees `node:fs`.
 */
// Built by tsconfig.cli.json, the only build config with Node types, so core stays Node-free.

import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSkillManifest, lintSkill, parseSkill } from '../skills.js';
import type { ExpoAISkill } from '../types.js';

const USAGE = 'Usage: expo-ai-skills build <dir> [--out skills.manifest.json]';

/** Run the CLI. Returns the process exit code. */
export function run(argv: string[], cwd = process.cwd()): number {
  const [command, dir, ...flags] = argv;
  const outIndex = flags.indexOf('--out');
  const out = outIndex >= 0 ? flags[outIndex + 1] : 'skills.manifest.json';
  if (command !== 'build' || !dir || !out) {
    console.error(USAGE);
    return 1;
  }

  const root = resolve(cwd, dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`${root}: error: directory not found.`);
    return 1;
  }
  const skills: ExpoAISkill[] = [];
  let errors = 0;
  const report = (file: string, level: string, message: string) => {
    if (level === 'error') errors += 1;
    console.error(`${file}: ${level}: ${message}`);
  };

  // existsSync follows symlinks (folder or SKILL.md alike) and is false under a plain file.
  for (const name of readdirSync(root)) {
    const file = join(root, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    let skill: ExpoAISkill;
    try {
      skill = parseSkill(readFileSync(file, 'utf8'));
    } catch (error) {
      report(file, 'error', (error as Error).message);
      continue;
    }
    if (skill.name !== name) {
      report(file, 'error', `name "${skill.name}" must equal its folder name "${name}".`);
    }
    for (const result of lintSkill(skill)) report(file, result.level, result.message);
    skills.push(skill);
  }

  if (skills.length === 0 && errors === 0) report(root, 'error', 'no <name>/SKILL.md found.');
  if (errors > 0) {
    console.error(`${errors} error(s); manifest not written.`);
    return 1;
  }

  // Names are unique here: each must equal its (unique) folder name.
  const manifest = buildSkillManifest(skills);
  const outPath = resolve(cwd, out);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${skills.length} skill(s) to ${outPath} (version ${manifest.version}).`);
  return 0;
}

// Run only when executed (npm links the bin through a symlink, hence realpath).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
