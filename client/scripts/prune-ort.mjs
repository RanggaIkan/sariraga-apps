// Removes the onnxruntime .wasm that Vite also emits into dist/assets. The app loads the runtime from /ort/
// (see src/lib/detector.js), so this ~30 MB copy is never requested and only bloats the deployment.
import { readdirSync, rmSync } from 'node:fs';

for (const f of readdirSync('dist/assets')) {
  if (/^ort-wasm.*\.wasm$/.test(f)) rmSync(`dist/assets/${f}`);
}
