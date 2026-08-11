# Multi-stage Dockerfile for Live Position Monitor
# Stage 1: Build frontend (Node.js)
# Stage 2: Build backend (Rust)
# Stage 3: Runtime (minimal Debian with both artifacts)

# Stage 1: Frontend build
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/pnpm-lock.json* ./

# Install pnpm and dependencies
RUN npm install -g pnpm@8 && \
    pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN pnpm build

# Stage 2: Backend build
FROM rust:1-slim AS backend-builder

WORKDIR /app/backend

# Install build dependencies
RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy backend manifest
COPY backend/Cargo.toml backend/Cargo.lock* ./

# Create dummy main to cache dependencies
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release || true && \
    rm -rf src

# Copy backend source
COPY backend/src ./src

# Build backend (this invalidates the dependency cache but that's fine)
RUN cargo build --release

# Stage 3: Runtime
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -m -u 1000 appuser

# Copy backend binary from builder
COPY --from=backend-builder /app/backend/target/release/trading-desk /app/trading-desk

# Copy frontend dist from builder
COPY --from=frontend-builder /app/frontend/dist /app/dist

# Change ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port (Railway injects $PORT)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Run
CMD ["/app/trading-desk"]
