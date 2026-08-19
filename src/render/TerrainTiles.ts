import { assetUrl, loadTexture } from './textures';

const TILE = 32;

export interface TileLayer {
  readonly size: number;
  /** RGBA row-major, opaque. */
  readonly rgba: Uint8Array;
}

/** Tileable terrain art sliced from Deposit/ → assets/. */
export class TerrainAtlas {
  readonly dirt: TileLayer[] = [];
  readonly grass: TileLayer[] = [];
  readonly water: TileLayer[] = [];
  readonly wall: TileLayer[] = [];

  static async load(): Promise<TerrainAtlas> {
    const atlas = new TerrainAtlas();
    for (const name of ['dirt-00', 'dirt-01', 'dirt-02']) {
      const layer = await loadTile(name);
      if (layer) atlas.dirt.push(layer);
    }
    for (const name of ['grass-00', 'grass-01']) {
      const layer = await loadTile(name);
      if (layer) atlas.grass.push(layer);
    }
    for (const name of ['water-00', 'water-01']) {
      const layer = await loadTile(name);
      if (layer) atlas.water.push(layer);
    }
    for (const name of ['wall-00', 'wall-01']) {
      const layer = await loadTile(name);
      if (layer) atlas.wall.push(layer);
    }
    return atlas;
  }

  get ready(): boolean {
    return this.dirt.length > 0;
  }

  /** Pick a variant from world coordinates — stable, not flickery. */
  pickVariant(x: number, y: number, count: number): number {
    if (count <= 1) return 0;
    return (x * 7 + y * 13 + (x ^ y) * 3) % count;
  }

  sample(layer: TileLayer, wx: number, wy: number): [number, number, number] {
    const s = layer.size;
    const tx = ((wx % s) + s) % s;
    const ty = ((wy % s) + s) % s;
    const i = (ty * s + tx) * 4;
    const rgba = layer.rgba;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
  }

  sampleSet(
    set: readonly TileLayer[],
    x: number,
    y: number,
  ): [number, number, number] {
    if (set.length === 0) return [130, 95, 60];
    const v = this.pickVariant(x, y, set.length);
    return this.sample(set[v], x, y);
  }
}

async function loadTile(stem: string): Promise<TileLayer | null> {
  const url = assetUrl(`${stem}.png`);
  if (!url) return null;
  const tex = await loadTexture(url);
  if (!tex) return null;

  // Pixi has already decoded the PNG; read pixels through a scratch canvas.
  const source = tex.source;
  const resource = source.resource as { width?: number; height?: number; source?: HTMLImageElement };
  const img = resource.source;
  if (!img) return null;

  const w = img.naturalWidth || TILE;
  const h = img.naturalHeight || TILE;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  return { size: w, rgba: new Uint8Array(data) };
}

/** Procedural fallback when tile PNGs are missing (tests, broken install). */
export function proceduralDirt(x: number, y: number, noise: number): [number, number, number] {
  const broad = Math.sin(x * 0.055) * 5 + Math.cos(y * 0.047) * 4 + Math.sin((x + y) * 0.021) * 3;
  return [
    145 + broad + noise * 0.45,
    119 + broad * 0.72 + noise * 0.35,
    75 + broad * 0.35 + (noise >> 2),
  ];
}

export function proceduralGrass(x: number, y: number, noise: number): [number, number, number] {
  const [r, g, b] = proceduralDirt(x, y, noise);
  return [r * 0.82 + 18, g * 1.05 + 28, b * 0.72 + 8];
}
