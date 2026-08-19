import { AntKind, Cell, DIRS, SimConfig } from './constants';
import type { Ant } from './Ant';
import type { World } from './World';

/**
 * Horned lizard: sits near strong food scent or a mound, flicks a sticky tongue
 * at nearby prey (prefers harvesters). No nest-homing vector — local samples only.
 */
export class Lizard {
  x: number;
  y: number;
  dir: number;
  energy = 1.0;
  alive = true;
  /** Remaining ticks of the tongue-feed pose. */
  eatingTicks = 0;
  tongueCooldown = 0;
  /** Remaining ticks of flee after ants swarm the lizard. */
  swarmTicks = 0;

  constructor(x: number, y: number, dir: number) {
    this.x = x;
    this.y = y;
    this.dir = dir;
  }

  update(world: World, ants: Ant[]): void {
    if (!this.alive) return;

    this.energy -= SimConfig.lizard.energyDrainPerTick;
    if (this.energy <= 0) {
      this.alive = false;
      return;
    }
    if (world.get(this.x, this.y) === Cell.WATER) {
      this.alive = false;
      return;
    }

    if (this.tongueCooldown > 0) this.tongueCooldown--;
    if (this.eatingTicks > 0) this.eatingTicks--;
    if (this.swarmTicks > 0) this.swarmTicks--;

    const nearby = this.nearbyAnts(ants, SimConfig.lizard.eatRadius);

    // Wikipedia: harvesters defend vigorously — a cluster of ants drives the lizard off.
    if (nearby.length >= SimConfig.lizard.swarmCount) {
      this.swarmTicks = 40;
      this.energy -= SimConfig.lizard.swarmDamage;
      this.flee(world, nearby);
      return;
    }

    if (this.eatingTicks > 0) return; // hold still while the tongue is out

    if (this.tongueCooldown <= 0) {
      const prey = this.pickPrey(nearby);
      if (prey) {
        prey.alive = false;
        this.eatingTicks = 16;
        this.tongueCooldown = SimConfig.lizard.tongueCooldown;
        this.energy = Math.min(this.energy + SimConfig.lizard.eatEnergyGain, 1.0);
        this.faceToward(prey.x, prey.y);
        return;
      }
    }

    // Sit-and-wait near a trail (food scent) or a mound — not omniscient pathfinding.
    const scent = world.foodField.get(this.x, this.y) + world.fireFoodField.get(this.x, this.y) * 0.4;
    const onMound = world.nestNearby(this.x, this.y, 2);
    if ((scent >= SimConfig.lizard.sitScent || onMound) && world.rng.chance(0.82)) {
      return;
    }

    if (world.tickCount % SimConfig.lizard.moveEveryTicks !== 0 && this.swarmTicks <= 0) {
      return;
    }

    this.wander(world);
  }

  private nearbyAnts(ants: Ant[], radius: number): Ant[] {
    const out: Ant[] = [];
    for (const a of ants) {
      if (!a.alive || !a.prey) continue;
      if (Math.max(Math.abs(a.x - this.x), Math.abs(a.y - this.y)) <= radius) out.push(a);
    }
    return out;
  }

  /** Prefer harvesters when both species are in tongue range. */
  private pickPrey(nearby: Ant[]): Ant | null {
    let harvester: Ant | null = null;
    let other: Ant | null = null;
    for (const a of nearby) {
      if (a.kind === AntKind.HARVESTER) {
        if (!harvester) harvester = a;
      } else if (!other) {
        other = a;
      }
    }
    return harvester ?? other;
  }

  private faceToward(tx: number, ty: number): void {
    const dx = Math.sign(tx - this.x);
    const dy = Math.sign(ty - this.y);
    for (let i = 0; i < 8; i++) {
      if (DIRS[i].dx === dx && DIRS[i].dy === dy) {
        this.dir = i;
        return;
      }
    }
  }

  private flee(world: World, nearby: Ant[]): void {
    let cx = 0;
    let cy = 0;
    for (const a of nearby) {
      cx += a.x;
      cy += a.y;
    }
    cx /= nearby.length;
    cy /= nearby.length;
    const awayX = this.x - Math.sign(cx - this.x);
    const awayY = this.y - Math.sign(cy - this.y);
    if (world.isPassable(awayX, awayY)) {
      this.faceToward(awayX, awayY);
      this.x = awayX;
      this.y = awayY;
      return;
    }
    this.wander(world);
  }

  /** Local gradient on prey scent (harvester food trail), plus wander. */
  private wander(world: World): void {
    const candidates: { idx: number; nx: number; ny: number; weight: number }[] = [];
    for (let dirIdx = 0; dirIdx < 8; dirIdx++) {
      const d = DIRS[dirIdx];
      const nx = this.x + d.dx;
      const ny = this.y + d.dy;
      if (!world.isPassable(nx, ny)) continue;
      const scent =
        world.foodField.get(nx, ny) + world.fireFoodField.get(nx, ny) * 0.4;
      const dirDiff = Math.min(Math.abs(dirIdx - this.dir), 8 - Math.abs(dirIdx - this.dir));
      const forwardBias = dirDiff === 0 ? 3 : dirDiff === 1 ? 2 : dirDiff <= 2 ? 1 : 0.15;
      const weight = (scent * 5 + 0.15) * forwardBias;
      candidates.push({ idx: dirIdx, nx, ny, weight });
    }
    if (candidates.length === 0) {
      this.dir = world.rng.int(8);
      return;
    }
    if (world.rng.chance(0.18)) {
      const pick = candidates[world.rng.int(candidates.length)];
      this.x = pick.nx;
      this.y = pick.ny;
      this.dir = pick.idx;
      return;
    }
    let total = 0;
    for (const c of candidates) total += c.weight;
    let r = world.rng.next() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) {
        this.x = c.nx;
        this.y = c.ny;
        this.dir = c.idx;
        return;
      }
    }
    const last = candidates[candidates.length - 1];
    this.x = last.nx;
    this.y = last.ny;
    this.dir = last.idx;
  }
}
