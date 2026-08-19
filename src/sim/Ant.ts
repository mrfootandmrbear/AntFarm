import {
  AntKind,
  AntKindType,
  Cell,
  DIRS,
  Layer,
  LayerType,
  SimConfig,
  Under,
} from './constants';
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
  /** Pellets of excavated soil being carried, up to `loadCapacity`. */
  soilLoad = 0;
  /** Ticks the current pellet has been held — a pellet carried too long is scattered. */
  soilTicks = 0;
  /** Surface or underground. The two layers share x/y but never see each other. */
  layer: LayerType = Layer.SURFACE;
  /** Ticks into the current underground shift. */
  shiftTicks = 0;
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

    if (this.layer === Layer.UNDERGROUND) {
      this.workBelow(world);
      return;
    }

    if (world.get(this.x, this.y) === Cell.WATER) {
      this.alive = false;
      return;
    }

    if (this.soilLoad > 0) this.carrySoil(world);

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
      // Going below ends the ant's turn: it must not also take a step up here,
      // or it surfaces its own body into solid earth away from the doorway.
      if (this.excavateBelow(world)) return;
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

  // ---------- below ground ----------

  /**
   * A shift underground: cut passage, then carry the spoil back up.
   *
   * There is no pathfinding down here either. The way out is simply "toward
   * shallower depth" — the per-cell depth the diggers wrote on their way in is
   * the only map an ant needs to find the door again.
   */
  private workBelow(world: World): void {
    this.shiftTicks++;
    const cfg = SimConfig.underground;
    const i = world.idx(this.x, this.y);

    // Lost down there: dig straight up and take the chances above. Better a
    // confused ant on the surface than one the player never sees again. The
    // solid-cell case is a broken world, not a normal one — the player erased
    // the nest out from under a working ant, or a save came back odd.
    if (world.underground[i] === Under.SOLID || this.shiftTicks >= cfg.abandonTicks) {
      world.carve(i, Under.ENTRANCE, 0, this.kind === AntKind.FIRE ? 2 : 1);
      this.surface();
      return;
    }

    if (world.underground[i] === Under.ENTRANCE) {
      // At the door. Ants come up with a full load, or when the shift is over.
      if (this.soilLoad >= cfg.loadCapacity || this.shiftTicks >= cfg.shiftTicks) {
        this.surface();
        return;
      }
    }

    // Loaded, or out of shift: head for shallower ground. Otherwise, keep working.
    if (this.soilLoad >= cfg.loadCapacity || this.shiftTicks >= cfg.shiftTicks) {
      this.moveThroughTunnels(world, true);
      return;
    }

    // Nobody quarries their own front door. An ant walks in past the entrance
    // works before it starts cutting — either as deep as the working face, or
    // far enough in that widening the place is worth doing. That is what makes
    // a shift a journey rather than a scratch at the doorstep, and what puts
    // ants in the tunnels for the player to watch.
    const here = world.tunnelDepth[i];
    let deeper = false;
    let works = false;
    for (let d = 0; d < 8; d++) {
      const nx = this.x + DIRS[d].dx;
      const ny = this.y + DIRS[d].dy;
      if (!world.isPassage(nx, ny)) continue;
      const ni = world.idx(nx, ny);
      if (world.tunnelDepth[ni] > here) deeper = true;
      if (world.underground[ni] !== Under.ENTRANCE) works = true;
    }

    const canDig =
      world.underground[i] === Under.ENTRANCE
        ? // A doorway is only cut from when there is nothing to walk into yet.
          // That is how a colony's first shafts get started, and once they ring
          // the mound the door is a door again.
          !works
        : !deeper || here >= cfg.workDepth;

    const digChance =
      this.kind === AntKind.FIRE ? cfg.fireDigChance : cfg.harvesterDigChance;
    if (canDig && this.rng.chance(digChance) && this.digTunnel(world)) return;
    this.moveThroughTunnels(world, false);
  }

  /** Drop into the nest through the doorway the ant is standing on. */
  private descend(): void {
    this.layer = Layer.UNDERGROUND;
    this.shiftTicks = 0;
    // Out of reach of anything hunting on the surface.
    this.prey = false;
  }

  private surface(): void {
    this.layer = Layer.SURFACE;
    this.shiftTicks = 0;
    this.prey = true;
  }

  /**
   * Cut one cell of new passage.
   *
   * Fire ants work outward from wherever they are in any direction, so the
   * network grows as an irregular sponge. Depth wanders but trends downward.
   * Returns false when there is nothing worth cutting from here.
   */
  private digTunnel(world: World): boolean {
    const cfg = SimConfig.underground;
    const here = world.idx(this.x, this.y);
    const depthHere = world.tunnelDepth[here];

    const start = this.rng.int(8);
    for (let n = 0; n < 8; n++) {
      const dirIdx = (start + n) % 8;
      const d = DIRS[dirIdx];
      const nx = this.x + d.dx;
      const ny = this.y + d.dy;
      if (!world.inBounds(nx, ny)) continue;
      const ni = world.idx(nx, ny);
      if (world.underground[ni] !== Under.SOLID) continue;
      // A colony's works stay its colony's works, and stay near its own mound.
      const spread = Math.max(Math.abs(nx - this.nestX), Math.abs(ny - this.nestY));
      if (spread > cfg.maxSpread) continue;

      const depth = Math.min(cfg.maxDepth, depthHere + cfg.descendStep);
      world.carve(ni, Under.TUNNEL, depth, this.kind === AntKind.FIRE ? 2 : 1);
      this.promoteChamber(world, ni);
      this.energy -= cfg.digCost;
      this.takeSoil();
      this.x = nx;
      this.y = ny;
      this.dir = dirIdx;
      return true;
    }
    return false;
  }

  /**
   * A freshly cut cell surrounded by passage is not a tunnel any more, it is a
   * void — so it becomes a chamber. That is all fire-ant chambers are: the
   * places where an irregular sponge happens to have eaten itself hollow.
   */
  private promoteChamber(world: World, i: number): void {
    const cfg = SimConfig.underground;
    const x = i % world.width;
    const y = (i / world.width) | 0;
    let open = 0;
    for (let d = 0; d < 8; d++) {
      if (world.isPassage(x + DIRS[d].dx, y + DIRS[d].dy)) open++;
    }
    if (open >= cfg.fireChamberNeighbours) {
      world.underground[i] = Under.CHAMBER;
    }
  }

  /**
   * Step to a neighbouring passage cell.
   *
   * Going `up` is the ant's only way home, so it takes the strictly shallowest
   * neighbour — every cell was cut from a shallower parent, so following that
   * gradient always arrives at a doorway. Going down is deliberately looser: a
   * weighted pick among the deeper neighbours, so the works branch instead of
   * growing as one snake.
   */
  private moveThroughTunnels(world: World, up: boolean): void {
    const depth = world.tunnelDepth;
    const here = depth[world.idx(this.x, this.y)];

    if (up) {
      let best = -1;
      let bestScore = -Infinity;
      const start = this.rng.int(8);
      for (let n = 0; n < 8; n++) {
        const dirIdx = (start + n) % 8;
        const d = DIRS[dirIdx];
        if (!world.isPassage(this.x + d.dx, this.y + d.dy)) continue;
        const dz = depth[world.idx(this.x + d.dx, this.y + d.dy)] - here;
        const dirDiff = Math.min(Math.abs(dirIdx - this.dir), 8 - Math.abs(dirIdx - this.dir));
        const score = -dz + (dirDiff <= 1 ? 0.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = dirIdx;
        }
      }
      this.stepTunnel(best);
      return;
    }

    const candidates: { idx: number; weight: number }[] = [];
    let total = 0;
    for (let dirIdx = 0; dirIdx < 8; dirIdx++) {
      const d = DIRS[dirIdx];
      if (!world.isPassage(this.x + d.dx, this.y + d.dy)) continue;
      const dz = depth[world.idx(this.x + d.dx, this.y + d.dy)] - here;
      const dirDiff = Math.min(Math.abs(dirIdx - this.dir), 8 - Math.abs(dirIdx - this.dir));
      const forwardBias = dirDiff === 0 ? 3 : dirDiff === 1 ? 2 : dirDiff <= 2 ? 1 : 0.2;
      const weight = (dz > 0 ? 3 + dz * 0.1 : 0.4) * forwardBias;
      candidates.push({ idx: dirIdx, weight });
      total += weight;
    }
    if (candidates.length === 0) {
      this.dir = this.rng.int(8);
      return;
    }
    let r = this.rng.next() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) {
        this.stepTunnel(c.idx);
        return;
      }
    }
    this.stepTunnel(candidates[candidates.length - 1].idx);
  }

  private stepTunnel(dirIdx: number): void {
    if (dirIdx < 0) {
      this.dir = this.rng.int(8);
      return;
    }
    this.x += DIRS[dirIdx].dx;
    this.y += DIRS[dirIdx].dy;
    this.dir = dirIdx;
  }

  /**
   * Standing on the mound, take the doorway down and work a shift below.
   *
   * Surface digging alone cannot build a mound — the neighbourhood runs out of
   * dirt. Every pellet that raises the ground comes from a cell of tunnel
   * actually cut underneath it, which is why the mound and the nest grow together.
   */
  private excavateBelow(world: World): boolean {
    if (this.carrying || this.soilLoad > 0) return false;
    if (world.under(this.x, this.y) === Under.SOLID) return false;
    const cfg = SimConfig.underground;
    const chance =
      this.kind === AntKind.FIRE ? cfg.fireDescendChance : cfg.harvesterDescendChance;
    if (!this.rng.chance(chance)) return false;
    this.descend();
    return true;
  }

  /**
   * Take on a pellet of spoil from a cell just excavated. An ant with its jaws
   * full of food has nowhere to put it, so those digs produce no pellet.
   */
  private takeSoil(): void {
    if (this.carrying || this.soilLoad >= SimConfig.underground.loadCapacity) return;
    this.soilLoad++;
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
      world.dropSoil(this.x, this.y, base * cfg.spoilFraction * this.soilLoad);
      this.soilLoad = 0;
      this.soilTicks = 0;
      return;
    }

    if (fire) {
      const falloff = 1 - dist / (cfg.fireMoundRadius + 1);
      world.dropSoil(this.x, this.y, cfg.fireDeposit * falloff * this.soilLoad);
    } else {
      if (dist > 0.5) {
        const scale = cfg.harvesterDiskRadius / dist;
        const rx = Math.round(this.nestX + dx * scale);
        const ry = Math.round(this.nestY + dy * scale);
        if (world.heightAt(rx, ry) < cfg.harvesterRimMax) {
          world.dropSoil(rx, ry, cfg.harvesterDeposit * this.soilLoad);
        }
      }
      const here = world.heightAt(this.x, this.y);
      if (here > 0) world.raiseHeight(this.x, this.y, -Math.min(here, cfg.harvesterClear));
    }
    this.soilLoad = 0;
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
