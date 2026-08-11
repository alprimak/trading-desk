import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ServerMsg, ClientMsg, Position } from '../types';

const CLIENT_ID = `client-${Math.random().toString(36).substring(7)}`;

interface WebSocketState {
  positions: Map<string, Position>;
  connected: boolean;
  lastSeq: number;
  lastError: string | null;
}

class WebSocketStore {
  private socket: WebSocket | null = null;
  private state: WebSocketState = {
    positions: new Map(),
    connected: false,
    lastSeq: 0,
    lastError: null,
  };
  private listeners = new Set<() => void>();
  private reconnectTimeout: number | null = null;
  private pendingUpdate = false;

  constructor() {
    this.connect();
  }

  private connect() {
    const wsUrl = import.meta.env.DEV
      ? 'ws://localhost:3000/ws'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.updateState({ connected: true, lastError: null });
      };

      this.socket.onmessage = (event) => {
        try {
          const msg: ServerMsg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      this.socket.onerror = (event) => {
        console.error('WebSocket error:', event);
        this.updateState({ lastError: 'Connection error' });
      };

      this.socket.onclose = () => {
        console.log('WebSocket closed, reconnecting...');
        this.updateState({ connected: false });
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 3000);
  }

  private handleMessage(msg: ServerMsg) {
    this.state.lastSeq = msg.seq;

    switch (msg.type) {
      case 'hello':
        console.log('Received hello with', msg.positions.length, 'positions');
        const newPositions = new Map<string, Position>();
        msg.positions.forEach((p) => newPositions.set(p.id, p));
        this.updateState({ positions: newPositions });
        break;

      case 'position':
        const updated = new Map(this.state.positions);
        updated.set(msg.position.id, msg.position);
        this.updateState({ positions: updated });
        break;

      case 'tick':
        // Ticks don't update position state directly (server sends position updates)
        break;

      case 'action_ack':
        if (msg.position) {
          const ackUpdated = new Map(this.state.positions);
          ackUpdated.set(msg.position.id, msg.position);
          this.updateState({ positions: ackUpdated });
        }
        break;

      case 'action_err':
        console.error('Action error:', msg.error);
        this.updateState({ lastError: msg.error });
        break;

      case 'heartbeat':
        // Just keep connection alive
        break;
    }
  }

  private updateState(updates: Partial<WebSocketState>) {
    this.state = { ...this.state, ...updates };
    this.scheduleNotify();
  }

  private scheduleNotify() {
    if (this.pendingUpdate) return;

    this.pendingUpdate = true;
    requestAnimationFrame(() => {
      this.pendingUpdate = false;
      this.listeners.forEach((listener) => listener());
    });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    return this.state;
  }

  send(msg: ClientMsg) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    } else {
      console.error('WebSocket not connected');
    }
  }

  enterPosition(symbol: string, side: 'long' | 'short', qty: number) {
    this.send({
      type: 'enter',
      client_id: CLIENT_ID,
      symbol,
      side,
      qty,
    });
  }

  exitPosition(positionId: string) {
    this.send({
      type: 'exit',
      client_id: CLIENT_ID,
      position_id: positionId,
    });
  }
}

const store = new WebSocketStore();

export function useWebSocket() {
  const state = useSyncExternalStore(
    (callback) => store.subscribe(callback),
    () => store.getState(),
    () => store.getState()
  );

  return {
    positions: Array.from(state.positions.values()),
    connected: state.connected,
    lastError: state.lastError,
    enterPosition: (symbol: string, side: 'long' | 'short', qty: number) =>
      store.enterPosition(symbol, side, qty),
    exitPosition: (positionId: string) => store.exitPosition(positionId),
  };
}
