# Overnight experiment log

Not an activity log. Each entry is a seed, metrics, a single change, an observation, and KEEP or REJECT.

Tuner objective: **legible emergence, not fastest food delivery.**

Look work may start only after CORE PASS. KEEP a param change only if ADAPTATION and MEMORY did not regress. Stop a workstream after two consecutive regressions.

## Status

- CORE: PASS (seed 1842; 4/5 of {1842,7,99,1,42})
- ADAPTATION: PASS
- MEMORY: PASS
- Look: vapor on by default, top-down walk/carry from Deposit, Scent/Erase/transport copy
- Consecutive regressions: 0
- Typecheck: clean
- `npm run eval`: exit 0
- Conductor loop: armed every 20 minutes (PID 54046)

## Morning brief

Can simple local rules produce an ant colony that is interesting to disturb and watch recover?

On seed 1842: yes. Wander ~220 ticks, recruit ~700, one delivery closes the loop without conveyor lock-in. A rock wall across the corridor sends traffic through a northern gap and foraging resumes. Unreinforced food scent fades (~83%) and searchers spread out.

The six-object toy (erase/dirt, rock, water, food, nest, ant) is what there is. Play it with `npm run dev`. Scent is on.

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
