import { Cell, CellType } from '../sim/constants';
import type { SimulationEngine } from '../sim/SimulationEngine';
import type { PixiRenderer } from '../render/PixiRenderer';

type ToolKind = 'cell' | 'ant' | 'fireant' | 'lizard';

interface Tool {
  id: string;
  label: string;
  color: string;
  key: string;
  category: string;
  kind: ToolKind;
  cell?: CellType;
  icon: string;
}

const TOOLS: Tool[] = [
  { id: 'erase', label: 'Bare soil', color: '#9c7748', key: '0', category: 'Ground', kind: 'cell', cell: Cell.DIRT, icon: '◌' },
  { id: 'rock', label: 'Rock', color: '#69645b', key: '1', category: 'Ground', kind: 'cell', cell: Cell.WALL, icon: '◆' },
  { id: 'water', label: 'Water', color: '#3c91b9', key: '2', category: 'Ground', kind: 'cell', cell: Cell.WATER, icon: '≈' },
  { id: 'food', label: 'Food', color: '#64a643', key: '3', category: 'Life', kind: 'cell', cell: Cell.FOOD, icon: '✿' },
  { id: 'nest', label: 'Ant nest', color: '#a45f38', key: '4', category: 'Homes', kind: 'cell', cell: Cell.NEST, icon: '⌂' },
  { id: 'firenest', label: 'Fire nest', color: '#713522', key: '5', category: 'Homes', kind: 'cell', cell: Cell.FIRE_NEST, icon: '⌂' },
  { id: 'ant', label: 'Ant', color: '#c45a28', key: '6', category: 'Creatures', kind: 'ant', icon: '•' },
  { id: 'fireant', label: 'Fire ant', color: '#321b16', key: '7', category: 'Creatures', kind: 'fireant', icon: '•' },
  { id: 'lizard', label: 'Lizard', color: '#b08958', key: '8', category: 'Creatures', kind: 'lizard', icon: '⌁' },
];

const CATEGORY_ORDER = ['Ground', 'Life', 'Homes', 'Creatures'];

export class UI {
  private engine: SimulationEngine;
  private renderer: PixiRenderer;
  private canvas: HTMLCanvasElement;

  paused = false;
  speed = 1;
  brushSize = 2;

  private selected: Tool = TOOLS[3]; // Food, matches original default feel
  private painting = false;
  private lastPaintX = -1;
  private lastPaintY = -1;

  private pauseBtn!: HTMLButtonElement;
  private readoutEl!: HTMLElement;
  private brushPreview!: HTMLElement;

  constructor(engine: SimulationEngine, renderer: PixiRenderer) {
    this.engine = engine;
    this.renderer = renderer;
    this.canvas = renderer.app.canvas;
    this.selected = TOOLS.find((t) => t.id === 'erase')!;

    this.buildPalette();
    this.buildTransport();
    this.buildReadout();
    this.buildStatusBar();
    this.buildBrushPreview();
    this.bindCanvas();
    this.bindKeyboard();
    this.updateInfo();
  }

  // ---------- Palette ----------
  private buildPalette(): void {
    const palette = document.getElementById('palette')!;
    for (const category of CATEGORY_ORDER) {
      const tools = TOOLS.filter((t) => t.category === category);
      if (tools.length === 0) continue;

      const group = el('div', 'group');
      group.appendChild(el('div', 'group-label', category));
      const row = el('div', 'group-tools');

      for (const tool of tools) {
        const btn = document.createElement('button');
        btn.className = 'btn tool-btn';
        btn.dataset.tool = tool.id;
        if (tool.id === this.selected.id) btn.classList.add('active');

        const swatch = el('span', 'swatch', tool.icon);
        swatch.style.backgroundColor = tool.color;
        btn.appendChild(swatch);
        btn.appendChild(document.createTextNode(tool.label));
        const hint = el('span', 'key-hint', tool.key);
        btn.appendChild(hint);

        btn.addEventListener('click', () => this.selectTool(tool));
        row.appendChild(btn);
      }
      group.appendChild(row);
      palette.appendChild(group);
    }

    // Brush size.
    const brushGroup = el('div', 'group');
    brushGroup.appendChild(el('div', 'group-label', 'Brush'));
    const brushRow = el('div', 'group-tools');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '8';
    slider.value = String(this.brushSize);
    slider.className = 'brush-slider';
    const value = el('span', 'brush-value', String(this.brushSize));
    slider.addEventListener('input', () => {
      this.brushSize = parseInt(slider.value, 10);
      value.textContent = String(this.brushSize);
    });
    brushRow.appendChild(slider);
    brushRow.appendChild(value);
    brushGroup.appendChild(brushRow);
    palette.appendChild(brushGroup);
  }

  private buildBrushPreview(): void {
    this.brushPreview = el('div', 'brush-preview');
    document.getElementById('stage')!.appendChild(this.brushPreview);
  }

  private selectTool(tool: Tool): void {
    this.selected = tool;
    document.querySelectorAll<HTMLElement>('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool.id);
    });
  }

  // ---------- Transport ----------
  private buildTransport(): void {
    const transport = document.getElementById('transport')!;

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'btn';
    this.pauseBtn.textContent = '⏸ Pause';
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    transport.appendChild(this.pauseBtn);

    const speeds = [
      { label: '1×', value: 1 },
      { label: '3×', value: 3 },
      { label: '10×', value: 10 },
    ];
    for (const s of speeds) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.dataset.speed = String(s.value);
      btn.textContent = s.label;
      if (s.value === this.speed) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.speed = s.value;
        transport.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) =>
          b.classList.toggle('active', parseInt(b.dataset.speed!, 10) === s.value),
        );
      });
      transport.appendChild(btn);
    }
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.pauseBtn.textContent = this.paused ? '▶ Play' : '⏸ Pause';
    this.pauseBtn.classList.toggle('active', this.paused);
  }

  // ---------- Readout (top-right stats) ----------
  private buildReadout(): void {
    this.readoutEl = document.getElementById('readout')!;
    this.readoutEl.innerHTML = '';
    for (const label of ['Ants', 'Lizards', 'Food', 'Tick']) {
      const stat = el('div', 'stat');
      stat.appendChild(el('span', 'stat-label', label));
      const value = el('span', 'stat-value', '0');
      value.dataset.stat = label;
      stat.appendChild(value);
      this.readoutEl.appendChild(stat);
    }
  }

  // ---------- Status bar (view + actions) ----------
  private buildStatusBar(): void {
    const bar = document.getElementById('statusbar')!;

    const viewGroup = el('div', 'bar-group');
    viewGroup.appendChild(el('div', 'group-label', 'Scent'));
    const trailBtn = document.createElement('button');
    trailBtn.className = 'btn';
    trailBtn.textContent = this.renderer.showPheromones ? 'Scent: On' : 'Scent: Off';
    if (this.renderer.showPheromones) trailBtn.classList.add('active');
    trailBtn.addEventListener('click', () => {
      const r = this.renderer;
      r.showPheromones = !r.showPheromones;
      trailBtn.textContent = r.showPheromones ? 'Scent: On' : 'Scent: Off';
      trailBtn.classList.toggle('active', r.showPheromones);
    });
    viewGroup.appendChild(trailBtn);
    bar.appendChild(viewGroup);

    const actionGroup = el('div', 'bar-group');
    actionGroup.appendChild(el('div', 'group-label', 'Actions'));

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      this.engine.reset();
      this.renderer.invalidateScenery();
    });
    actionGroup.appendChild(resetBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      this.engine.clear();
      this.renderer.invalidateScenery();
    });
    actionGroup.appendChild(clearBtn);

    bar.appendChild(actionGroup);
  }

  // ---------- Painting ----------
  private bindCanvas(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.painting = true;
      const { x, y } = this.canvasToGrid(e);
      this.lastPaintX = x;
      this.lastPaintY = y;
      this.paint(x, y);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.updateBrushPreview(e);
      if (!this.painting) return;
      const { x, y } = this.canvasToGrid(e);
      if (this.lastPaintX >= 0) {
        this.paintLine(this.lastPaintX, this.lastPaintY, x, y);
      } else {
        this.paint(x, y);
      }
      this.lastPaintX = x;
      this.lastPaintY = y;
    });

    window.addEventListener('mouseup', () => {
      this.painting = false;
      this.lastPaintX = -1;
      this.lastPaintY = -1;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mouseenter', (e) => this.updateBrushPreview(e));
    this.canvas.addEventListener('mouseleave', () => this.brushPreview.classList.remove('visible'));
  }

  private updateBrushPreview(e: MouseEvent): void {
    const canvasRect = this.canvas.getBoundingClientRect();
    const stageRect = document.getElementById('stage')!.getBoundingClientRect();
    const cellPx = canvasRect.width / this.engine.world.width;
    const size = Math.max(cellPx * (this.brushSize * 2 + 1), 10);
    this.brushPreview.style.width = `${size}px`;
    this.brushPreview.style.height = `${size}px`;
    this.brushPreview.style.left = `${e.clientX - stageRect.left}px`;
    this.brushPreview.style.top = `${e.clientY - stageRect.top}px`;
    this.brushPreview.style.setProperty('--brush-color', this.selected.color);
    this.brushPreview.classList.add('visible');
  }

  private canvasToGrid(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return {
      x: Math.floor(px / this.renderer.cellSize),
      y: Math.floor(py / this.renderer.cellSize),
    };
  }

  private paint(gx: number, gy: number): void {
    const world = this.engine.world;
    if (this.selected.kind === 'lizard') {
      this.engine.spawnLizardAt(gx, gy);
      return;
    }

    const r = this.brushSize;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (!world.inBounds(x, y)) continue;

        if (this.selected.kind === 'fireant') {
          this.engine.spawnFireAntAt(x, y);
        } else if (this.selected.kind === 'ant') {
          this.engine.spawnAntAt(x, y);
        } else {
          world.set(x, y, this.selected.cell!);
          this.renderer.invalidateScenery();
        }
      }
    }
  }

  private paintLine(x0: number, y0: number, x1: number, y1: number): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    while (true) {
      this.paint(cx, cy);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  // ---------- Keyboard ----------
  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const tool = TOOLS.find((t) => t.key === e.key);
      if (tool) {
        this.selectTool(tool);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        this.togglePause();
      }
    });
  }

  // ---------- Stats ----------
  updateInfo(): void {
    const alive = this.engine.aliveCount();
    const lizards = this.engine.lizardCount();
    this.setStat('Ants', String(alive));
    this.setStat('Lizards', String(lizards));
    this.setStat('Food', (this.engine.world.nestFoodStore + this.engine.world.fireNestFoodStore).toFixed(1));
    this.setStat('Tick', String(this.engine.world.tickCount));
  }

  private setStat(label: string, value: string): void {
    const el = this.readoutEl.querySelector<HTMLElement>(`[data-stat="${label}"]`);
    if (el && el.textContent !== value) el.textContent = value;
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
