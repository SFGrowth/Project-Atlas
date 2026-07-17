/**
 * DataBento DBN Binary Record Parser
 *
 * Parses the DataBento Binary Encoding (DBN) format for the MBP-1 schema.
 * DBN is a fixed-size binary format. Each record starts with a 4-byte header
 * (length + rtype), followed by schema-specific fields.
 *
 * Reference: https://databento.com/docs/schemas-and-data-formats/dbz-encoding
 *
 * Sprint 121 — Atlas Market Data Platform
 * DESIGN NOTE: This parser is implemented but the client is NOT started in Sprint 121.
 */

// ── DBN record type constants ─────────────────────────────────────────────────

/** DBN record type identifiers (rtype field) */
export const DBN_RTYPE = {
  MBP_1: 0x01,        // Market by price, level 1
  OHLCV_1M: 0x11,     // OHLCV 1-minute
  OHLCV_5M: 0x12,     // OHLCV 5-minute
  SYSTEM_MSG: 0x16,   // System message (heartbeat, session start/end)
  SYMBOL_MAPPING: 0x1c, // Symbol mapping message
  ERROR: 0x15,        // Error message
  STATISTICS: 0x18,   // Statistics message
} as const;

/** MBP-1 action codes */
export const DBN_ACTION = {
  MODIFY: 'M',  // Order modify
  TRADE: 'T',   // Trade execution
  FILL: 'F',    // Order fill
  CANCEL: 'C',  // Order cancel
  ADD: 'A',     // Order add
  CLEAR: 'R',   // Clear book
} as const;

/** MBP-1 side codes */
export const DBN_SIDE = {
  ASK: 'A',
  BID: 'B',
  NONE: 'N',
} as const;

/** MBP-1 flags bitmask */
export const DBN_FLAGS = {
  F_LAST: 0x80,   // Last message in a packet (trade is complete)
  F_TOB: 0x40,    // Top-of-book update
  F_SNAPSHOT: 0x20, // Snapshot (not a real-time update)
  F_MBP: 0x10,    // MBP update
} as const;

// ── Record sizes ──────────────────────────────────────────────────────────────

/** Fixed sizes of DBN records in bytes */
export const DBN_RECORD_SIZE = {
  HEADER: 4,          // length (1 byte) + rtype (1 byte) + publisher_id (2 bytes)
  MBP_1: 88,          // Full MBP-1 record (header + body)
  SYMBOL_MAPPING: 176, // SymbolMappingMsg record
  SYSTEM_MSG: 24,     // SystemMsg record
  ERROR_MSG: 72,      // ErrorMsg record
} as const;

// ── Parsed record types ───────────────────────────────────────────────────────

/** Parsed MBP-1 record from DBN binary */
export interface ParsedMbp1Record {
  rtype: number;
  publisherId: number;
  instrumentId: number;
  tsEvent: bigint;      // nanoseconds UTC
  price: bigint;        // fixed-point (÷ 1e9 = USD)
  size: number;
  action: string;       // 'T', 'M', 'A', 'C', 'F', 'R'
  side: string;         // 'A', 'B', 'N'
  flags: number;
  depth: number;
  tsRecv: bigint;       // nanoseconds UTC
  tsInDelta: number;    // nanoseconds (exchange-to-gateway latency)
  sequence: number;
  // Level 0 BBO
  bidPx0: bigint;
  askPx0: bigint;
  bidSz0: number;
  askSz0: number;
  bidCt0: number;
  askCt0: number;
}

/** Parsed SymbolMappingMsg from DBN binary */
export interface ParsedSymbolMappingMsg {
  rtype: number;
  publisherId: number;
  instrumentId: number;
  tsEvent: bigint;
  stype_in_symbol: string;   // Input symbol (e.g. "MNQ.v.0")
  stype_out_symbol: string;  // Output symbol (e.g. "MNQM5")
  start_ts: bigint;
  end_ts: bigint;
}

/** Parsed SystemMsg from DBN binary */
export interface ParsedSystemMsg {
  rtype: number;
  msg: string;
  code: number;
}

// ── Parser class ──────────────────────────────────────────────────────────────

/**
 * DBN stream parser.
 *
 * Maintains an internal buffer and emits complete records as they arrive.
 * Handles partial records across TCP packet boundaries.
 *
 * Usage:
 *   const parser = new DbnParser();
 *   parser.on('mbp1', (record) => { ... });
 *   parser.on('symbolMapping', (msg) => { ... });
 *   socket.on('data', (chunk) => parser.push(chunk));
 */
export class DbnParser {
  private buffer: Buffer = Buffer.alloc(0);
  private listeners: Map<string, Array<(record: unknown) => void>> = new Map();

  /** Register an event listener */
  on(event: string, listener: (data: unknown) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  /** Push a new chunk of data into the parser */
  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.drain();
  }

  /** Reset the parser state (on reconnection) */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          // Prevent one bad handler from breaking the parser
          const errHandlers = this.listeners.get('error');
          if (errHandlers) {
            for (const errHandler of errHandlers) {
              errHandler(err instanceof Error ? err : new Error(String(err)));
            }
          }
        }
      }
    }
  }

  private drain(): void {
    while (this.buffer.length >= DBN_RECORD_SIZE.HEADER) {
      // DBN header: length (1 byte, in 4-byte units), rtype (1 byte), publisher_id (2 bytes)
      const lengthUnits = this.buffer.readUInt8(0);
      const recordBytes = lengthUnits * 4;

      if (recordBytes < DBN_RECORD_SIZE.HEADER) {
        // Malformed record — skip 4 bytes and try to resync
        this.buffer = this.buffer.subarray(4);
        continue;
      }

      if (this.buffer.length < recordBytes) {
        // Incomplete record — wait for more data
        break;
      }

      const record = this.buffer.subarray(0, recordBytes);
      this.buffer = this.buffer.subarray(recordBytes);

      this.parseRecord(record);
    }
  }

  private parseRecord(record: Buffer): void {
    if (record.length < DBN_RECORD_SIZE.HEADER) return;

    const rtype = record.readUInt8(1);
    const publisherId = record.readUInt16LE(2);

    switch (rtype) {
      case DBN_RTYPE.MBP_1:
        this.parseMbp1(record, rtype, publisherId);
        break;
      case DBN_RTYPE.SYMBOL_MAPPING:
        this.parseSymbolMapping(record, rtype, publisherId);
        break;
      case DBN_RTYPE.SYSTEM_MSG:
        this.parseSystemMsg(record, rtype);
        break;
      case DBN_RTYPE.ERROR:
        this.parseErrorMsg(record);
        break;
      // Other record types are silently ignored
    }
  }

  private parseMbp1(record: Buffer, rtype: number, publisherId: number): void {
    if (record.length < DBN_RECORD_SIZE.MBP_1) return;

    try {
      // DBN MBP-1 layout (88 bytes total):
      // [0]  length (1 byte)
      // [1]  rtype (1 byte)
      // [2-3] publisher_id (2 bytes LE)
      // [4-7] instrument_id (4 bytes LE)
      // [8-15] ts_event (8 bytes LE, nanoseconds)
      // [16-23] price (8 bytes LE, fixed-point)
      // [24-27] size (4 bytes LE)
      // [28] action (1 byte, ASCII)
      // [29] side (1 byte, ASCII)
      // [30] flags (1 byte)
      // [31] depth (1 byte)
      // [32-39] ts_recv (8 bytes LE, nanoseconds)
      // [40-43] ts_in_delta (4 bytes LE, nanoseconds)
      // [44-47] sequence (4 bytes LE)
      // [48-55] bid_px_00 (8 bytes LE, fixed-point)
      // [56-63] ask_px_00 (8 bytes LE, fixed-point)
      // [64-67] bid_sz_00 (4 bytes LE)
      // [68-71] ask_sz_00 (4 bytes LE)
      // [72-75] bid_ct_00 (4 bytes LE)
      // [76-79] ask_ct_00 (4 bytes LE)
      // [80-87] padding

      const parsed: ParsedMbp1Record = {
        rtype,
        publisherId,
        instrumentId: record.readUInt32LE(4),
        tsEvent: record.readBigUInt64LE(8),
        price: record.readBigInt64LE(16),
        size: record.readUInt32LE(24),
        action: String.fromCharCode(record.readUInt8(28)),
        side: String.fromCharCode(record.readUInt8(29)),
        flags: record.readUInt8(30),
        depth: record.readUInt8(31),
        tsRecv: record.readBigUInt64LE(32),
        tsInDelta: record.readInt32LE(40),
        sequence: record.readUInt32LE(44),
        bidPx0: record.readBigInt64LE(48),
        askPx0: record.readBigInt64LE(56),
        bidSz0: record.readUInt32LE(64),
        askSz0: record.readUInt32LE(68),
        bidCt0: record.readUInt32LE(72),
        askCt0: record.readUInt32LE(76),
      };

      this.emit('mbp1', parsed);
    } catch (err) {
      this.emit('error', new Error(`MBP-1 parse error: ${err}`));
    }
  }

  private parseSymbolMapping(record: Buffer, rtype: number, publisherId: number): void {
    if (record.length < 32) return;

    try {
      // SymbolMappingMsg layout (variable, minimum 32 bytes):
      // [0-3] header (length, rtype, publisher_id)
      // [4-7] instrument_id (4 bytes LE)
      // [8-15] ts_event (8 bytes LE)
      // [16-87] stype_in_symbol (72 bytes, null-terminated ASCII)
      // [88-159] stype_out_symbol (72 bytes, null-terminated ASCII)
      // [160-167] start_ts (8 bytes LE)
      // [168-175] end_ts (8 bytes LE)

      if (record.length < 176) return;

      const readNullTermString = (buf: Buffer, offset: number, maxLen: number): string => {
        const slice = buf.subarray(offset, offset + maxLen);
        const nullIdx = slice.indexOf(0);
        return slice.subarray(0, nullIdx >= 0 ? nullIdx : maxLen).toString('ascii');
      };

      const parsed: ParsedSymbolMappingMsg = {
        rtype,
        publisherId,
        instrumentId: record.readUInt32LE(4),
        tsEvent: record.readBigUInt64LE(8),
        stype_in_symbol: readNullTermString(record, 16, 72),
        stype_out_symbol: readNullTermString(record, 88, 72),
        start_ts: record.readBigUInt64LE(160),
        end_ts: record.readBigUInt64LE(168),
      };

      this.emit('symbolMapping', parsed);
    } catch (err) {
      this.emit('error', new Error(`SymbolMapping parse error: ${err}`));
    }
  }

  private parseSystemMsg(record: Buffer, rtype: number): void {
    if (record.length < 24) return;

    try {
      // SystemMsg layout (24 bytes):
      // [0-3] header
      // [4-7] instrument_id (4 bytes LE)
      // [8-15] ts_event (8 bytes LE)
      // [16-19] msg (4 bytes, null-terminated ASCII)
      // [20-23] code (4 bytes LE)

      const msg = record.subarray(16, 20).toString('ascii').replace(/\0/g, '');
      const code = record.readUInt32LE(20);

      this.emit('systemMsg', { rtype, msg, code } as ParsedSystemMsg);
    } catch (err) {
      this.emit('error', new Error(`SystemMsg parse error: ${err}`));
    }
  }

  private parseErrorMsg(record: Buffer): void {
    if (record.length < 8) return;

    try {
      const msg = record.subarray(8).toString('ascii').replace(/\0/g, '');
      this.emit('error', new Error(`DataBento error: ${msg}`));
    } catch {
      // ignore
    }
  }
}

// ── Price conversion utilities ────────────────────────────────────────────────

/** Convert DataBento fixed-point price (bigint, ÷ 1e9) to USD float */
export function dbnPriceToUsd(price: bigint): number {
  // DataBento uses 1e9 fixed-point. UNDEF_PRICE = 9223372036854775807n (i64::MAX)
  const UNDEF_PRICE = 9223372036854775807n;
  if (price === UNDEF_PRICE) return NaN;
  return Number(price) / 1_000_000_000;
}

/** Convert DataBento nanosecond timestamp (bigint) to milliseconds (number) */
export function dbnNsToMs(ns: bigint): number {
  return Number(ns / 1_000_000n);
}

/** Check if a DBN record has the F_LAST flag set (trade is complete) */
export function isLastInPacket(flags: number): boolean {
  return (flags & DBN_FLAGS.F_LAST) !== 0;
}

/** Check if a DBN record is a snapshot (not a real-time update) */
export function isSnapshot(flags: number): boolean {
  return (flags & DBN_FLAGS.F_SNAPSHOT) !== 0;
}
