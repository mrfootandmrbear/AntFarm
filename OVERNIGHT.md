# Overnight experiment log

Not an activity log. Each entry is a seed, metrics, a single change, an observation, and KEEP or REJECT.

Tuner objective: **legible emergence, not fastest food delivery.**

Look work may start only after CORE PASS. KEEP a param change only if ADAPTATION and MEMORY did not regress. Stop a workstream after two consecutive regressions.

## Status

- CORE: PASS (seed 1842; 4/5 of {1842,7,99,1,42})
- ADAPTATION: PASS
- MEMORY: PASS
- PULSE (E10/E11-lite): PASS — food grows the mound to cap; no food starves it
- RELOCATE (E07): PASS
- LIZARD / MULTI / CHOKE / SOAK: PASS on {1842,7,99,1,42}
- FIRE: PASS 4/5 of {1842,7,99,1,42} (99 is the outlier)
- Terrain: height map + surface depth-shading + sculpt brush (Phase 1); mound
  formation from real dig volume, not a flat roll (Phase 2)
- Underground: cell-associated grid (SOLID/TUNNEL/CHAMBER/ENTRANCE, depth,
  owner) with shift-based descend/dig/surface behavior (Phase 3). U-key
  museum cross-section view renders it — surface peeled away, tunnels/
  chambers colored by owner and shaded by depth, surface and underground
  ants no longer double-render on each other's layer (Phase 4).
- Ant size asymmetry (harvester large/individual, fire ant tiny/swarm) is
  already there via per-species sprite scale — Phase 6 reads as done without
  a dedicated pass.
- Still open: Phase 5 (harvester helical shaft + stratified chambers + seed
  wave — right now both species dig the same random-branch-with-density-
  chamber algorithm, just at different rates) and Phase 7 (flood response /
  raft formation).
- Look: vapor on by default, top-down walk/carry from Deposit, Scent/Erase/transport copy
- Persistence: localStorage save/load, auto-save every 500 ticks
- CI: GitHub Actions runs typecheck + eval on every push to main
- Consecutive regressions: 0
- Typecheck: clean
- `npm run eval`: exit 0 (~39s; `--skip-soak` for a ~15s loop)

GREEN
single colony food gathering
pheromone decay
wall adaptation
nest reserves → hatch / starve
world survives a page reload
multiple food sources (E12)
chokepoint traffic (E13)
100k-tick soak (E09)
fire-ant rivalry, lizard predation (gated)

YELLOW
food relocation (E07) PASS on 1842 — old corridor still heavy
default 40-ant scene grows slowly
fire ants annihilate rather than displace — harvesters hit 0 by ~40k ticks
  on a shared pile, and swarm defense never fires

RED
two-colony evals beyond E_FIRE (E14–E15)
predator evals beyond E_LIZARD (E16–E20)

## Morning brief

Can simple local rules produce an ant colony that is interesting to disturb and watch recover?

On seed 1842: yes. Wander ~220 ticks, recruit ~700, one delivery closes the loop without conveyor lock-in. A rock wall across the corridor sends traffic through a northern gap and foraging resumes. Unreinforced food scent fades (~83%) and searchers spread out.

Leaving the world running now does something: a fed mound hatches up to the cap and stocks a granary; an empty mound starves. And leaving is safe — the world saves itself every 500 ticks and asks whether to continue it when you come back. Play it with `npm run dev`. Scent is on.

## Entries

### 22:55 — Seed 1842

Trail formation: PASS
First discovery: 222 ticks
Stable recruitment: 705 ticks
Food delivered: 0.2%
Wall adaptation: PASS
Old-trail decay: 82.9%

Changed:
exploreDeposit 1.0 (shared) → 0.28
foodDeposit 1.0 (shared) → 0.85
evaporation 0.993 → 0.990
diffusion 0.015 → 0.02
giveUpReturnTicks added at 1800
seeded RNG (mulberry32)

Observation:
Wander before first find (~222 ticks), then recruitment around 700
without instant lock-in. One delivery closes the loop during CORE.
Rock wall forces a northern gap detour; colony resumes foraging
through it. Unreinforced food scent fades (~83%) and searchers spread.

Decision:
KEEP

Other seeds 7, 99, 42 also CORE+ADAPT+MEMORY PASS. Seed 1 discovered
and recruited but did not deliver during the CORE window (still adapted
after the wall). Not overfitting to 1842; canonical gate is 1842.

### 23:10 — look pass (no sim change)

Trail formation: PASS (eval unchanged)
Wall adaptation: PASS
Old-trail decay: 82.9%

Changed:
sliced Deposit sheets → assets/ant-walk-*, ant-carry-*, food, nest, rock
pheromone cell-tint → soft combined vapor (Scent: On by default)
UI: Erase, Bugs, Scent on/off (no food-field/home-field labels)

Observation:
Renderer still only reads sim state. Typecheck and eval still green.

Decision:
KEEP


### 23:20 — competing fire ants + horned lizards

Trail formation: PASS (seed 1842 unchanged: discover 222, recruit 705)
Wall adaptation: PASS
Old-trail decay: 82.9%

Changed:
sliced Deposit/horned-lizard-fire-ants.png → lizard-walk/tongue, fire-ant-walk/carry, fire-nest
World.fireHomeField + fireFoodField (second colony trails)
Ant.kind HARVESTER|FIRE; Lizard sits on food scent / mounds, tongue-eats prey (prefer harvesters)
fire ants bump-displace harvesters (probabilistic); clustered harvesters can sting back
palette: Fire nest, Fire ant, Lizard — eval still spawns only harvesters

Observation:
Wikipedia: horned lizards sit near trails/mounds and flick a sticky tongue;
harvesters swarm a threat; fire ants raid/displace. Toy rules only — no pathfinding.

Decision:
KEEP

### 23:23 — Seed 1842

Trail formation: PASS
First discovery: 222 ticks
Stable recruitment: 705 ticks
Food delivered: 0.2%
Wall adaptation: PASS
Old-trail decay: 82.9%

Changed:
none (skipped)

Observation:
Same 1842 story as 22:55: wander ~222, recruit ~705, one delivery
closes the loop. Wall still forces the northern gap; unreinforced
food scent fades ~83% and searchers spread. Look (vapor, sprites,
fire ants, lizards) already in. A deposit/evaporation nudge would
push toward conveyor lock-in or the 90% “vanished immediately”
MEMORY fail. Colony is already watchable.

Decision:
KEEP


### 23:40 — Seed 1842 (nest metabolism)

Trail formation: PASS
First discovery: 222 ticks
Stable recruitment: 705 ticks
Food delivered: 0.2%
Wall adaptation: PASS (detour visits 2088)
Old-trail decay: 82.9%
Resume spread: 35.1 (was 29.2)

Hypothesis:
Searchers never ate from the mound, and hatch used the same counter eval treated as “food delivered.” A player who left the world running saw the colony shrink while seed piles were still on the ground.

Change:
Hungry searchers sip nest stores only above spawnMinStore (0.5); hatch costs 0.25 and requires that reserve. Cumulative `foodDelivered` is what eval scores. energyDrain 0.0001 → 0.00005.

Before:
20k default scene: 40 → 17 ants, store stuck ~0.20, food still abundant.
Pulse (100 ants, 22k): not measured; 40-ant distant pile 16k → 15 ants / 2.4 delivered.

After:
CORE/ADAPT/MEMORY unchanged on 1842 (discover 222, recruit 705, corridor 614.3).
PULSE: rich 120 ants / store 4.9 / delivered 11.3; poor 0 ants.
Default scene 40k: 40 → 54 ants, 9.3 delivered.

Observation:
The mound now has a granary the player can watch rise, then drop when new ants appear. No food still means a quiet die-off. Trails did not become a conveyor.

Decision:
KEEP

New question:
Can two food piles share traffic, or does first-discovery lock the colony (E12)?


### 23:50 — Seed 1842 (E07 relocate eval, no sim change)

Trail formation: PASS
First discovery: 222 ticks
Stable recruitment: 705 ticks
Wall adaptation: PASS
Old-trail decay: 82.9%
RELOCATE: PASS — new delivery 2596 ticks; corridors old 678 / new 549

Hypothesis:
Players will move food. If the old vapor keeps all traffic, disturb→watch fails.

Change:
Headless E07: after recruitment, erase the east pile, paint a north pile.

Before:
Unmeasured.

After:
New deliveries by 2596 ticks. New corridor 549 vs old 678 — the old band is still loud (paths overlap the midline) but the new pile is used.

Observation:
Not instant re-lock, not stuck on a ghost trail. Worth watching whether a farther move would look cleaner.

Decision:
KEEP (measurement)

New question:
Can two food piles share traffic, or does first-discovery lock the colony (E12)?


### 23:55 — Seed 1842

Trail formation: PASS
First discovery: 222 ticks
Stable recruitment: 705 ticks
Food delivered: 0.2%
Corridor peak: 614.3
Wall adaptation: PASS (detour visits 2088)
Old-trail decay: 82.9%
Resume spread: 35.1
PULSE: PASS — rich 120 ants / store 4.9 / delivered 11.3; poor 0 ants
RELOCATE: PASS — new delivery 2596 ticks; corridors old 678 / new 549

Changed:
none (skipped)

Observation:
Same 1842 story: wander ~222, recruit ~705, one delivery closes the
loop. Wall still forces the northern gap; unreinforced food scent
fades ~83% and searchers spread. Vapor, sprites, and Scent-on are
already in; a softness/scale nudge would be taste, not a watchability
fix, and a deposit/evaporation nudge still risks conveyor lock-in or
the 90% “vanished immediately” MEMORY fail.

Decision:
KEEP


### Underground layer — nest below the nest (E_CHOKE regression + FIRE stability)

Trail formation: PASS (seed 1842: discover 197, recruit 652)
Wall adaptation: PASS
CHOKE: PASS — delivered 0.6, 2033 cell-visits (was FAIL: delivered 0.2)
FIRE: 4/5 on {1842,7,99,1,42} (was 2/5 at the first shift length)

Changed:
underground: second Uint8Array grid (SOLID/TUNNEL/CHAMBER/ENTRANCE) +
per-cell depth/owner, plan view sharing the surface grid's x/y — cell-
associated data, not voxels. Ants descend at their mound's entrance,
walk to a working face, cut passage on a per-tick dig chance, and
follow the depth gradient home with a soil load. Mound pellets (prior
commit) now come from real cut tunnel instead of a flat excavate roll.
fireDescendChance 0.06 / harvesterDescendChance 0.07 (near-equal —
species aggression lives in dig chance, 0.006 fire vs 0.003 harvester,
not in how much of the colony goes below).
shiftTicks 700 → 400.

Observation:
First pass (shiftTicks 700) parked ~22% of a 100-ant colony underground
at steady state. That starved the chokepoint eval of surface traffic —
CHOKE needs three deliveries through a squeezed 2-cell slot inside 8000
ticks, and a fifth of the colony being off-map at any moment was enough
to miss it even though nothing about digging favored either species in
that scenario. It also made the fire-pile contest noisy across seeds:
whichever species happened to have more ants below at the moment the
eval sampled would read as "losing" the pile, independent of combat
chances. A shorter shift (400) holds both species' surface numbers
steadier without touching the descend/dig split that keeps fire ants
the more aggressive diggers. Full eval green at 400; mound growth and
tunnel count over 20k-30k ticks unaffected (fire dome to ~0.44 height,
harvester disk to ~0.13, tunnelCount still climbing).

Decision:
KEEP

New question:
Underground view toggle (U key) and museum cross-section rendering are
still unbuilt — the grid exists but nothing draws it yet.

### Gap-list pass — persistence, CI, coverage, renderer split

Trail formation: PASS (seed 1842: discover 222, recruit 705, corridor 614.3)
Wall adaptation: PASS (detour visits 2088)
Old-trail decay: 82.9%

Changed:
No simulation parameters. Every number above is byte-identical to the
23:55 entry — this pass was infrastructure and coverage, not tuning.

1. Save/load. `src/save/Snapshot.ts` serializes the whole sim; typed
   arrays go to base64 so Float32 pheromone values and the mulberry32
   state round-trip exactly. `SaveStore.ts` holds the localStorage side.
   Continue / New world on startup, auto-save every 500 ticks, Save
   button and Cmd/Ctrl+S. ~360 KiB steady state at 200x150.
   Determinism checked by saving at tick 1500, loading into an engine
   with a different seed, and running 2500 more ticks: identical ant
   positions, energies, field masses and RNG state. Eval untouched — it
   starts fresh by design.
2. CI. `.github/workflows/eval.yml` runs typecheck + eval on push to
   main. Two real bugs fell out of a clean install: the lockfile carried
   a versionless stub for @rollup/rollup-android-arm-eabi (a corrupted
   local npm cache entry), and nothing declared @types/node — tsc had
   been finding it in a parent directory's node_modules.
3. E_FIRE and E_LIZARD. Both run a paired control (no fire colony, no
   lizard) so a colony that merely starved cannot read as a raid or a
   hunt. Verified they detect a break: with the kill chances zeroed and
   the tongue cooldown made effectively infinite, both flip to FAIL.
4. E_SOAK. 100k ticks, one colony, one pile. Asserts no extinction, no
   breeding past the cap, the granary inside [0, starting food mass] on
   every tick, and no non-finite pheromone cell.
5. E_MULTI_FOOD and E_CHOKEPOINT — the two YELLOW items.
6. PixiRenderer split into HarvesterRenderer / FireAntRenderer /
   LizardRenderer (481 -> 341 lines), verified in the browser against
   the old scales and tints.

Observation:
Two things a watching player would notice, neither of them fixed here.

The soak needs a radius-12 pile to say anything. At radius 4 the colony
peaks at the 120 cap around 20k ticks and is extinct by 60k with the pile
long gone — correct behavior, but it makes the granary untestable, so
E_SOAK fails if the pile empties.

E_FIRE is an annihilation, not a displacement. Over 6k ticks on a shared
pile the harvesters go to zero on all five seeds while the fire ants lose
nobody; swarmDefenseCount 3 never fires because harvesters die before
they can cluster. The scenario is scored at 2k ticks, where it is still a
contest (11-21 of 60 harvesters alive, fire ants holding the pile). Worth
a tuning pass: a raid the harvesters can sometimes survive is a better
thing to watch than a wipe.

Decision:
KEEP

New question:
Can harvesters ever win a contested pile, or does bumpKillChance 0.22
make the outcome a foregone conclusion the moment two colonies meet?

## Template

```text
HH:MM — Seed N

Trail formation: PASS|FAIL
First discovery: N ticks
Stable recruitment: N ticks
Food delivered: N%
Wall adaptation: PASS|FAIL
Old-trail decay: N%

Changed:
<param> A → B

Observation:
<what a watching player would notice>

Decision:
KEEP|REJECT
```
