# Live Position Monitor

A real-time trading position monitor with WebSocket streaming, AI-powered summaries, and a high-performance grid UI.

**Demo**: [positions.askturret.com](https://positions.askturret.com) (or Railway auto-generated URL)

## Features

### Part 1: Core Monitor
- **WebSocket streaming** at 25 Hz per symbol (configurable)
- **Real-time P&L calculation** server-side (mark price updates)
- **Enter/exit positions** with instant ack + broadcast
- **Graceful reconnect** with sequence-based replay
- **No-jank updates** via requestAnimationFrame throttling (250 msg/s → 60 fps)

### Part 2: Custom Grid
- **Cell-change flashing** (180ms green/red/gray animations)
- **Tabular-nums typography** for glanceable numeric alignment
- **Dark theme** optimized for extended viewing
- **Mobile-responsive** layout

### Part 3: AI Agent
- **Claude Haiku 4.5** position summaries
- **SSE streaming** + non-streaming fallback
- **4s hard timeout** for reliability
- **Observational-only** output (no recommendations)
- **5s response cache** to absorb double-clicks

## Tech Stack

**Backend:**
- Rust + Axum (WebSocket + REST)
- Tokio async runtime
- DashMap for lock-free shared state
- Anthropic Messages API (Claude Haiku 4.5)

**Frontend:**
- React 18 + TypeScript
- Vite (build + dev server)
- Native WebSocket client (no socket.io)
- useSyncExternalStore for state management

**Deploy:**
- Railway (single-service)
- Multi-stage Docker build
- Health check endpoint

## Running Locally

### Prerequisites
- Rust 1.70+ (`rustup`)
- Node.js 20+ (`nvm use 20`)
- pnpm (`npm install -g pnpm`)
- (Optional) Anthropic API key for AI summaries

### Backend

```bash
cd backend

# Set environment variables (optional)
export ANTHROPIC_API_KEY=sk-ant-...  # For AI summaries
export TICK_RATE_HZ=25                # Mock feed rate (default: 25)
export PORT=3000                      # Server port (default: 3000)
export RUST_LOG=info,trading_desk=debug

# Run
cargo run
```

Backend will start on `http://localhost:3000`

### Frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Dev server (proxies /api and /ws to backend)
pnpm dev
```

Frontend will start on `http://localhost:5173` with hot reload.

### Full Stack

In separate terminals:
1. `cd backend && cargo run`
2. `cd frontend && pnpm dev`
3. Open `http://localhost:5173`

## Deploying to Railway

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

### Manual Deploy

1. **Create Railway project:**
   ```bash
   railway login
   railway init
   ```

2. **Set environment variables:**
   ```bash
   railway variables set ANTHROPIC_API_KEY=sk-ant-...
   railway variables set TICK_RATE_HZ=25
   railway variables set RUST_LOG=info
   ```

3. **Deploy:**
   ```bash
   railway up
   ```

Railway will:
- Build via multi-stage Dockerfile
- Expose on auto-generated URL (e.g., `trading-desk-production.up.railway.app`)
- Health check `/api/health` every 30s

### Custom Domain (Optional)

In Railway dashboard:
1. Settings → Domains
2. Add custom domain: `positions.askturret.com`
3. Point DNS CNAME to Railway target

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check (returns "OK") |
| GET | `/api/config` | Frontend config (LLM enabled, version) |
| GET | `/ws` | WebSocket upgrade (positions stream) |
| POST | `/api/agent/summary` | AI summary (non-streaming JSON) |
| GET | `/api/agent/summary/stream` | AI summary (SSE streaming) |

## WebSocket Protocol

### Client → Server

```json
{"type": "enter", "client_id": "abc", "symbol": "BTC-USD", "side": "long", "qty": 1.0}
{"type": "exit", "client_id": "abc", "position_id": "uuid"}
{"type": "resume", "client_id": "abc", "last_seq": 1234}
{"type": "ping", "client_id": "abc"}
```

### Server → Client

```json
{"type": "hello", "seq": 0, "server_time": "...", "positions": [...]}
{"type": "tick", "seq": 1, "symbol": "BTC-USD", "bid": 45000, "ask": 45010, "last": 45005, "ts": "..."}
{"type": "position", "seq": 2, "position": {...}}
{"type": "action_ack", "seq": 3, "client_id": "abc", "position": {...}}
{"type": "action_err", "seq": 4, "client_id": "abc", "error": "..."}
{"type": "heartbeat", "seq": 5, "server_time": "..."}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port (Railway injects) |
| `ANTHROPIC_API_KEY` | (none) | Anthropic API key for AI summaries |
| `TICK_RATE_HZ` | 25 | Mock feed rate per symbol |
| `SYMBOL_UNIVERSE` | BTC-USD,ETH-USD,... | Comma-separated symbols |
| `RUST_LOG` | info | Log level (trace/debug/info/warn/error) |

## Architecture Decisions

See [`docs/ux-writeup.md`](docs/ux-writeup.md) for UX design rationale.

### Why WebSocket over SSE?
- **Bi-directional** - Actions (enter/exit) travel back on the same stream
- **No per-origin cap** - SSE has 6 concurrent EventSource limit per origin
- **Ordered framing** - WebSocket guarantees order; SSE reconnect is messier

### Why in-process agent?
- **Zero cross-service latency** - Reads positions from same `Arc<DashMap>`
- **Simpler Railway shape** - One container, one health check
- **Stateless LLM call** - No persistence needed

### Why custom grid over ag-Grid?
- **Exact control** - useSyncExternalStore + rAF throttling
- **Lightweight** - <10 KB vs 500+ KB
- **No license friction** - ag-Grid Enterprise needed for real-time updates

## Performance Characteristics

- **Tick rate**: 25 Hz per symbol × 10 symbols = 250 msg/s inbound
- **Repaint rate**: ≤60 fps (requestAnimationFrame throttle)
- **WebSocket frame size**: ~150 bytes per tick (JSON)
- **Memory footprint**: ~50 MB (Rust backend + 1000 positions cached)
- **AI summary latency**: <1s typical, 4s hard timeout

## Testing Checklist

From [`docs/ux-writeup.md`](docs/ux-writeup.md):

- [ ] WebSocket connects; hello frame delivers positions; ticks flow
- [ ] Enter position round-trips and appears in grid
- [ ] Exit position round-trips and shows realized P&L
- [ ] Sustained 25 Hz × 10 symbols for 60s with no jank
- [ ] Stream stall: kill backend, reconnect within 3s on restart
- [ ] AI summary returns within 4s or graceful error
- [ ] Summary output is observational-only (no "you should exit")
- [ ] Docker image builds and Railway deploy passes health check

## License

MIT (or specify your license)

## Contact

- **Author**: [Your Name]
- **Email**: reportbug@operum.ai
- **Repo**: alprimak/trading-desk
