"use client";

import "gridstack/dist/gridstack.min.css";
import { GridStack, type GridStackWidget, type GridItemHTMLElement } from "gridstack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAdminPanels, type PanelId } from "./AdminPanelContext";

// Bump the version suffix if the default layout / storage shape changes, so a
// layout saved during earlier testing doesn't silently override the new default.
const STORAGE_KEY = "admin-grid-v6";
const COLUMNS = 12;
const CELL_HEIGHT = 44;
// Gap gridstack leaves around each tile. Shared with the drop preview so the
// shadow lines up exactly with the tile that will replace it.
const MARGIN = 6;

type Layout = { x: number; y: number; w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };
type PanelMeta = { title: string; node: ReactNode };

const PALETTE_ORDER: PanelId[] = ["teams", "bracket", "matches", "players", "settings"];

const PANEL_TITLES: Record<PanelId, string> = {
  teams: "Teams",
  bracket: "Bracket",
  matches: "Matches",
  players: "Players",
  settings: "Settings",
};

// Default tile size (grid units) + a per-panel minimum. Bracket is widest;
// matches keeps room for its ring columns (mirrors MIN_MATCH_LIST_W's intent,
// just expressed in grid columns rather than pixels).
const DEFAULT_SIZE: Record<PanelId, { w: number; h: number }> = {
  teams:    { w: 3, h: 16 },
  bracket:  { w: 6, h: 18 },
  matches:  { w: 4, h: 18 },
  players:  { w: 3, h: 14 },
  settings: { w: 3, h: 12 },
};
const MIN_SIZE: Record<PanelId, { minW: number; minH: number }> = {
  teams:    { minW: 2, minH: 4 },
  bracket:  { minW: 4, minH: 5 },
  matches:  { minW: 3, minH: 5 },
  players:  { minW: 2, minH: 4 },
  settings: { minW: 2, minH: 4 },
};

/**
 * First-run layout (no saved state):
 *
 *   ┌─────────┬──────────┬─────────┐
 *   │         │ Players  │         │
 *   │  Teams  ├──────────┤ Matches │   ← the three columns are the same height
 *   │         │ Settings │         │
 *   ├─────────┴──────────┴─────────┤
 *   │           Bracket            │
 *   └──────────────────────────────┘
 *
 * Players and Settings share the middle column, splitting TOP_H between them,
 * so the stack ends level with Teams and Matches and Bracket sits flush under
 * all three. SETTINGS_H is derived rather than written out, so the column can
 * never drift out of alignment when PLAYERS_H is retuned.
 *
 * Keep this in step with AdminPanelProvider's initial visiblePanels: a panel
 * positioned here only appears if it's also visible by default.
 */
const TOP_H = 18;
const PLAYERS_H = 11;
const SETTINGS_H = TOP_H - PLAYERS_H;
const BRACKET_H = 20;
const THIRD = COLUMNS / 3;
const DEFAULT_LAYOUT: Partial<Record<PanelId, Layout>> = {
  teams:    { x: 0,         y: 0,         w: THIRD,   h: TOP_H },
  players:  { x: THIRD,     y: 0,         w: THIRD,   h: PLAYERS_H },
  settings: { x: THIRD,     y: PLAYERS_H, w: THIRD,   h: SETTINGS_H },
  matches:  { x: THIRD * 2, y: 0,         w: THIRD,   h: TOP_H },
  bracket:  { x: 0,         y: TOP_H,     w: COLUMNS, h: BRACKET_H },
};

// Custom drag payload type — narrower than "text/plain" so onDragOver only
// accepts our palette chips, not arbitrary text/selection drags.
const DND_TYPE = "application/x-panel-id";

function loadSaved(): Partial<Record<PanelId, Layout>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* fall through to the default layout */
  }
  return { ...DEFAULT_LAYOUT };
}

// ── grid geometry (grid-unit rectangles) ──────────────────────────────────────
function rectOf(node: { x?: number; y?: number; w?: number; h?: number }): Rect {
  return { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1 };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Shrink neighbour `m` (from its pre-resize rect) so it no longer overlaps the
// active rect `n`, keeping the edge farthest from `n` anchored — i.e. `n`'s
// growth eats into `m` instead of shoving it aside. Returns null if `m` can't
// shrink without dropping below its min (caller then leaves it to gridstack).
function shrinkAway(m: Rect, n: Rect, minW: number, minH: number): Rect {
  if (!overlaps(m, n)) return m;
  const overlapX = Math.min(m.x + m.w, n.x + n.w) - Math.max(m.x, n.x);
  const overlapY = Math.min(m.y + m.h, n.y + n.h) - Math.max(m.y, n.y);
  const r: Rect = { ...m };
  // Shrink along whichever axis has the smaller overlap (the edge `n` crossed).
  if (overlapX <= overlapY) {
    if (m.x + m.w / 2 <= n.x + n.w / 2) {
      r.w = n.x - m.x;                 // m is left of n → pull its right edge in
    } else {
      const right = m.x + m.w;         // m is right of n → push its left edge in
      r.x = n.x + n.w;
      r.w = right - r.x;
    }
    if (r.w < minW) return m;          // can't fit — leave m to gridstack
  } else {
    if (m.y + m.h / 2 <= n.y + n.h / 2) {
      r.h = n.y - m.y;                 // m is above n → pull its bottom edge up
    } else {
      const bottom = m.y + m.h;        // m is below n → push its top edge down
      r.y = n.y + n.h;
      r.h = bottom - r.y;
    }
    if (r.h < minH) return m;
  }
  return r;
}

// Largest w/h available for a tile at (n.x, n.y) before it hits another tile or
// the grid's right edge — used to shrink an oversized tile into a smaller gap.
// Assumes (n.x, n.y) is itself free; callers step past any tile under the cursor
// first (see findDropRect), since a tile whose origin encloses n can't be seen
// by the `m.x >= n.x + 1` / `m.y >= n.y + 1` tests below.
function freeSizeAt(n: Rect, others: Rect[]): { w: number; h: number } {
  let maxW = COLUMNS - n.x;
  let maxH = Infinity;
  for (const m of others) {
    if (n.y < m.y + m.h && n.y + n.h > m.y && m.x >= n.x + 1) maxW = Math.min(maxW, m.x - n.x);
    if (n.x < m.x + m.w && n.x + n.w > m.x && m.y >= n.y + 1) maxH = Math.min(maxH, m.y - n.y);
  }
  return { w: Math.max(1, maxW), h: maxH === Infinity ? n.h : Math.max(1, maxH) };
}

/** The tile covering grid cell (x, y), if any. */
function tileAt(x: number, y: number, others: Rect[]): Rect | undefined {
  return others.find(m => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
}

/** Slide a rect up while the row above is clear — our own gravity (see compactVertically). */
function floatUp(r: Rect, others: Rect[]): Rect {
  let y = r.y;
  while (y > 0 && !others.some(m => overlaps({ ...r, y: y - 1 }, m))) y--;
  return { ...r, y };
}

/**
 * Where a palette tile dropped at the hovered cell should actually land: it
 * shrinks into whatever gap is there rather than displacing anyone, steps below
 * a tile it was dropped on top of, and then floats up into any space above.
 * Always returns something — below every tile the full width is free.
 */
function findDropRect(
  hoverX: number, hoverY: number,
  desired: { w: number; h: number },
  min: { minW: number; minH: number },
  others: Rect[],
): Rect {
  const x = Math.max(0, Math.min(COLUMNS - 1, hoverX));
  let y = Math.max(0, hoverY);

  for (let guard = 0; guard < 24; guard++) {
    const hit = tileAt(x, y, others);
    if (hit) { y = hit.y + hit.h; continue; }
    const free = freeSizeAt({ x, y, w: desired.w, h: desired.h }, others);
    const w = Math.min(desired.w, free.w);
    const h = Math.min(desired.h, free.h);
    if (w >= min.minW && h >= min.minH) return floatUp({ x, y, w, h }, others);
    y++; // too cramped here — try the next row down
  }

  const bottom = others.reduce((acc, m) => Math.max(acc, m.y + m.h), 0);
  return { x: 0, y: bottom, w: desired.w, h: desired.h };
}

/**
 * Caps the tile being resized at what its neighbours can actually give up, so
 * growing it can never push one onto another row — past this point the resize
 * simply stops. Only the edges the user is dragging are clamped, and a
 * neighbour is only considered if it shares rows (for a horizontal clamp) or
 * columns (vertical), and started beyond the edge that's moving.
 */
function clampToNeighbours(
  n: Rect,
  start: Rect,
  snaps: Array<{ rect: Rect; minW: number; minH: number }>,
  min: { minW: number; minH: number },
): Rect {
  let { x, y, w, h } = n;
  const startRight = start.x + start.w;
  const startBottom = start.y + start.h;

  for (const s of snaps) {
    const m = s.rect;
    // Spans are measured against the incoming rect, not the one being clamped,
    // so each neighbour's verdict doesn't depend on the loop order.
    const sharesRows = n.y < m.y + m.h && n.y + n.h > m.y;
    const sharesCols = n.x < m.x + m.w && n.x + n.w > m.x;

    if (sharesRows && n.x + n.w > startRight && m.x >= startRight) {
      w = Math.min(w, Math.max(min.minW, m.x + m.w - s.minW - x));
    }
    if (sharesRows && n.x < start.x && m.x + m.w <= start.x) {
      const keepRight = x + w;
      x = Math.max(x, m.x + s.minW);
      w = Math.max(min.minW, keepRight - x);
    }
    if (sharesCols && n.y + n.h > startBottom && m.y >= startBottom) {
      h = Math.min(h, Math.max(min.minH, m.y + m.h - s.minH - y));
    }
    if (sharesCols && n.y < start.y && m.y + m.h <= start.y) {
      const keepBottom = y + h;
      y = Math.max(y, m.y + s.minH);
      h = Math.max(min.minH, keepBottom - y);
    }
  }

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    w: Math.max(min.minW, Math.min(w, COLUMNS - Math.max(0, x))),
    h: Math.max(min.minH, h),
  };
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * Our own gravity. gridstack runs with float:true so it never reflows behind
 * the custom resize logic, which means gaps would otherwise persist — so after
 * every interaction each tile slides up into whatever space opened above it.
 * Top-down order matters: a tile can only rise into space its predecessors
 * have already vacated.
 */
function compactVertically(g: GridStack) {
  const nodes = g.getGridItems()
    .filter(el => el.gridstackNode)
    .map(el => ({ el, r: rectOf(el.gridstackNode!) }))
    .sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);

  const settled: Rect[] = [];
  g.batchUpdate();
  for (const n of nodes) {
    const moved = floatUp(n.r, settled);
    if (moved.y !== n.r.y) g.update(n.el, { y: moved.y });
    settled.push(moved);
  }
  g.batchUpdate(false);
}

// ── one grid tile ─────────────────────────────────────────────────────────────
// React owns the .grid-stack-item DOM (rendered here, keyed by panel id); we
// only hand gridstack *control* of it via makeWidget(), and release it via
// removeWidget(el, removeDOM=false) so React stays in charge of the element's
// lifecycle. gridstack positions items with CSS (never re-parents them), so
// React's ref/reconciliation is stable while a tile is dragged or resized.
function GridItem({
  grid, id, title, layoutRef, onClose, children,
}: {
  grid: GridStack;
  id: PanelId;
  title: string;
  layoutRef: React.RefObject<Partial<Record<PanelId, Layout>>>;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const min = MIN_SIZE[id];
    const size = DEFAULT_SIZE[id];
    // Read the saved position here (in the effect, not during render) so the
    // tile mounts where it last was; after this, gridstack owns its position.
    const layout = layoutRef.current[id];
    const opts: GridStackWidget = layout
      ? { ...layout, ...min, id }
      : { w: size.w, h: size.h, ...min, id, autoPosition: true };
    grid.makeWidget(el, opts);
    return () => {
      // false, false → keep the DOM (React removes it) and don't fire events.
      try { grid.removeWidget(el, false, false); } catch { /* grid already torn down */ }
    };
    // `layout` is read once to seed the position; after that gridstack owns it,
    // so re-running on layout changes would fight the user's drags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, id]);

  return (
    <div ref={ref} className="grid-stack-item">
      <div className="grid-stack-item-content">
        <div
          className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b0e14]"
          // Same "sumobots gears" cogs texture the rest of the admin surface uses
          // (src/app/admin/layout.tsx + the fullscreen bracket). bg-[#0b0e14] stays
          // as the base colour; the low-opacity pattern tiles over it.
          style={{ backgroundImage: "url('/background_gears.svg')" }}
        >
          {/* Title bar — the only drag handle, so interactive panel content
              (match cards, inputs, bracket pan/zoom) never moves the tile. */}
          <div className="flex shrink-0 items-stretch border-b border-white/10 bg-white/3">
            <div className="panel-drag-handle flex min-w-0 flex-1 cursor-move items-center gap-1.5 px-2.5 py-1.5 text-[0.6rem] font-semibold uppercase tracking-widest text-foreground/60 select-none">
              <GripVertical className="h-3 w-3 shrink-0 opacity-50" strokeWidth={2} />
              <span className="truncate">{title}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Remove panel"
              aria-label={`Remove ${title} panel`}
              className="flex shrink-0 items-center px-2 text-foreground/40 transition-colors hover:text-foreground/90"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          {/* Panel content fills the rest and keeps its own container-query
              layout + internal scroll — the tile only changes its box size, so
              font sizes stay constant (no scale transform). */}
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ── palette tray ──────────────────────────────────────────────────────────────
function PanelPalette({
  placed, onAdd, onDragStart, onDragEnd,
}: {
  placed: PanelId[];
  onAdd: (id: PanelId) => void;
  onDragStart: (e: React.DragEvent, id: PanelId) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
      <span className="text-[0.6rem] uppercase tracking-widest text-foreground/40">
        Drag or click to add
      </span>
      {PALETTE_ORDER.map((id) => {
        const isPlaced = placed.includes(id);
        return (
          <button
            key={id}
            type="button"
            draggable={!isPlaced}
            onDragStart={(e) => onDragStart(e, id)}
            onDragEnd={onDragEnd}
            onClick={() => !isPlaced && onAdd(id)}
            disabled={isPlaced}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
              isPlaced
                ? "cursor-default border-white/5 text-foreground/25"
                : "cursor-grab border-white/15 text-foreground/70 hover:border-white/30 hover:text-foreground active:cursor-grabbing",
            )}
          >
            <GripVertical className="h-3 w-3 opacity-50" strokeWidth={2} />
            {PANEL_TITLES[id]}
          </button>
        );
      })}
    </div>
  );
}

// ── grid ──────────────────────────────────────────────────────────────────────
export default function PanelGrid({ panels }: { panels: Record<PanelId, PanelMeta> }) {
  const { visiblePanels, togglePanel } = useAdminPanels();
  const gridElRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<GridStack | null>(null);
  // Shadow showing where an in-flight palette tile will land, in grid units.
  const [preview, setPreview] = useState<Rect | null>(null);
  // Saved positions live in a ref (not state) so mutating them before a
  // toggle-driven re-render doesn't itself need to trigger one.
  const savedRef = useRef<Partial<Record<PanelId, Layout>>>({});

  useEffect(() => {
    if (!gridElRef.current) return;
    savedRef.current = loadSaved();

    // Children (GridItems) only render once `grid` is set below, so at init the
    // container is empty — gridstack has nothing to auto-register, which keeps
    // this correct under React StrictMode's mount/unmount/mount double-invoke.
    const g = GridStack.init(
      {
        column: COLUMNS,
        cellHeight: CELL_HEIGHT,
        margin: MARGIN,
        // float:true keeps gridstack from reflowing behind the custom resize
        // logic below; compactVertically() supplies the upward gravity instead,
        // run at the end of each interaction rather than continuously.
        float: true,
        // Only the title bar drags the tile. scroll:false disables gridstack's
        // eager edge auto-scroll — we do our own (only at the viewport edge) below.
        draggable: { handle: ".panel-drag-handle", scroll: false },
        // Resize from every side and corner.
        resizable: { handles: "n, ne, e, se, s, sw, w, nw" },
        acceptWidgets: false, // palette drops are handled via HTML5 DnD below
        animate: true,
      },
      gridElRef.current,
    );
    if (!g) return;

    // Persist positions to localStorage, debounced so a live drag/resize (many
    // 'change' events) doesn't thrash storage.
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        const next: Partial<Record<PanelId, Layout>> = { ...savedRef.current };
        for (const el of g.getGridItems()) {
          const n = el.gridstackNode;
          if (n?.id && n.x != null && n.y != null && n.w != null && n.h != null) {
            next[n.id as PanelId] = { x: n.x, y: n.y, w: n.w, h: n.h };
          }
        }
        savedRef.current = next;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      }, 250);
    };
    g.on("change", persist);
    g.on("added", persist);

    // ── custom "shrink the neighbour, don't shove it" resize behaviour ──────────
    // gridstack's default is to push overlapped neighbours out of the way. Instead
    // we snapshot every other tile at resize start, then on each step restore them
    // to that snapshot and shrink (rather than move) any the active tile now
    // overlaps — so growing one panel eats into its neighbour in place. The tile
    // is also capped (clampToNeighbours) at the point where a neighbour would hit
    // its minimum, so it can never grow far enough to bump one to another row.
    let resizeSnapshot: Array<{ el: GridItemHTMLElement; rect: Rect; minW: number; minH: number }> = [];
    let resizeStart: Rect | null = null;

    const applyShrink = (activeEl: GridItemHTMLElement) => {
      const active = activeEl.gridstackNode;
      if (!active || !resizeStart) return;
      const min = MIN_SIZE[active.id as PanelId] ?? { minW: 1, minH: 1 };
      const n = clampToNeighbours(rectOf(active), resizeStart, resizeSnapshot, min);

      g.batchUpdate();
      // Pull the active tile back to the capped rect first, so the neighbours
      // below are shrunk against the size it's actually allowed to reach.
      if (!sameRect(n, rectOf(active))) g.update(activeEl, n);
      for (const snap of resizeSnapshot) {
        const target = shrinkAway(snap.rect, n, snap.minW, snap.minH);
        const cur = snap.el.gridstackNode ? rectOf(snap.el.gridstackNode) : snap.rect;
        if (!sameRect(target, cur)) g.update(snap.el, target);
      }
      g.batchUpdate(false); // commit the batch
    };

    g.on("resizestart", (_e, el) => {
      resizeStart = el.gridstackNode ? rectOf(el.gridstackNode) : null;
      resizeSnapshot = g.getGridItems()
        .filter((item) => item !== el && item.gridstackNode)
        .map((item) => {
          const n = item.gridstackNode!;
          return { el: item, rect: rectOf(n), minW: n.minW ?? 1, minH: n.minH ?? 1 };
        });
    });
    g.on("resize", (_e, el) => applyShrink(el));
    g.on("resizestop", (_e, el) => {
      applyShrink(el);
      resizeSnapshot = [];
      resizeStart = null;
      // Shrinking a tile can leave a gap above its neighbours — close it.
      compactVertically(g);
      persist();
    });

    // ── edge auto-scroll: only scroll the panel area while dragging when the
    // pointer reaches the very edge of the visible area (i.e. the component is
    // being dragged off-screen). gridstack's own scroll is off (see options). ──
    const scrollEl = scrollRef.current;
    const EDGE_MARGIN = 8;   // px from the edge that counts as "at the edge"
    const EDGE_SPEED = 22;   // px per frame
    let dragScrolling = false;
    let dragScrollRAF: number | null = null;
    let pointerY = 0;
    const onDragPointerMove = (ev: PointerEvent) => { pointerY = ev.clientY; };
    const dragScrollTick = () => {
      if (!dragScrolling || !scrollEl) { dragScrollRAF = null; return; }
      const rect = scrollEl.getBoundingClientRect();
      let dy = 0;
      if (pointerY >= rect.bottom - EDGE_MARGIN) dy = EDGE_SPEED;
      else if (pointerY <= rect.top + EDGE_MARGIN) dy = -EDGE_SPEED;
      if (dy !== 0) scrollEl.scrollTop += dy;
      dragScrollRAF = requestAnimationFrame(dragScrollTick);
    };
    const stopDragScroll = () => {
      dragScrolling = false;
      document.removeEventListener("pointermove", onDragPointerMove, true);
      if (dragScrollRAF) { cancelAnimationFrame(dragScrollRAF); dragScrollRAF = null; }
    };
    g.on("dragstart", () => {
      dragScrolling = true;
      document.addEventListener("pointermove", onDragPointerMove, true);
      dragScrollRAF = requestAnimationFrame(dragScrollTick);
    });

    // ── on drop: stop edge-scroll, then shrink an oversized tile to fit the gap ─
    g.on("dragstop", (_e, el) => {
      stopDragScroll();
      const n = el.gridstackNode;
      if (n) {
        const nRect = rectOf(n);
        const others = g.getGridItems()
          .filter((item) => item !== el && item.gridstackNode)
          .map((item) => rectOf(item.gridstackNode!));
        const free = freeSizeAt(nRect, others);
        const min = MIN_SIZE[n.id as PanelId] ?? { minW: 1, minH: 1 };
        const w = Math.max(min.minW, Math.min(nRect.w, free.w));
        const h = Math.max(min.minH, Math.min(nRect.h, free.h));
        if (w !== nRect.w || h !== nRect.h) g.update(el, { w, h });
      }
      compactVertically(g);
      persist();
    });

    setGrid(g);
    return () => {
      if (persistTimer) clearTimeout(persistTimer);
      stopDragScroll();
      g.offAll();
      g.destroy(false); // keep the React-owned container div
      setGrid(null);
    };
  }, []);

  // Closing a panel leaves a hole — pull the survivors up into it. Child
  // effects tear down before the parent's run, so by now the removed tile is
  // already out of the grid. Also covers adds, where it's a no-op (a dropped
  // tile is placed pre-floated).
  useEffect(() => {
    if (grid) compactVertically(grid);
  }, [grid, visiblePanels]);

  // Which palette chip is in flight. dataTransfer.getData() is unreadable
  // during dragover (only on drop), so the live preview reads the id from here.
  const draggingIdRef = useRef<PanelId | null>(null);

  /** Where the in-flight palette tile would land, in grid units. */
  function dropRectFor(id: PanelId, clientX: number, clientY: number): Rect | null {
    if (!grid) return null;
    const cell = grid.getCellFromPixel({ left: clientX, top: clientY });
    if (!cell || cell.x == null || cell.y == null) return null;
    const others = grid.getGridItems()
      .filter((item) => item.gridstackNode)
      .map((item) => rectOf(item.gridstackNode!));
    return findDropRect(cell.x, cell.y, DEFAULT_SIZE[id], MIN_SIZE[id], others);
  }

  function handleDragStart(e: React.DragEvent, id: PanelId) {
    draggingIdRef.current = id;
    e.dataTransfer.setData(DND_TYPE, id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDragEnd() {
    draggingIdRef.current = null;
    setPreview(null);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const id = draggingIdRef.current;
    if (!id) return;
    const r = dropRectFor(id, e.clientX, e.clientY);
    // Same-rect guard: dragover fires continuously, and re-setting an identical
    // rect would re-render the whole grid on every mouse move.
    setPreview((prev) => (r && prev && sameRect(prev, r) ? prev : r));
  }

  function handleDragLeave(e: React.DragEvent) {
    // dragleave also fires when crossing into a child element — ignore those.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPreview(null);
  }

  function handleDrop(e: React.DragEvent) {
    const id = (e.dataTransfer.getData(DND_TYPE) || e.dataTransfer.getData("text/plain")) as PanelId;
    setPreview(null);
    draggingIdRef.current = null;
    if (!PALETTE_ORDER.includes(id) || visiblePanels.includes(id)) return;
    e.preventDefault();
    // Land exactly where the shadow was: shrunk to fit the gap, never displacing
    // a tile. Falls back to gridstack auto-placement if the cell can't be resolved.
    const rect = dropRectFor(id, e.clientX, e.clientY);
    if (rect) savedRef.current = { ...savedRef.current, [id]: rect };
    togglePanel(id);
  }

  function handleClickAdd(id: PanelId) {
    if (!visiblePanels.includes(id)) togglePanel(id);
  }

  return (
    <div className="admin-panel-grid flex h-full w-full flex-col">
      <PanelPalette
        placed={visiblePanels}
        onAdd={handleClickAdd}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div ref={gridElRef} className="grid-stack relative">
          {/* Drop shadow — percentage x/w mirrors how gridstack sizes its own
              columns, and the MARGIN padding puts the dashed box exactly where
              the real tile's border will be. */}
          {preview && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${(preview.x / COLUMNS) * 100}%`,
                width: `${(preview.w / COLUMNS) * 100}%`,
                top: preview.y * CELL_HEIGHT,
                height: preview.h * CELL_HEIGHT,
                padding: MARGIN,
                boxSizing: "border-box",
                zIndex: 5,
              }}
            >
              <div className="h-full w-full rounded-lg border-2 border-dashed border-white/30 bg-white/6" />
            </div>
          )}
          {grid &&
            visiblePanels.map((id) => (
              <GridItem
                key={id}
                grid={grid}
                id={id}
                title={panels[id].title}
                layoutRef={savedRef}
                onClose={() => togglePanel(id)}
              >
                {panels[id].node}
              </GridItem>
            ))}
        </div>
      </div>
    </div>
  );
}
