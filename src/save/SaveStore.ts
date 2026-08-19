/**
 * The browser side of saving: one world lives under one localStorage key.
 *
 * Kept apart from {@link Snapshot} so the serializer stays usable anywhere,
 * including headlessly. Everything here degrades quietly — a browser with
 * storage disabled, a full quota, or a save from an older build should leave the
 * player with a working world, not an exception.
 */
import type { SimulationEngine } from '../sim/SimulationEngine';
import {
  applySnapshot,
  captureSnapshot,
  isWorldSnapshot,
  snapshotFitsEngine,
  type WorldSnapshot,
} from './Snapshot';

export const SAVE_KEY = 'antfarm.world.v1';

export interface SaveSummary {
  savedAt: number;
  tickCount: number;
  ants: number;
  lizards: number;
  width: number;
  height: number;
}

function storage(): Storage | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    // Safari in private mode exposes localStorage but throws on write.
    const probe = '__antfarm_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/** Read and validate the stored world, or null if there isn't a usable one. */
export function readSave(): WorldSnapshot | null {
  const ls = storage();
  if (!ls) return null;
  const text = ls.getItem(SAVE_KEY);
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isWorldSnapshot(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function summarize(snap: WorldSnapshot): SaveSummary {
  return {
    savedAt: snap.savedAt,
    tickCount: snap.tickCount,
    ants: snap.ants.length,
    lizards: snap.lizards.length,
    width: snap.width,
    height: snap.height,
  };
}

export function hasSave(): boolean {
  return readSave() !== null;
}

/** Write the engine's current state. Returns false if storage refused it. */
export function saveWorld(engine: SimulationEngine): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(SAVE_KEY, JSON.stringify(captureSnapshot(engine)));
    return true;
  } catch (err) {
    console.warn('AntFarm could not save the world:', err);
    return false;
  }
}

/** Restore a stored world into `engine`. Returns false if there was nothing to load. */
export function loadWorld(engine: SimulationEngine, snap?: WorldSnapshot | null): boolean {
  const stored = snap ?? readSave();
  if (!stored) return false;
  if (!snapshotFitsEngine(engine, stored)) {
    console.warn(
      `AntFarm save is ${stored.width}x${stored.height}; this world is ` +
        `${engine.world.width}x${engine.world.height}. Starting fresh.`,
    );
    return false;
  }
  try {
    applySnapshot(engine, stored);
    return true;
  } catch (err) {
    console.warn('AntFarm could not load the saved world:', err);
    return false;
  }
}

export function clearSave(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(SAVE_KEY);
  } catch {
    // nothing to do — the player just keeps the world they have
  }
}
