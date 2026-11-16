// Fails when the gzip size of JavaScript exceeds the budgets from the spec.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const budgets = [
  { name: 'game', dir: 'apps/game/dist', limitKb: 400 },
  { name: 'controller', dir: 'apps/controller/dist', limitKb: 80 },
];

function jsFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return jsFiles(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

let failed = false;
for (const b of budgets) {
  const total = jsFiles(b.dir).reduce((sum, f) => sum + gzipSync(readFileSync(f), { level: 9 }).length, 0);
  const kb = total / 1024;
  const ok = kb <= b.limitKb;
  failed ||= !ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${b.name}: ${kb.toFixed(1)} kB gzip (budget ${b.limitKb} kB)`);
}
process.exit(failed ? 1 : 0);
