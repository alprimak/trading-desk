export type ServerMsg =
  | { type: 'hello'; seq: number; server_time: string; positions: Position[] }
  | { type: 'tick'; seq: number; symbol: string; bid: number; ask: number; last: number; ts: string }
  | { type: 'position'; seq: number; position: Position }
  | { type: 'action_ack'; seq: number; client_id: string; position?: Position }
  | { type: 'action_err'; seq: number; client_id: string; error: string }
  | { type: 'heartbeat'; seq: number; server_time: string };

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number;
  mark_price: number;
  unrealized_pnl: number;
  opened_at: string;
  status: 'open' | 'closed';
  closed_at?: string;
  exit_price?: number;
  realized_pnl?: number;
}

export type ClientMsg =
  | { type: 'enter'; client_id: string; symbol: string; side: 'long' | 'short'; qty: number }
  | { type: 'exit'; client_id: string; position_id: string }
  | { type: 'adjust'; client_id: string; position_id: string; delta: number }
  | { type: 'resume'; client_id: string; last_seq: number }
  | { type: 'ping'; client_id: string };
