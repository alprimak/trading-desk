# UX Design Writeup - Live Position Monitor

## Design Goal: Glanceable Under Pressure

A trader needs to read this screen in **under 1 second** while managing 5+ other windows. The design prioritizes three things:

1. **Instant state recognition** - Color, typography, and layout make P&L changes jump out without scanning
2. **Zero jank** - 25 Hz per symbol across 10 symbols = 250 msg/s inbound, but the grid repaints at ≤60 fps via requestAnimationFrame throttling
3. **Graceful degradation** - Stream stalls show a disconnected banner within 10s; reconnect is automatic

## Information Hierarchy (What You See First)

### Top to Bottom, Glance Scan (<1s):

1. **Connection status** (green dot) - Dead simple: connected or not
2. **Total P&L** (header, large number) - Net position outcome at a glance
3. **Open position count** (header) - How many lines to scan
4. **Grid rows** (symbol · side · P&L) - Individual positions sorted by P&L magnitude

### Cell-Level Hierarchy:

- **Symbol** (bold white) - What you're trading
- **Side** (green LONG / red SHORT) - Direction is instantly readable via color
- **P&L $** (green + / red -) - Absolute gain/loss
- **P&L %** (green + / red -) - Relative gain/loss (scaled to entry × qty)
- **Mark price** (tabular-nums, flashing) - Current market price with change indicator

### Cell Change Flashing

180ms background flash on numeric change:
- **Green** = value increased
- **Red** = value decreased  
- **Gray** = stale (no update for >5s)

Brightness is **not** proportional to magnitude (too noisy at 25 Hz). Flash is binary: changed or not.

## Deliberate Omissions

### What We Left Out:

1. **No order book depth** - This is a position monitor, not a trading terminal. We show mark price (mid), not bid/ask spread nuance.
2. **No chart/sparklines per row** - At 250 msg/s, micro-charts would jank or overwhelm. Traders judge trend from the flashing cells.
3. **No position history** - Closed positions vanish from the grid. The focus is **now**, not past trades.
4. **No multi-sort** - Simple descending-by-P&L. Adding column-sort UI would clutter what is intentionally a single-scan layout.

### Why These Choices:

- **Cognitive load** - A trader under pressure scans linearly: total P&L → per-position P&L → action (exit). Every extra widget is a distraction.
- **Update frequency** - At high-frequency, static layout is king. Reordering rows on every tick would destroy spatial memory.

## Typography & Layout

### Monospace / Tabular Numerics:

All numeric columns use `font-variant-numeric: tabular-nums` so digits align vertically. A "$1,234" and "$5,678" stack perfectly, making visual comparison instant.

Font: **SF Mono** / Consolas / Monaco (monospace stack) for numbers, system sans for labels.

### Color Palette:

- **Green (#10b981)** - Positive P&L, LONG side
- **Red (#ef4444)** - Negative P&L, SHORT side
- **Blue (#3b82f6)** - Neutral actions (summarize button)
- **Gray (#888)** - Labels, inactive state
- **Dark (#0a0a0a bg, #111 cards)** - Low-luminance background for extended viewing

No purple/orange/yellow — the palette is intentionally minimal to avoid ambiguity.

## Alternative Considered: Ag-Grid with Real-time Plugin

**Rejected:** ag-Grid Enterprise has a real-time update plugin, but:

1. **License cost** - Enterprise tier for a take-home submission is overkill
2. **Bundle size** - 500+ KB for features we don't need (Excel export, pivot tables)
3. **Custom flashing** - ag-Grid's cell renderers would still need the same 180ms flash logic we built

**Why custom table won?** We needed:
- Exact control over repainting (useSyncExternalStore + rAF throttle)
- Lightweight (<10 KB for the grid logic)
- No bundler/license friction

For a production desk with 50+ traders, ag-Grid's enterprise row model might win. For this demo, a custom table is cleaner.

## Wireframe

See `wireframe.png` (annotated screenshot):

```
┌─────────────────────────────────────────────────────────────────┐
│ Live Position Monitor            [●] Connected    Σ P&L: +$1,234 │
├─────────────────────────────────────────────────────────────────┤
│ Enter Position: [BTC-USD ▼] [LONG/SHORT] [Qty: 1.00] [Enter]   │
├─────────────────────────────────────────────────────────────────┤
│ ┌ AI Summary ──────────────────────────────────── [Summarize] ┐ │
│ │ Net long $45k across 3 symbols. Biggest winner: BTC +$1200  │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Symbol   Side    Qty  Entry    Mark     P&L $    P&L %   [Exit]│
│ BTC-USD  LONG    1.0  $45000  $46200   +$1200   +2.67%   [Exit]│
│ ETH-USD  LONG    2.0  $2500   $2550    +$100    +2.00%   [Exit]│
│ SOL-USD  SHORT   5.0  $100    $98      +$10     +2.00%   [Exit]│
└─────────────────────────────────────────────────────────────────┘
                ^ Green flash on increase
```

Key annotations:
- **Connection dot** (top-right) pulses green/red
- **AI Summary strip** sits above grid (not modal)
- **Tabular-nums alignment** visible in Mark / P&L columns
- **Exit buttons** right-aligned for thumb-zone reach (mobile)

## What Would Change With Real User Feedback

### Least-Certain Decisions:

1. **Auto-refresh interval for AI summary** - Currently on-demand only. If traders want passive updates, add a 30s timer.
2. **P&L color intensity** - Current: binary (green/red). Alternative: brightness proportional to |(P&L / entry)|. Risk: too subtle at small moves, too bright at large.
3. **Symbol filter** - 10 symbols is the demo universe. A real desk might have 50+. Would need a symbol-picker or tabs.

### What Real Load Testing Would Surface:

- **>10 concurrent connections** - Does the broadcast channel scale, or do we need per-client channels?
- **>1000 msg/s** - At what tick rate does the rAF throttle fall behind? (Current: tested at 250 msg/s)
- **Mobile layout** - This is desktop-first. On mobile, the grid would need horizontal scroll or a card-based layout.

---

## Summary

This UX is a **trader's cockpit**, not a consumer app. It trades visual polish for information density and update speed. A trader keeping this open all day judges it on:
- How fast can I see my net P&L?
- How fast can I see which position is bleeding?
- How fast can I exit?

The answer to all three: **under 1 second**, without scrolling or clicking.
