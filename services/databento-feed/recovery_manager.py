"""
Atlas Databento Feed Adapter — Recovery Manager
Sprint 123A.2 Gate G2 Revision 3

Manages the lifecycle of data gap recovery:
- Tracks active gaps per schema
- Coordinates recovery requests to the historical client
- Emits structured recovery events (gap-detected, recovery-requested,
  recovery-started, recovery-progress, recovery-complete, recovery-failed)
- Manages state transitions (DEGRADED → RECOVERING → LIVE)
- Enforces recovery timeout
- Prevents duplicate recovery requests for the same gap

TERMINAL EVENT ROUTING (Revision 3):
- RECOVERY_COMPLETE  → state.completed=True, state.partial=False
                       → on_complete(schema) called
                       → recovery_count incremented
- RECOVERY_PARTIAL   → state.completed=False, state.partial=True
                       → on_complete MUST NOT be called
                       → on_failed(schema) called (partial is unresolved)
                       → recovery_partial_count incremented
                       → unresolved_range retained for downstream visibility
- RECOVERY_FAILED    → state.failed=True, state.partial=False
                       → on_failed(schema) called
                       → recovery_failures incremented

AUTHORITY BOUNDARY
------------------
The RecoveryManager is transport and coordination only.
It MUST NOT:
- construct canonical candles
- trigger processBar or postBarAutomation
- access the Atlas database
- call ADE, strategies, or execution
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable, Coroutine, Dict, Optional, Any

from bridge_records import (
    GapRecord,
    BridgeEnvelope,
    make_gap_detected_record,
    make_recovery_requested_record,
    make_recovery_started_record,
    make_recovery_progress_record,
    make_recovery_complete_record,
    make_recovery_partial_record,
    make_recovery_failed_record,
    make_recovery_id,
    BRIDGE_PROTOCOL_VERSION,
)

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
RECOVERY_TIMEOUT_S: float = 120.0       # 2 minutes max per recovery attempt
PROGRESS_EMIT_INTERVAL: int = 100       # emit progress every N records
MAX_ACTIVE_RECOVERIES: int = 4          # max concurrent schema recoveries


# ── Recovery state ─────────────────────────────────────────────────────────────

@dataclass
class RecoveryState:
    """
    Tracks the state of a single schema recovery.

    Terminal state flags:
        completed:  True only for RECOVERY_COMPLETE (full resolution)
        partial:    True for RECOVERY_PARTIAL (gap not fully resolved)
        failed:     True for RECOVERY_FAILED or RECOVERY_PARTIAL
                    (both are forms of non-completion from the adapter's view)
        cancelled:  True when cancel_recovery() was called

    Unresolved range (set on RECOVERY_PARTIAL):
        unresolved_start_ns: first nanosecond not recovered
        unresolved_end_ns:   last nanosecond not recovered
    """
    recovery_id: str
    schema: str
    gap: GapRecord
    started_at_ms: int
    records_received: int = 0
    last_ts_ns: int = 0
    completed: bool = False
    partial: bool = False
    failed: bool = False
    cancelled: bool = False
    unresolved_start_ns: int = 0
    unresolved_end_ns: int = 0
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)


class RecoveryManager:
    """
    Manages data gap recovery for the Databento feed adapter.

    Responsibilities:
    - Accept gap notifications from the feed adapter
    - Request historical recovery via the provided client coroutine
    - Emit structured recovery events to the bridge queue
    - Track recovery state per schema
    - Enforce recovery timeout
    - Prevent duplicate recoveries for the same gap
    - Report recovery success/failure back to the feed adapter

    Usage:
        manager = RecoveryManager(enqueue_fn=adapter._queue.put)
        await manager.request_recovery(gap)
    """

    def __init__(
        self,
        enqueue_fn: Callable[[dict], Coroutine],
        adapter_instance_id: str = "",
    ) -> None:
        """
        Args:
            enqueue_fn:           Async callable that enqueues a bridge record dict.
            adapter_instance_id:  Unique ID for this adapter instance (for bridge-health).
        """
        self._enqueue = enqueue_fn
        self._adapter_instance_id = adapter_instance_id or str(uuid.uuid4())[:8]
        self._active: Dict[str, RecoveryState] = {}   # schema → RecoveryState
        self._recovery_count: int = 0          # RECOVERY_COMPLETE events
        self._recovery_partial_count: int = 0  # RECOVERY_PARTIAL events
        self._recovery_failures: int = 0       # RECOVERY_FAILED events
        self._lock = asyncio.Lock()

    @property
    def recovery_count(self) -> int:
        """Number of RECOVERY_COMPLETE terminal events received."""
        return self._recovery_count

    @property
    def recovery_partial_count(self) -> int:
        """Number of RECOVERY_PARTIAL terminal events received."""
        return self._recovery_partial_count

    @property
    def recovery_failures(self) -> int:
        """Number of RECOVERY_FAILED terminal events received."""
        return self._recovery_failures

    @property
    def active_schemas(self) -> list:
        return list(self._active.keys())

    def is_recovering(self, schema: str) -> bool:
        """Return True if a recovery is currently active for this schema."""
        state = self._active.get(schema)
        return state is not None and not state.completed and not state.failed and not state.cancelled

    async def request_recovery(
        self,
        gap: GapRecord,
        historical_client: Any,
        on_complete: Optional[Callable[[str], Coroutine]] = None,
        on_failed: Optional[Callable[[str], Coroutine]] = None,
    ) -> None:
        """
        Request historical recovery for a gap.

        This method is non-blocking — it schedules the recovery as an asyncio task.

        Args:
            gap:               The GapRecord describing the missing data range.
            historical_client: DatabentoHistoricalClient or DatabentoReplayClient instance.
            on_complete:       Callback when RECOVERY_COMPLETE is received (receives schema).
                               MUST NOT be called for RECOVERY_PARTIAL.
            on_failed:         Callback when RECOVERY_FAILED or RECOVERY_PARTIAL is received.
        """
        async with self._lock:
            if self.is_recovering(gap.schema):
                logger.info(
                    "[RecoveryManager] Recovery already active for schema=%s — skipping duplicate request",
                    gap.schema,
                )
                return

            if len(self._active) >= MAX_ACTIVE_RECOVERIES:
                logger.warning(
                    "[RecoveryManager] Max active recoveries (%d) reached — deferring schema=%s",
                    MAX_ACTIVE_RECOVERIES,
                    gap.schema,
                )
                return

            state = RecoveryState(
                recovery_id=gap.recovery_id,
                schema=gap.schema,
                gap=gap,
                started_at_ms=int(time.time() * 1000),
            )
            self._active[gap.schema] = state

        # Emit recovery-requested event
        await self._enqueue(make_recovery_requested_record(gap).to_dict())

        # Schedule recovery task
        asyncio.ensure_future(
            self._run_recovery(state, historical_client, on_complete, on_failed)
        )

    async def cancel_recovery(self, schema: str) -> None:
        """Cancel an active recovery for the given schema."""
        state = self._active.get(schema)
        if state and not state.completed and not state.failed:
            state.cancelled = True
            state.cancel_event.set()
            logger.info("[RecoveryManager] Recovery cancelled for schema=%s", schema)

    async def _run_recovery(
        self,
        state: RecoveryState,
        historical_client: Any,
        on_complete: Optional[Callable[[str], Coroutine]],
        on_failed: Optional[Callable[[str], Coroutine]],
    ) -> None:
        """Execute the recovery loop with timeout enforcement."""
        schema = state.schema
        gap = state.gap

        logger.info(
            "[RecoveryManager] Recovery started: schema=%s id=%s range=[%d, %d]",
            schema, state.recovery_id, gap.first_missing_ts_ns, gap.last_missing_ts_ns,
        )

        # Emit recovery-started
        await self._enqueue(
            make_recovery_started_record(
                recovery_id=state.recovery_id,
                schema=schema,
                start_ts_ns=gap.first_missing_ts_ns,
                end_ts_ns=gap.last_missing_ts_ns,
                dataset=gap.dataset,
                raw_symbol=gap.raw_symbol,
                instrument_id=gap.instrument_id,
            ).to_dict()
        )

        try:
            async with asyncio.timeout(RECOVERY_TIMEOUT_S):
                await self._stream_recovery(state, historical_client, on_complete, on_failed)
        except asyncio.TimeoutError:
            logger.error(
                "[RecoveryManager] Recovery timed out after %.0fs: schema=%s id=%s",
                RECOVERY_TIMEOUT_S, schema, state.recovery_id,
            )
            state.failed = True
            self._recovery_failures += 1
            await self._enqueue(
                make_recovery_failed_record(
                    schema=schema,
                    reason=f"Recovery timed out after {RECOVERY_TIMEOUT_S:.0f}s",
                    start_ts_ns=gap.first_missing_ts_ns,
                    end_ts_ns=gap.last_missing_ts_ns,
                    recovery_id=state.recovery_id,
                    error_code="TIMEOUT",
                    dataset=gap.dataset,
                    raw_symbol=gap.raw_symbol,
                    instrument_id=gap.instrument_id,
                ).to_dict()
            )
            if on_failed:
                await on_failed(schema)
        except Exception as exc:
            logger.error(
                "[RecoveryManager] Recovery error: schema=%s id=%s error=%s",
                schema, state.recovery_id, type(exc).__name__,
            )
            state.failed = True
            self._recovery_failures += 1
            await self._enqueue(
                make_recovery_failed_record(
                    schema=schema,
                    reason=f"Unexpected error: {type(exc).__name__}",
                    start_ts_ns=gap.first_missing_ts_ns,
                    end_ts_ns=gap.last_missing_ts_ns,
                    recovery_id=state.recovery_id,
                    error_code="ERROR",
                    dataset=gap.dataset,
                    raw_symbol=gap.raw_symbol,
                    instrument_id=gap.instrument_id,
                ).to_dict()
            )
            if on_failed:
                await on_failed(schema)
        finally:
            async with self._lock:
                self._active.pop(schema, None)

    async def _stream_recovery(
        self,
        state: RecoveryState,
        historical_client: Any,
        on_complete: Optional[Callable[[str], Coroutine]] = None,
        on_failed: Optional[Callable[[str], Coroutine]] = None,
    ) -> None:
        """
        Stream records from the historical client into the bridge queue.

        Terminal event routing:
        - RECOVERY_COMPLETE  → on_complete called, recovery_count++
        - RECOVERY_PARTIAL   → on_failed called, recovery_partial_count++
                               unresolved range retained, on_complete NOT called
        - RECOVERY_FAILED    → on_failed called, recovery_failures++
        """
        schema = state.schema
        gap = state.gap

        # Choose the appropriate recovery method based on schema
        if schema == "ohlcv-1m":
            stream = historical_client.backfill_ohlcv_1m(
                gap.raw_symbol or "MNQ1!",
                gap.first_missing_ts_ns,
                gap.last_missing_ts_ns,
            )
        elif schema == "trades":
            stream = historical_client.replay_trades(
                gap.raw_symbol or "MNQ1!",
                gap.first_missing_ts_ns,
                gap.last_missing_ts_ns,
            )
        elif schema == "definition":
            stream = historical_client.recover_definitions(
                gap.first_missing_ts_ns,
                gap.last_missing_ts_ns,
            )
        elif schema == "symbol-mapping":
            stream = historical_client.recover_symbol_mappings(
                gap.raw_symbol or "MNQ.v.0",
                gap.first_missing_ts_ns,
                gap.last_missing_ts_ns,
            )
        else:
            logger.warning("[RecoveryManager] No recovery method for schema=%s", schema)
            state.completed = True
            return

        async for envelope in stream:
            if state.cancelled:
                logger.info("[RecoveryManager] Recovery cancelled mid-stream: schema=%s", schema)
                return

            # Forward the record to the bridge queue
            await self._enqueue(envelope.to_dict())

            # Track progress
            if envelope.schema not in ("recovery-complete", "recovery-partial", "recovery-failed"):
                state.records_received += 1
                ts_ns = envelope.payload.get("ts_event_ns", 0)
                if ts_ns:
                    state.last_ts_ns = ts_ns

                # Emit progress event periodically
                if state.records_received % PROGRESS_EMIT_INTERVAL == 0:
                    await self._enqueue(
                        make_recovery_progress_record(
                            recovery_id=state.recovery_id,
                            schema=schema,
                            records_received=state.records_received,
                            last_ts_ns=state.last_ts_ns,
                            end_ts_ns=gap.last_missing_ts_ns,
                        ).to_dict()
                    )
            else:
                # ── Terminal event received ──────────────────────────────────
                if envelope.schema == "recovery-complete":
                    # Full resolution: the entire gap was recovered.
                    state.completed = True
                    state.partial = False
                    self._recovery_count += 1
                    logger.info(
                        "[RecoveryManager] Recovery complete: schema=%s id=%s records=%d",
                        schema, state.recovery_id, state.records_received,
                    )

                elif envelope.schema == "recovery-partial":
                    # Partial resolution: the gap was NOT fully resolved.
                    # CRITICAL: on_complete MUST NOT be called.
                    # The unresolved range is retained for downstream re-request.
                    state.completed = False
                    state.partial = True
                    state.failed = True  # partial routes to on_failed
                    state.unresolved_start_ns = envelope.payload.get(
                        "actual_end_ts_ns", gap.first_missing_ts_ns
                    )
                    state.unresolved_end_ns = gap.last_missing_ts_ns
                    self._recovery_partial_count += 1
                    logger.warning(
                        "[RecoveryManager] Recovery partial: schema=%s id=%s records=%d "
                        "unresolved=[%d, %d]",
                        schema, state.recovery_id, state.records_received,
                        state.unresolved_start_ns, state.unresolved_end_ns,
                    )

                elif envelope.schema == "recovery-failed":
                    # Complete failure: no records recovered.
                    state.failed = True
                    state.partial = False
                    self._recovery_failures += 1
                    logger.error(
                        "[RecoveryManager] Recovery failed: schema=%s id=%s reason=%s",
                        schema, state.recovery_id,
                        envelope.payload.get("reason", "unknown"),
                    )

        # ── Callback routing ─────────────────────────────────────────────────
        # on_complete: ONLY called for RECOVERY_COMPLETE (full resolution)
        # on_failed:   called for RECOVERY_PARTIAL and RECOVERY_FAILED
        if state.completed and not state.partial and not state.failed and on_complete:
            await on_complete(schema)
        elif state.failed and on_failed:
            # This covers both RECOVERY_PARTIAL (state.partial=True, state.failed=True)
            # and RECOVERY_FAILED (state.partial=False, state.failed=True)
            await on_failed(schema)
