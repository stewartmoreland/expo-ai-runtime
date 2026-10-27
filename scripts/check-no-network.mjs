/**
 * Guards the on-device packages' "no network, no analytics" promise: core, react and the
 * Apple module must not reach the network at runtime or pull in runtime deps that could.
 * Tests (`__tests__/`, `*.test.*`) and the Apple build-time config plugin are not scanned.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bsendBeacon\b/,
  /['"](?:expo\/fetch|node:(?:https?|net|tls|dgram)|https?|axios)['"]/,
  /\banalytics\b/i,
];
const SWIFT = [
  /\bURLSession\b/,
  /\bURLRequest\b/,
  /\bNWConnection\b/,
  /^\s*import\s+Network\b/m,
  /\banalytics\b/i,
];
const SCAN = [
  ['packages/expo-ai-core/src', /\.tsx?$/, TS],
  ['packages/expo-ai-react/src', /\.tsx?$/, TS],
  ['packages/expo-ai-apple-foundation-models/src', /\.tsx?$/, TS],
  ['packages/expo-ai-apple-foundation-models/ios', /\.swift$/, SWIFT],
];

const errors = [];
for (const [dir, ext, patterns] of SCAN)
  for (const f of readdirSync(dir, { recursive: true })) {
    if (!ext.test(f) || /__tests__|\.test\./.test(f)) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const re of patterns) if (re.test(src)) errors.push(`${join(dir, f)}: matches ${re}`);
  }

const pkg = (d) => JSON.parse(readFileSync(`packages/${d}/package.json`, 'utf8'));
const runtimeDeps = (p) => Object.keys({ ...p.dependencies, ...p.optionalDependencies });
const core = pkg('expo-ai-core');
if (runtimeDeps(core).length || Object.keys(core.peerDependencies ?? {}).length)
  errors.push(
    'expo-ai-core must have zero dependencies, optionalDependencies and peerDependencies',
  );
for (const d of ['expo-ai-apple-foundation-models', 'expo-ai-react'])
  for (const dep of runtimeDeps(pkg(d)))
    if (dep !== '@stewmore/expo-ai-core')
      errors.push(`${d}: runtime dependency ${dep} not allowed`);

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
console.log('no-network check passed');
