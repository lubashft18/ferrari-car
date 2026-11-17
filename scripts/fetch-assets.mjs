import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Pin the renderer, loaders, decoder and example assets to the same release.
const source = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/';
const files = {
  'vendor/three.module.js': 'build/three.module.js',
  'vendor/addons/loaders/GLTFLoader.js': 'examples/jsm/loaders/GLTFLoader.js',
  'vendor/addons/loaders/DRACOLoader.js': 'examples/jsm/loaders/DRACOLoader.js',
  'vendor/addons/loaders/RGBELoader.js': 'examples/jsm/loaders/RGBELoader.js',
  'vendor/addons/utils/BufferGeometryUtils.js': 'examples/jsm/utils/BufferGeometryUtils.js',
  'vendor/addons/controls/OrbitControls.js': 'examples/jsm/controls/OrbitControls.js',
  'vendor/draco/draco_wasm_wrapper.js': 'examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',
  'vendor/draco/draco_decoder.wasm': 'examples/jsm/libs/draco/gltf/draco_decoder.wasm',
  'vendor/draco/draco_decoder.js': 'examples/jsm/libs/draco/gltf/draco_decoder.js',
  'vendor/THREE-LICENSE.txt': 'LICENSE',
  'assets/ferrari.glb': 'examples/models/gltf/ferrari.glb',
  'assets/ferrari_ao.png': 'examples/models/gltf/ferrari_ao.png',
  'assets/venice_sunset_1k.hdr': 'examples/textures/equirectangular/venice_sunset_1k.hdr',
};

const results = await Promise.allSettled(Object.entries(files).map(async ([local, remote]) => {
  const response = await fetch(source + remote);
  if (!response.ok) throw new Error(`${local}: HTTP ${response.status}`);
  const path = resolve(local);
  await mkdir(dirname(path), { recursive: true });
  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(path, data);
  console.log(`${local} (${data.length.toLocaleString()} bytes)`);
}));
const failed = results.filter(result => result.status === 'rejected');
for (const result of failed) console.error(result.reason.message);
if (failed.length) process.exitCode = 1;
