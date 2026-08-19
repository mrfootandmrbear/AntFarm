import { Assets, Texture } from 'pixi.js';

const assetUrls = import.meta.glob('../../assets/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function assetUrl(name: string): string | undefined {
  const hit = Object.entries(assetUrls).find(([k]) => k.endsWith(`/${name}`));
  return hit?.[1];
}

/** Every `prefix*.png` in assets/, in filename order — that is the frame order. */
export function sortedUrls(prefix: string): string[] {
  return Object.entries(assetUrls)
    .filter(([k]) => k.includes(`/${prefix}`) && k.endsWith('.png'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}

/** Missing art is not fatal — callers fall back to a drawn shape. */
export async function loadTexture(url: string | undefined): Promise<Texture | null> {
  if (!url) return null;
  try {
    return (await Assets.load(url)) as Texture;
  } catch {
    return null;
  }
}

export async function loadTextures(urls: string[]): Promise<Texture[]> {
  const out: Texture[] = [];
  for (const url of urls) {
    const tex = await loadTexture(url);
    if (tex) out.push(tex);
  }
  return out;
}

/** Load a named animation, or an empty array if none of its frames exist. */
export async function loadFrames(prefix: string): Promise<Texture[]> {
  return loadTextures(sortedUrls(prefix));
}
