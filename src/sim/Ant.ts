import { AntKind, AntKindType, Cell, DIRS, SimConfig } from './constants';
import type { DiffusingField } from './DiffusingField';
import { Rng } from './Rng';
import type { World } from './World';

export const AntState = {
  SEARCHING: 0,
  RETURNING: 1,
} as const;
export type AntStateType = (typeof AntState)[keyof typeof AntState];

/**
 * How much an ant likes a step that changes its elevation by `dh`.
 *
 * Flat ground returns exactly 1, so multiplying a movement weight by this on a
 * world with no relief leaves the weight — and therefore every RNG draw that
 * follows — bit-for-bit unchanged.
 */
function slopeFactor(dh: number): number {
  const cfg = SimConfig.terrain;
  if (dh <= 0) return 1 + cfg.downhillGain * -dh;
  return 1 / (1 + cfg.uphillCost * dh);
}

/**
 * A single ant. Pure agent logic operating on the {@link World}: it follows
 * pheromone gradients, picks up food, returns it to the nest, and digs through
 * dirt when boxed in. Rendering lives entirely in the renderer.
 */
export class Ant {
  x: number;
  y: number;
  nestX: number;
  nestY: number;
  kind: AntKindType;
  /** Lizards eat ants; shared prey flag rather than a lizard×ant special case. */
  prey = true;
  state: AntStateType = AntState.SEARCHING;
  carrying = false;
  dir: number;
  energy = 1.0;
  alive = true;
  stuckTimer = 0;
  digCooldown = 0;
  returnTicks = 0;
  /** Holding a pellet of excavated soil, on its way to the surface. */
  soil = false;
  /** Ticks the current pellet has been held — a pellet carried too long is scattered. */
  soilTicks = 0;
  /** This ant's own Rng stream — independent of the world's, per AntGame's per-ant seeding. */
  rng: Rng;
  /** Sum of turning (in eighth-turns) since the last pickup/delivery — a lost-ant signal. */
  cumulativeTurn = 0;

  constructor(
    x: number,
    y: number,
    nestX: number,
    nestY: number,
    rngSeed: number,
    kind: AntKindType = AntKind.HARVESTER,
  ) {
    this.x = x;
    this.y = y;
    this.nestX = nestX;
    this.nestY = nestY;
    this.kind = kind;
    this.rng = new Rng(rngSeed);
    this.dir = this.rng.int(8);
  }

  get nestCell(): number {
    return this.kind === AntKind.FIRE ? Cell.FIRE_NEST : Cell.NEST;
  }

  private homeTrail(world: World): DiffusingField {
    return this.kind === AntKind.FIRE ? world.fireHomeField : world.homeField;
  }

  private foodTrail(world: World): DiffusingField {
    return this.kind === AntKind.FIRE ? world.fireFoodField : world.foodField;
  }

  update(world: World): void {
    if (!this.alive) return;

    this.energy -= SimConfig.ant.energyDrainPerTick;
    if (this.energy <= 0) {
      this.alive = false;
      return;
    }
    if (this.digCooldown > 0) this.digCooldown--;

    if (world.get(this.x, this.y) === Cell.WATER) {
      this.alive = false;
      return;
    }

    if (this.soil) this.carrySoil(world);

    if (this.state === AntState.SEARCHING) {
      this.search(world);
    } else {
      this.returnToNest(world);
    }
  }

  private search(world: World): void {
    const i = world.idx(this.x, this.y);
    this.homeTrail(world).deposit(this.x, this.y, SimConfig.pheromone.exploreDeposit);

    if (world.cells[i] === this.nestCell) {
      this.restAtNest(world);
      this.excavateBelow();
    }

    if (world.cells[i] === Cell.FOOD && world.foodAmount[i] > 0.05) {
      world.foodAmount[i] -= 0.1;
      if (world.foodAmount[i] <= 0.05) {
        world.cells[i] = Cell.DIRT;
        world.foodAmount[i] = 0;
      }
      this.carrying = true;
      this.state = AntState.RETURNING;
      this.returnTicks = 0;
      this.cumulativeTurn = 0;
      this.energy = Math.min(this.energy + SimConfig.ant.foodEnergyGain, 1.0);
      this.dir = (this.dir + 4) % 8;
      return;
    }

    this.moveAlongGradient(world, this.foodTrail(world), true);
  }

  private returnToNest(world: World): void {
    const i = world.idx(this.x, this.y);
    this.foodTrail(world).deposit(this.x, this.y, SimConfig.pheromone.foodDeposit);
    this.returnTicks++;

    if (world.cells[i] === this.nestCell) {
      this.carrying = false;
      this.state = AntState.SEARCHING;
      this.returnTicks = 0;
      this.cumulativeTurn = 0;
      this.energy = Math.min(this.energy + SimConfig.ant.nestEnergyGain, 1.0);
      if (this.kind === AntKind.FIRE) {
        world.fireNestFoodStore += 0.1;
        world.fireFoodDelivered += 0.1;
      } else {
        world.nestFoodStore += 0.1;
        world.foodDelivered += 0.1;
      }
      this.dir = (this.dir + 4) % 8;
      return;
    }

    if (this.returnTicks >= SimConfig.ant.giveUpReturnTicks) {
      this.carrying = false;
      this.state = AntState.SEARCHING;
      this.returnTicks = 0;
      this.cumulativeTurn = 0;
      this.dir = (this.dir + 4) % 8;
      return;
    }

    this.moveAlongGradient(world, this.homeTrail(world), false);
  }

  private moveAlongGradient(
    world: World,
    field: DiffusingField,
    isSearching: boolean,
  ): void {
    // Lost-ant recovery: too much back-and-forth turning without a pickup/delivery
    // to show for it means this ant is looping, not making progress. Snap it to a
    // fresh random heading and give it a tick to settle before it resumes sensing.
    if (this.cumulativeTurn >= SimConfig.ant.abortTurnThreshold) {
      this.cumulativeTurn = 0;
      this.dir = this.rng.int(8);
      this.stuckTimer = 0;
      return;
    }

    const candidates: { idx: number; nx: number; ny: number; weight: number }[] = [];
    const height = world.heightMap;
    const hHere = height[world.idx(this.x, this.y)];

    for (let dirIdx = 0; dirIdx < 8; dirIdx++) {
      const d = DIRS[dirIdx];
      const nx = this.x + d.dx;
      const ny = this.y + d.dy;
      if (!world.isPassable(nx, ny)) continue;

      const ni = world.idx(nx, ny);
      const pheromone = field.getAt(ni);
      const dirDiff = Math.min(Math.abs(dirIdx - this.dir), 8 - Math.abs(dirIdx - this.dir));
      const forwardBias = dirDiff === 0 ? 4 : dirDiff === 1 ? 2.5 : dirDiff <= 2 ? 1 : 0.05;

      let targetPull = 0;
      const targetCell = world.cells[ni];
      if (isSearching && targetCell === Cell.FOOD) targetPull = 80;
      if (!isSearching && targetCell === this.nestCell) targetPull = 80;

      const weight =
        ((pheromone * 6 + 0.1) * forwardBias + targetPull) * slopeFactor(height[ni] - hHere);
      candidates.push({ idx: dirIdx, nx, ny, weight });
    }

    if (candidates.length === 0) {
      this.handleBlocked(world);
      return;
    }

    this.stuckTimer = 0;

    // Occasional opportunistic dig even when a path exists, to open shortcuts.
    if (this.digCooldown <= 0 && this.rng.chance(0.03)) {
      const d = DIRS[this.dir];
      const digX = this.x + d.dx;
      const digY = this.y + d.dy;
      if (world.isDiggable(digX, digY)) {
        world.dig(digX, digY);
        this.takeSoil();
        this.x = digX;
        this.y = digY;
        this.energy -= SimConfig.ant.digEnergyCost;
        this.digCooldown = 5;
        return;
      }
    }

    // Random exploration.
    if (this.rng.chance(0.1)) {
      const pick = candidates[this.rng.int(candidates.length)];
      this.moveTo(pick.nx, pick.ny, pick.idx);
      return;
    }

    // Weighted roulette toward stronger pheromone / targets.
    let totalWeight = 0;
    for (const c of candidates) totalWeight += c.weight;
    let r = this.rng.next() * totalWeight;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) {
        this.moveTo(c.nx, c.ny, c.idx);
        return;
      }
    }
    const last = candidates[candidates.length - 1];
    this.moveTo(last.nx, last.ny, last.idx);
  }

  /**
   * Standing on the mound, dig a little further down and surface with a pellet.
   *
   * Surface digging alone cannot build a mound — the neighbourhood runs out of
   * dirt. There is no bottom to the earth below the nest, so this is what keeps
   * the pile growing as long as there are ants to work it.
   */
  private excavateBelow(): void {
    if (this.carrying || this.soil) return;
    const cfg = SimConfig.mound;
    const chance =
      this.kind === AntKind.FIRE ? cfg.fireExcavateChance : cfg.harvesterExcavateChance;
    if (!this.rng.chance(chance)) return;
    this.energy -= SimConfig.ant.digEnergyCost;
    this.takeSoil();
  }

  /**
   * Take on a pellet of spoil from a cell just excavated. An ant with its jaws
   * full of food has nowhere to put it, so those digs produce no pellet.
   */
  private takeSoil(): void {
    if (this.carrying || this.soil) return;
    this.soil = true;
    this.soilTicks = 0;
  }

  /**
   * Move the held pellet one tick closer to being part of the mound.
   *
   * Fire ants dump theirs straight onto the mound, weighted toward the crown, so
   * the pile grows into a dome as it settles. Harvesters walk theirs out to the
   * rim of the clearing and scrape the disk they crossed flat on the way.
   */
  private carrySoil(world: World): void {
    const cfg = SimConfig.mound;
    this.soilTicks++;

    const dx = this.x - this.nestX;
    const dy = this.y - this.nestY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const fire = this.kind === AntKind.FIRE;
    const range = fire ? cfg.fireMoundRadius : cfg.harvesterDiskRadius + 1;

    if (dist > range) {
      // Still out in the field. Past a point the ant gives up on the trip home
      // and just scatters the pellet, leaving a faint spoil bump where it dug.
      if (this.soilTicks < cfg.soilCarryTicks) return;
      const base = fire ? cfg.fireDeposit : cfg.harvesterDeposit;
      world.dropSoil(this.x, this.y, base * cfg.spoilFraction);
      this.soil = false;
      this.soilTicks = 0;
      return;
    }

    if (fire) {
      const falloff = 1 - dist / (cfg.fireMoundRadius + 1);
      world.dropSoil(this.x, this.y, cfg.fireDeposit * falloff);
    } else {
      if (dist > 0.5) {
        const scale = cfg.harvesterDiskRadius / dist;
        const rx = Math.round(this.nestX + dx * scale);
        const ry = Math.round(this.nestY + dy * scale);
        if (world.heightAt(rx, ry) < cfg.harvesterRimMax) {
          world.dropSoil(rx, ry, cfg.harvesterDeposit);
        }
      }
      const here = world.heightAt(this.x, this.y);
      if (here > 0) world.raiseHeight(this.x, this.y, -Math.min(here, cfg.harvesterClear));
    }
    this.soil = false;
    this.soilTicks = 0;
  }

  /** Hungry searchers eat from the granary. Empty stores mean they keep starving. */
  private restAtNest(world: World): void {
    if (this.energy >= 0.55) return;
    const sip = SimConfig.ant.nestSip;
    const floor = SimConfig.colony.spawnMinStore;
    if (this.kind === AntKind.FIRE) {
      if (world.fireNestFoodStore < floor + sip) return;
      world.fireNestFoodStore -= sip;
    } else {
      if (world.nestFoodStore < floor + sip) return;
      world.nestFoodStore -= sip;
    }
    this.energy = Math.min(1, this.energy + sip * SimConfig.ant.nestSipEnergy);
  }

  private handleBlocked(world: World): void {
    if (this.digCooldown <= 0) {
      const d = DIRS[this.dir];
      const digX = this.x + d.dx;
      const digY = this.y + d.dy;
      if (world.isDiggable(digX, digY)) {
        world.dig(digX, digY);
        this.takeSoil();
        this.x = digX;
        this.y = digY;
        this.energy -= SimConfig.ant.digEnergyCost;
        this.digCooldown = 3;
        this.stuckTimer = 0;
        return;
      }
    }
    this.dir = (this.dir + 3 + this.rng.int(3)) % 8;
    this.stuckTimer++;
    if (this.stuckTimer > 10) {
      this.dir = this.rng.int(8);
      this.stuckTimer = 0;
    }
  }

  private moveTo(nx: number, ny: number, dirIdx: number): void {
    const turn = Math.min(Math.abs(dirIdx - this.dir), 8 - Math.abs(dirIdx - this.dir));
    // Decayed sum: a mostly-straight forager's turning stays low; an ant that keeps
    // reversing/oscillating in place outpaces the decay and trips the abort check.
    this.cumulativeTurn = this.cumulativeTurn * 0.97 + turn;
    this.x = nx;
    this.y = ny;
    this.dir = dirIdx;
  }
}
