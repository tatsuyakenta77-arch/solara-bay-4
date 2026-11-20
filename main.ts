// Meridian Heat — hand-in program for the make.fun gta6-01 competition.
// Node 22, standard library only. It copies the static game (game/) and the
// screenshots (screenshots/) from this repository into the output directory
// and writes output/dossier.json with the vendored make.fun library.
// Run locally with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally with: node serve.ts   (then open the printed local address)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');

mkdirSync(outputDir, { recursive: true });
cpSync(gameSrc, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsSrc)) {
  cpSync(shotsSrc, join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the scorer's gates: at most 4 screenshots of 256 KiB each,
// game/ at most 993 entries and 48 MiB, paths at most 1000 bytes, and the
// whole output under 1000 entries / 64 MiB.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`dossier written to ${join(outputDir, 'dossier.json')}`);
