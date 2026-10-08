/**
 * load.ts — a file the person brings, turned into three.js meshes.
 *
 * GLB / glTF, OBJ and STL go through the three.js loaders. STEP goes through
 * occt-import-js in a worker (`public/occt-worker.js`): a 21 MB STEP takes
 * about 20 s to read, and on the main thread the page would freeze for all of
 * it. The worker is ended on every path, success, failure or timeout.
 *
 * Every failure carries a strings key, so the panel says WHY in the person's
 * language instead of drawing nothing.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetUrl } from '../asset-url';
import type { Key } from '../i18n/strings';

/** A STEP read that has not answered in this long is stopped. */
export const STEP_TIMEOUT_MS = 5 * 60_000;

export class LoadError extends Error {
  constructor(readonly key: Key, readonly vars: Record<string, string | number> = {}) {
    super(key);
  }
}

export const FORMATS = ['glb', 'gltf', 'obj', 'stl', 'step', 'stp'] as const;

/** Formats slow enough to read that their parts are cached (`model/cache.ts`). */
export function isSlowFormat(fileName: string): boolean {
  const ext = extOf(fileName);
  return ext === 'step' || ext === 'stp';
}

export function extOf(fileName: string): string {
  return (fileName.split('?')[0].split('.').pop() || '').toLowerCase();
}

export async function loadModel(buf: ArrayBuffer, fileName: string, onTick: (seconds: number) => void): Promise<THREE.Object3D> {
  const ext = extOf(fileName);
  try {
    if (ext === 'glb' || ext === 'gltf') return await readGltf(buf);
    if (ext === 'obj') return new OBJLoader().parse(new TextDecoder().decode(buf));
    if (ext === 'stl') {
      const mesh = new THREE.Mesh(new STLLoader().parse(buf), new THREE.MeshStandardMaterial({ color: 0xb8c0cc }));
      mesh.name = fileName;
      return mesh;
    }
    if (ext === 'step' || ext === 'stp') return await readStep(buf, onTick);
  } catch (e) {
    if (e instanceof LoadError) throw e;
    // A .gltf whose buffers live in separate files: a dropped file has no folder to look in.
    if (ext === 'gltf') throw new LoadError('err.gltfExternal');
    throw new LoadError('err.read', { why: (e as Error).message || String(e) });
  }
  throw new LoadError('err.format', { ext });
}

async function readGltf(buf: ArrayBuffer): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(assetUrl('vendor/draco/'));
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  try {
    return (await loader.parseAsync(buf, '')).scene;
  } finally {
    draco.dispose();
  }
}

type OcctMesh = { name?: string; color?: number[]; attributes: { position: { array: number[] }; normal?: { array: number[] } }; index: { array: number[] } };
type OcctNode = { name?: string; meshes: number[]; children: OcctNode[] };
type OcctResult = { success: boolean; root: OcctNode; meshes: OcctMesh[] };

function readStepInWorker(buf: ArrayBuffer, onTick: (seconds: number) => void): Promise<OcctResult> {
  const worker = new Worker(assetUrl('occt-worker.js'));
  const started = performance.now();
  const tick = setInterval(() => onTick(Math.round((performance.now() - started) / 1000)), 500);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<OcctResult>((resolve, reject) => {
    timer = setTimeout(() => reject(new LoadError('err.timeout', { minutes: STEP_TIMEOUT_MS / 60_000 })), STEP_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: OcctResult; error?: string }>) => {
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new LoadError('err.read', { why: e.data.error || 'occt-import-js' }));
    };
    worker.onerror = (e) => reject(new LoadError('err.read', { why: e.message || 'worker' }));
    worker.postMessage(buf, [buf]);
  }).finally(() => {
    clearTimeout(timer);
    clearInterval(tick);
    worker.terminate();
  });
}

async function readStep(buf: ArrayBuffer, onTick: (seconds: number) => void): Promise<THREE.Object3D> {
  const result = await readStepInWorker(buf, onTick);
  if (!result.success) throw new LoadError('err.read', { why: 'STEP' });
  const group = new THREE.Group();
  // A solid's own name wins; an unnamed solid takes the name of the node holding it.
  const walk = (node: OcctNode, inherited: string) => {
    const here = node.name || inherited;
    for (const i of node.meshes) {
      const m = result.meshes[i];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
      else geo.computeVertexNormals();
      geo.setIndex(m.index.array);
      const color = m.color ? new THREE.Color(m.color[0], m.color[1], m.color[2]) : new THREE.Color(0xb8c0cc);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.6 }));
      mesh.name = m.name || here;
      group.add(mesh);
    }
    for (const c of node.children) walk(c, here);
  };
  walk(result.root, '');
  return group;
}
