// Combines the game and controller builds into one static site in ./dist:
//   dist/      -> game
//   dist/c/    -> controller
import { cpSync, existsSync, rmSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
cpSync('apps/game/dist', out, { recursive: true });
if (existsSync('apps/controller/dist')) {
  cpSync('apps/controller/dist', `${out}/c`, { recursive: true });
}
console.log('Assembled site in ./dist');
