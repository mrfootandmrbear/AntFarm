# AntFarm

**AntFarm is a falling-sand game for living systems: build a tiny world, fill it with life, and see what happens.**

Paint dirt, rock, water, food, nests, and ants into a small 2D diorama. Everything you place already knows how to behave. You do not program, issue orders, or complete objectives.

The loop is: **PLACE → WATCH → INTERFERE → WATCH.**

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run eval        # headless CORE / ADAPTATION / MEMORY scenarios
npm run typecheck
```

## What this is

A toy, not scientific software. Simple local rules should produce a colony that is interesting to disturb and watch recover.

See [AGENTS.md](AGENTS.md) for the north-star, architecture guardrails, and tuner objective. See [OVERNIGHT.md](OVERNIGHT.md) for the experiment log.
