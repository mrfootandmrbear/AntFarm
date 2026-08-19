# Overnight experiment log

Not an activity log. Each entry is a seed, metrics, a single change, an observation, and KEEP or REJECT.

Tuner objective: **legible emergence, not fastest food delivery.**

Look work may start only after CORE PASS. KEEP a param change only if ADAPTATION and MEMORY did not regress. Stop a workstream after two consecutive regressions.

## Status

- CORE: PASS (seed 1842; 4/5 of {1842,7,99,1,42})
- ADAPTATION: PASS
- MEMORY: PASS
- PULSE (E10/E11-lite): PASS — food grows the mound to cap; no food starves it
- Look: vapor on by default, top-down walk/carry from Deposit, Scent/Erase/transport copy
- Consecutive regressions: 0
- Typecheck: clean (unchanged this tick)
- `npm run eval`: exit 0

GREEN
single colony food gathering
pheromone decay
wall adaptation
nest reserves → hatch / starve

YELLOW
food relocation (E07) PASS on 1842 — old corridor still heavy
default 40-ant scene grows slowly
multiple food sources (E12)
chokepoint traffic (E13)

RED
E09 100k-tick soak
two-colony evals (E14–E15)
predator evals (E16–E20) — lizards exist, ungated

## Morning brief

Can simple local rules produce an ant colony that is interesting to disturb and watch recover?

On seed 1842: yes. Wander ~220 ticks, recruit ~700, one delivery closes the loop without conveyor lock-in. A rock wall across the corridor sends traffic through a northern gap and foraging resumes. Unreinforced food scent fades (~83%) and searchers spread out.

Leaving the world running now does something: a fed mound hatches up to the cap and stocks a granary; an empty mound starves. Play it with `npm run dev`. Scent is on.

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
