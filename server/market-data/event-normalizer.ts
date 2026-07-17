/**
 * Atlas Event Normaliser
 *
 * Converts DataBento MBP-1 records into provider-independent Atlas market events.
 * This is the boundary between the DataBento gateway and the rest of Atlas.
 * No downstream consumer should ever see a ParsedMbp1Record.
 *
 * Sprint 121 — Atlas Market Data Platform
 */

import {
  AtlasTradeEvent,
  AtlasQuoteEvent,
  AtlasSymbolMappingEvent,
  DataSource,
} from '../../shared/types/market-events.js';
import {
  ParsedMbp1Record,
  ParsedSymbolMappingMsg,
  DBN_ACTION,
  DBN_FLAGS,
  dbnPriceToUsd,
  dbnNsToMs,
} from './dbn-parser.js';
import { SymbolRegistry } from './symbol-registry.js';

// ── Normaliser class ──────────────────────────────────────────────────────────

export class EventNormalizer {
  private readonly source: DataSource = 'databento';

  constructor(private readonly symbolRegistry: SymbolRegistry) {}

  /**
   * Normalise a parsed MBP-1 record into Atlas trade and/or quote events.
   *
   * A single MBP-1 record may produce:
   * - A trade event (if action === 'T' and F_LAST flag is set)
   * - A quote event (always, if BBO fields are valid)
   *
   * Snapshot records (F_SNAPSHOT flag) are normalised to quote events only.
   */
  normalizeMbp1(record: ParsedMbp1Record): {
    trade: AtlasTradeEvent | null;
    quote: AtlasQuoteEvent | null;
  } {
    const atlasTs = Date.now();
    const tsEvent = dbnNsToMs(record.tsEvent);
    const tsRecv = dbnNsToMs(record.tsRecv);

    const symbol = this.symbolRegistry.getCanonicalSymbol(record.instrumentId);
    if (!symbol) {
      // Unknown instrument — skip (symbol registry not yet populated)
      return { trade: null, quote: null };
    }

    const isSnapshot = (record.flags & DBN_FLAGS.F_SNAPSHOT) !== 0;
    const isLastInPacket = (record.flags & DBN_FLAGS.F_LAST) !== 0;

    // ── Trade event ───────────────────────────────────────────────────────────
    let trade: AtlasTradeEvent | null = null;

    if (record.action === DBN_ACTION.TRADE && isLastInPacket && !isSnapshot) {
      const price = dbnPriceToUsd(record.price);
      if (!isNaN(price) && price > 0) {
        trade = {
          type: 'trade',
          source: this.source,
          symbol,
          price,
          size: record.size,
          side: this.normalizeSide(record.side),
          tsEvent,
          tsRecv,
          atlasTs,
          sequence: record.sequence,
          instrumentId: record.instrumentId,
        };
      }
    }

    // ── Quote event ───────────────────────────────────────────────────────────
    let quote: AtlasQuoteEvent | null = null;

    const bidPx = dbnPriceToUsd(record.bidPx0);
    const askPx = dbnPriceToUsd(record.askPx0);

    if (!isNaN(bidPx) && !isNaN(askPx) && bidPx > 0 && askPx > 0) {
      quote = {
        type: 'quote',
        source: this.source,
        symbol,
        bidPx,
        askPx,
        bidSz: record.bidSz0,
        askSz: record.askSz0,
        bidCt: record.bidCt0,
        askCt: record.askCt0,
        spread: Math.round((askPx - bidPx) * 100) / 100,
        tsEvent,
        tsRecv,
        atlasTs,
        sequence: record.sequence,
        instrumentId: record.instrumentId,
      };
    }

    return { trade, quote };
  }

  /**
   * Normalise a SymbolMappingMsg into an AtlasSymbolMappingEvent.
   */
  normalizeSymbolMapping(msg: ParsedSymbolMappingMsg): AtlasSymbolMappingEvent {
    const atlasTs = Date.now();

    // The stype_out_symbol is the raw contract symbol (e.g. "MNQM5")
    // Map it to the Atlas canonical symbol (e.g. "MNQ1!")
    const rawSymbol = msg.stype_out_symbol || msg.stype_in_symbol;
    const canonicalSymbol = this.symbolRegistry.getCanonicalSymbolFromRaw(rawSymbol);

    return {
      type: 'symbol_mapping',
      source: this.source,
      instrumentId: msg.instrumentId,
      rawSymbol,
      canonicalSymbol: canonicalSymbol ?? rawSymbol,
      startTs: dbnNsToMs(msg.start_ts),
      endTs: msg.end_ts === 0n ? 0 : dbnNsToMs(msg.end_ts),
      atlasTs,
    };
  }

  private normalizeSide(side: string): 'B' | 'S' | 'N' {
    if (side === 'A') return 'S'; // Ask side = sell aggressor
    if (side === 'B') return 'B'; // Bid side = buy aggressor
    return 'N';
  }
}
