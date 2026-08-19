# AntFarm — agent north-star

**AntFarm is a falling-sand game for living systems: build a tiny world, fill it with life, and see what happens.**

This file is binding for every agent. The player-facing idea is the ChatGPT north-star. The technical calls below override that document where they disagree.

## Core idea

AntFarm is a falling-sand game where animals and ecological systems are the particles.

The player gets a small 2D diorama and a palette: terrain, walls/rocks, water, food, nests, ants (later: plants, predators, environmental effects). They paint these into the world.

They do not program behaviors, issue orders, manage an economy, or complete objectives. Every thing placed already knows how to behave.

**PLACE → WATCH → INTERFERE → WATCH**

The player creates circumstances. The simulation determines what happens.

Simple enough for a child; rich enough that an adult can leave a world running for hours and come back to meaningful change. A toy, not scientific software. Think: falling-sand + SimAnt + TABS-style experimentation + a digital terrarium.

## Design principles

1. **Simulation, not scripted outcomes.** Individual components follow simple local rules. Colony trails emerge; ants do not calculate an omniscient shortest path.
2. **The world must have memory.** Actions leave temporary or persistent consequences. The long-term question is “What happened while I was gone?”
3. **Shared world state.** Organisms interact through reusable properties and fields, not pairwise special cases. Do not start a generalized ecosystem engine tonight.
4. **Simulation Legos.** Fields, terrain, agents, behaviors are engine concepts. The player sees ANT, FOOD, WATER, ROCK. An Ant is a configuration of reusable pieces — eventually. Tonight an `Ant` class plus `DiffusingField` is enough.
5. **Fields are first-class.** `deposit / sample / diffuse / decay`. Trails must emerge. Reuse the same field abstraction later for moisture, temperature, smell, nutrients.
6. **Simulation and rendering are separate.** The sim is authoritative and must run headlessly. TypeScript + PixiJS. No custom WebGPU renderer. No workers/WASM unless profiling later demands it.
7. **Visual legibility over literal realism.** Illustrated diorama, mostly from above. Pheromone is soft vapor/haze, not painted roads or glowing lines.
8. **Child-usable interface.** No engine terminology in the UI (`Agent`, `ScalarField`, `GradientFollower`, `Diffusion`, “food field / home field”).

## Tuner objective (binding)

**Do not optimize for fastest food delivery. Optimize for legible emergence.**

The player is watching: exploration → discovery → recruitment → establishment → disruption → reorganization. A little inefficiency is desirable. A conveyor-belt colony that instantly locks onto a route is a **failed** run even if delivery is high.

## Technical calls (override the north-star where they conflict)

- **Two pheromone fields, not nest-homing.** `World.homeField` (searching ants deposit) and `World.foodField` (returning ants deposit). Searching follows `foodField`; returning follows `homeField`. Do **not** add A* or a homing vector to nest XY.
- **Asymmetric deposit.** Returning ants deposit substantially more on `foodField`. Searching ants deposit a small amount on `homeField`.
- **Seeded RNG** in the simulation (`World.rng`). `Math.random` is allowed only for renderer cosmetic noise.
- **No ECS overnight.** No new organisms (spiders, plants, …). No temperature/moisture/organic-matter cycle. No pairwise interaction matrix.
- **Eval obstacle uses rock** (`Cell.WALL`), not diggable dirt.

## Success kinds

All four scenarios are informative. Look work may start only when **CORE** is PASS. KEEP a param change only if ADAPTATION and MEMORY did not regress.

**CORE BEHAVIOR**

- Food discovered
- Food delivered
- Trail emerges (visible recruitment after a period of wander — not instant lock-in)

**ADAPTATION**

- Rock interrupts an established route
- Colony establishes an alternate route
- No global pathfinding

**MEMORY / FORGETTING**

- Old trail persists temporarily
- Unreinforced trail decays
- Colony resumes exploration

That is **discover → reinforce → adapt → forget.** A ridiculously persistent trail that aces CORE while failing MEMORY is REJECT.

## Overnight do-not-touch

- No WebGPU, workers, WASM, custom renderer
- No spiders, plants, temperature, moisture, organic-matter cycle
- No ECS / generic behavior graph
- No pairwise interaction matrix
- No engine terms in the player UI
- No million-agent optimization
- Do not edit original PNGs in `Deposit/`

## File ownership

| Area | Owns | Must not touch |
|------|------|----------------|
| Sim tuner | `src/sim/` params, deposits, movement weights, PRNG | Renderer, UI copy, new entity types |
| Eval | `src/eval/`, `npm run eval` | Rewarding speed or immortal trails |
| Look | `src/render/`, slice `Deposit/` → `assets/`, CSS | Ant decision logic; original Deposit PNGs |
| UI | `src/ui/`, `index.html`, `src/style.css` | Sim tick |
| Conductor | `OVERNIGHT.md`, dispatch | Feature coding except tiny glue |

Sprite source (do not edit):

- `Deposit/40c38bd6-50d8-48e0-a292-5c68bf3a379c.png`
- `Deposit/0f528cd3-32a6-4ce1-976b-7f9a597af96d.png`
- `Deposit/horned-lizard-fire-ants.png`

Prefer **top-down** walk and carry frames. Side-view cycles, exploded parts, and antenna-duels stay unused unless a later pass needs them.

## Commands

```bash
npm run eval
npm run typecheck
npm run dev
```

## Long-term (not tonight)

The same primitives should later support ant farm, backyard, forest floor, pond, tide pool. Do not build those now. Design so adding them later does not require replacing the architecture.

North star: a tool for making tiny autonomous worlds. Ideal reaction: “I wonder what happens if I put this here.” Later: “Whoa. Look what happened.”
