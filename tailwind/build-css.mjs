// Rebuilds all compiled Tailwind (v3) sheets for the static iframe pages.
// Run: npm run css:build
// Note: Tailwind v3 lives under the alias `tailwindcss-v3` because the main
// React app uses Tailwind v4 via @tailwindcss/vite (package `tailwindcss`).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, 'node_modules', 'tailwindcss-v3', 'lib', 'cli.js');
const sheets = ['main', 'auth', 'dashboard', 'inbox', 'noconfig'];

for (const name of sheets) {
  const args = [
    cli,
    '-c', join(root, 'tailwind', `${name}.config.cjs`),
    '-i', join(root, 'tailwind', `${name}.input.css`),
    '-o', join(root, 'public', 'tailwind', `${name}.css`),
    '--minify',
  ];
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`FAILED: ${name}`); process.exit(r.status ?? 1); }
}
console.log(`All ${sheets.length} sheets rebuilt.`);
