/**
 * Viewer — the three.js stage: the open models, the explode, the pick.
 *
 * Several models can be open at once, one per tab. Each keeps its own group
 * of parts, its explode, its selection and its camera; only the active one is
 * drawn. Switching tabs hides one group and shows another: nothing is read or
 * built again.
 *
 * Every mesh of a loaded file is re-parented under its model's group, keeping
 * its world transform, so a part's offset is a world offset whatever the depth
 * of the file's own hierarchy. The pure placement rules live in
 * `model/layers.ts`.
 *
 * The page owns the state (names, selection, hidden parts); the viewer only
 * draws what it is told and reports which part was clicked. `dispose()` stops
 * the render loop, the observers and the GPU buffers.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { computeLayers, explodedPosition, type Axis, type Vec3 } from '../model/layers';

export type ViewerPart = { mesh: THREE.Mesh; rawName: string };
export type ExplodeMode = 'layers' | 'radial';

type Placed = { mesh: THREE.Mesh; rest: Vec3; fromCenter: Vec3; offset: number };

type Model = {
  group: THREE.Group;
  placed: Placed[];
  axis: Axis;
  radius: number;
  layerCount: number;
  selected: number;
  explode: { f: number; mode: ExplodeMode };
  /** Where the camera was when this model was last left; null until then. */
  view: { position: THREE.Vector3; target: THREE.Vector3 } | null;
};

/** A click that moved more than this many pixels was a drag, not a pick. */
const CLICK_SLOP_PX = 4;
const HIGHLIGHT = 0x2a3f99;

function vec(v: THREE.Vector3): Vec3 { return [v.x, v.y, v.z]; }

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.001, 1000);
  private controls: OrbitControls;
  private models = new Map<string, Model>();
  private active: Model | null = null;
  private resize: ResizeObserver;
  private ray = new THREE.Raycaster();
  private downAt: { x: number; y: number } | null = null;

  constructor(private host: HTMLElement, private onPick: (index: number) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 5, 4);
    this.scene.add(sun);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.zoomToCursor = true;
    this.resize = new ResizeObserver(() => this.fitCanvas());
    this.resize.observe(host);
    this.fitCanvas();
    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);
    this.renderer.setAnimationLoop(() => { this.controls.update(); this.renderer.render(this.scene, this.camera); });
  }

  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }

  /** Number of layers found in the active model. */
  get layerCount(): number { return this.active?.layerCount ?? 0; }

  /**
   * Add a model under `id` and make it the active one. An id already in use
   * is replaced. Returns its parts in the order the page will index them.
   */
  addModel(id: string, object: THREE.Object3D): ViewerPart[] {
    this.removeModel(id);
    const group = new THREE.Group();
    this.scene.add(group);
    group.add(object);
    group.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    object.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    const raw = meshes.map(m => this.rawNameOf(m, group));
    // The name travels in userData too: a GLB round-trip through the cache
    // renames duplicate nodes (« X » becomes « X_1 »), and names and notes are
    // keyed on the name the file gave.
    meshes.forEach((m, i) => { m.userData.partName = raw[i]; });
    for (const m of meshes) group.attach(m);
    group.remove(object);

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 1e-6);
    const centers = meshes.map(m => vec(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())));
    const layers = computeLayers(centers, vec(size), radius);
    const placed = meshes.map((mesh, i) => {
      // Each part gets its own material, so highlighting one never lights its twins.
      mesh.material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone();
      const c = centers[i];
      return {
        mesh,
        rest: vec(mesh.position),
        fromCenter: [c[0] - center.x, c[1] - center.y, c[2] - center.z] as Vec3,
        offset: layers.offset[i],
      };
    });
    const model: Model = {
      group, placed, axis: layers.axis, radius, layerCount: layers.count,
      selected: -1, explode: { f: 0, mode: 'layers' }, view: null,
    };
    this.models.set(id, model);
    this.activate(model);
    return meshes.map((mesh, i) => ({ mesh, rawName: raw[i] }));
  }

  /** Show the model under `id`, with the camera where it was left. Unknown ids are ignored. */
  show(id: string) {
    const model = this.models.get(id);
    if (model && model !== this.active) this.activate(model);
  }

  /** Close one model and free its GPU buffers. */
  removeModel(id: string) {
    const model = this.models.get(id);
    if (!model) return;
    for (const p of model.placed) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.scene.remove(model.group);
    this.models.delete(id);
    if (this.active === model) this.active = null;
  }

  setExplode(f: number, mode: ExplodeMode) {
    const m = this.active;
    if (!m) return;
    m.explode = { f, mode };
    for (const p of m.placed) {
      const [x, y, z] = explodedPosition(p.rest, mode, f, { axis: m.axis, offset: p.offset }, p.fromCenter);
      p.mesh.position.set(x, y, z);
    }
  }

  /**
   * A model as a GLB (the one under `id`, or the one on screen), every part at
   * rest and under its own name, for the cache and for a detached window. The
   * explode is put back as it was afterwards.
   */
  async exportGlb(id?: string): Promise<ArrayBuffer> {
    const m = id ? this.models.get(id) ?? null : this.active;
    if (!m) throw new Error('no model');
    const { f, mode } = m.explode;
    for (const p of m.placed) p.mesh.position.set(p.rest[0], p.rest[1], p.rest[2]);
    try {
      const out = await new GLTFExporter().parseAsync(m.group, { binary: true });
      if (!(out instanceof ArrayBuffer)) throw new Error('GLTFExporter returned JSON');
      return out;
    } finally {
      if (this.models.has(this.idOf(m))) this.setExplodeOf(m, f, mode);
    }
  }

  select(index: number) {
    const m = this.active;
    if (!m) return;
    if (m.placed[m.selected]) this.paint(m, m.selected, false);
    m.selected = index;
    if (m.placed[index]) this.paint(m, index, true);
  }

  setVisible(visible: readonly boolean[]) {
    this.active?.placed.forEach((p, i) => { p.mesh.visible = visible[i] ?? true; });
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    for (const id of [...this.models.keys()]) this.removeModel(id);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private activate(model: Model) {
    const leaving = this.active;
    if (leaving) {
      leaving.view = { position: this.camera.position.clone(), target: this.controls.target.clone() };
      leaving.group.visible = false;
    }
    this.active = model;
    model.group.visible = true;
    if (model.view) {
      this.camera.position.copy(model.view.position);
      this.controls.target.copy(model.view.target);
      this.setClipping(model.radius);
    } else {
      this.frame(model);
    }
  }

  private idOf(model: Model): string {
    for (const [id, m] of this.models) if (m === model) return id;
    return '';
  }

  private setExplodeOf(m: Model, f: number, mode: ExplodeMode) {
    const active = this.active;
    this.active = m;
    this.setExplode(f, mode);
    this.active = active;
  }

  private rawNameOf(mesh: THREE.Mesh, group: THREE.Group): string {
    const kept = mesh.userData?.partName;
    if (typeof kept === 'string') return kept;
    if (mesh.name) return mesh.name;
    let o: THREE.Object3D | null = mesh.parent;
    while (o && o !== group) { if (o.name) return o.name; o = o.parent; }
    return '';
  }

  private paint(m: Model, index: number, on: boolean) {
    const mat = m.placed[index].mesh.material as THREE.MeshStandardMaterial;
    mat.emissive?.setHex(on ? HIGHLIGHT : 0x000000);
  }

  private frame(m: Model) {
    const box = new THREE.Box3().setFromObject(m.group);
    box.getCenter(this.controls.target);
    // Framed for the model fully open: the outer layers travel 0.8 radius each way.
    const d = m.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.6;
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0.6, 0.45, 0.75).normalize().multiplyScalar(d));
    this.setClipping(m.radius);
  }

  private setClipping(radius: number) {
    const d = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.6;
    this.camera.near = d / 1000;
    this.camera.far = d * 100;
    this.camera.updateProjectionMatrix();
  }

  private fitCanvas() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  private onDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY }; };

  private onUp = (e: PointerEvent) => {
    const m = this.active;
    if (!m || !this.downAt || Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > CLICK_SLOP_PX) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const shown = m.placed.filter(p => p.mesh.visible).map(p => p.mesh);
    const hit = this.ray.intersectObjects(shown, false)[0];
    this.onPick(hit ? m.placed.findIndex(p => p.mesh === hit.object) : -1);
  };
}
