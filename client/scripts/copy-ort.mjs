// Copies the onnxruntime-web runtime (.mjs + .wasm) to public/ort before build, served as-is from our own origin.
// Needed for multi-threaded WASM: ORT starts its worker threads from this .mjs file.
import { cpSync, mkdirSync } from 'node:fs';

const src = 'node_modules/onnxruntime-web/dist';
mkdirSync('public/ort', { recursive: true });
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  cpSync(`${src}/${f}`, `public/ort/${f}`);
}
