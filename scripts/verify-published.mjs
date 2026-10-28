/**
 * After release-it: fail unless every public `packages/*` name@version is on npm.
 * Catches partial publishes (one package fails mid-release, the rest ship).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const ATTEMPTS = Number(process.env.VERIFY_ATTEMPTS ?? 36);
const DELAY_MS = 10_000; // registry/CDN propagation; v0.8.0 took >2 min for one package

const pkgs = readdirSync('packages')
  .map((d) => JSON.parse(readFileSync(`packages/${d}/package.json`, 'utf8')))
  .filter((p) => !p.private);

async function exists({ name, version }) {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2F')}/${version}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return true;
}

let missing = pkgs;
for (let i = 1; i <= ATTEMPTS && missing.length; i++) {
  const ok = await Promise.all(missing.map((p) => exists(p).catch(() => false)));
  missing = missing.filter((_, j) => !ok[j]);
  if (missing.length && i < ATTEMPTS) {
    console.log(
      `attempt ${i}/${ATTEMPTS}: waiting on ${missing.map((p) => `${p.name}@${p.version}`).join(', ')}`,
    );
    await sleep(DELAY_MS);
  }
}
if (missing.length) {
  for (const p of missing) console.error(`::error::${p.name}@${p.version} is not on npm`);
  process.exit(1);
}
console.log(`Verified on npm: ${pkgs.map((p) => `${p.name}@${p.version}`).join(', ')}`);
