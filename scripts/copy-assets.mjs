// Copies the runtime 3D assets from assets/3d-models into public/ so Vite can
// serve them. Run automatically via the predev / prebuild npm hooks, which
// keeps the binary assets out of git (only assets/3d-models is the source).
import { mkdirSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jobs = [
  { from: "assets/3d-models/fbx", to: "public/models", ext: ".fbx" },
  { from: "assets/3d-models/textures", to: "public/textures", ext: ".jpg" },
];

for (const { from, to, ext } of jobs) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) {
    console.warn(`[copy-assets] missing source: ${from}`);
    continue;
  }
  mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const file of readdirSync(src)) {
    if (!file.endsWith(ext)) continue;
    copyFileSync(join(src, file), join(dst, file));
    n++;
  }
  console.log(`[copy-assets] ${n} ${ext} -> ${to}`);
}
