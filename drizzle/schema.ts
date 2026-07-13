import {
  bigint,
  datetime,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  date,
  boolean,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Pipeline reports table — stores every accepted M-15 PipelineReport payload.
 */
export const pipelineReports = mysqlTable("pipeline_reports", {
  id: varchar("id", { length: 64 }).primaryKey(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  barTime: varchar("bar_time", { length: 32 }),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  masterState: varchar("master_state", { length: 32 }),
  pipelineRunId: varchar("pipeline_run_id", { length: 128 }),
  ingestionLatencyMs: bigint("ingestion_latency_ms", { mode: "number" }),
  payload: json("payload").notNull(),
});

export type PipelineReport = typeof pipelineReports.$inferSelect;
export type InsertPipelineReport = typeof pipelineReports.$inferInsert;

/**
 * Paper trades table — simulated positions created from pipeline reports.
 * No broker connection. Paper mode only.
 */
export const paperTrades = mysqlTable("paper_trades", {
  id: varchar("id", { length: 64 }).primaryKey(),
  account: varchar("account", { length: 64 }).notNull().default("ATLAS_MNQ_PAPER"),
  symbol: varchar("symbol", { length: 16 }).notNull().default("MNQ1!"),
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  model: varchar("model", { length: 16 }).notNull(), // A1, A3, B1
  status: mysqlEnum("status", ["OPEN", "CLOSED", "CANCELLED"]).notNull().default("OPEN"),
  // Entry / exit
  entry: decimal("entry", { precision: 12, scale: 4 }),
  stop: decimal("stop", { precision: 12, scale: 4 }),
  target: decimal("target", { precision: 12, scale: 4 }),
  exitPrice: decimal("exit_price", { precision: 12, scale: 4 }),
  exitReason: varchar("exit_reason", { length: 64 }), // TARGET_HIT, STOP_HIT, MANUAL, TIMEOUT
  // Size & risk
  contracts: int("contracts").default(1),
  riskDollars: decimal("risk_dollars", { precision: 10, scale: 2 }),
  // P&L
  pnl: decimal("pnl", { precision: 10, scale: 2 }),
  currentR: decimal("current_r", { precision: 8, scale: 4 }),
  mfe: decimal("mfe", { precision: 10, scale: 2 }), // max favourable excursion
  mae: decimal("mae", { precision: 10, scale: 2 }), // max adverse excursion
  // Timing
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  tradeDurationMs: bigint("trade_duration_ms", { mode: "number" }),
  // Pipeline context
  pipelineRunId: varchar("pipeline_run_id", { length: 128 }),
  edgeScore: decimal("edge_score", { precision: 6, scale: 4 }),
  adeDecision: varchar("ade_decision", { length: 32 }),
  ariDecision: varchar("ari_decision", { length: 32 }),
  tvlDecision: varchar("tvl_decision", { length: 32 }),
  brainView: text("brain_view"),
  // Notes
  notes: text("notes"),
  replayBarIndex: int("replay_bar_index"),
});

export type PaperTrade = typeof paperTrades.$inferSelect;
export type InsertPaperTrade = typeof paperTrades.$inferInsert;

/**
 * Journal days table — daily aggregated stats per account.
 * One row per (date, account) pair.
 */
export const journalDays = mysqlTable("journal_days", {
  id: int("id").autoincrement().primaryKey(),
  tradeDate: date("trade_date").notNull(),
  account: varchar("account", { length: 64 }).notNull().default("ATLAS_MNQ_PAPER"),
  totalTrades: int("total_trades").default(0),
  wins: int("wins").default(0),
  losses: int("losses").default(0),
  breakevens: int("breakevens").default(0),
  dailyPnl: decimal("daily_pnl", { precision: 10, scale: 2 }).default("0"),
  dailyR: decimal("daily_r", { precision: 8, scale: 4 }).default("0"),
  profitFactor: decimal("profit_factor", { precision: 8, scale: 4 }),
  winRate: decimal("win_rate", { precision: 6, scale: 4 }),
  largestWinner: decimal("largest_winner", { precision: 10, scale: 2 }),
  largestLoser: decimal("largest_loser", { precision: 10, scale: 2 }),
  modelsTraded: varchar("models_traded", { length: 64 }), // comma-separated e.g. "A1,A3"
  ariInterventions: int("ari_interventions").default(0),
  tvlInterventions: int("tvl_interventions").default(0),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type JournalDay = typeof journalDays.$inferSelect;
export type InsertJournalDay = typeof journalDays.$inferInsert;

/**
 * System health events — tracks connectivity and error events.
 */
export const systemHealthEvents = mysqlTable("system_health_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  // e.g. WEBHOOK_RECEIVED, WEBHOOK_FAILURE, SSE_CONNECTED, SSE_DISCONNECTED,
  //      DB_OK, DB_ERROR, ATLAS_ONLINE, ATLAS_OFFLINE, TV_DISCONNECTED
  severity: mysqlEnum("severity", ["INFO", "WARN", "ERROR"]).notNull().default("INFO"),
  message: text("message"),
  metadata: json("metadata"),
  ts: timestamp("ts").defaultNow().notNull(),
});

export type SystemHealthEvent = typeof systemHealthEvents.$inferSelect;
export type InsertSystemHealthEvent = typeof systemHealthEvents.$inferInsert;

/**
 * Notification log — tracks every push notification sent to the owner.
 */
export const notificationLog = mysqlTable("notification_log", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 64 }).notNull(),
  // TRADE_OPENED, TRADE_CLOSED, TARGET_HIT, STOP_HIT, ARI_REJECTION,
  // CIRCUIT_BREAKER, SYSTEM_OFFLINE, WEBHOOK_FAILURE, TV_DISCONNECTED,
  // BACKEND_OFFLINE, ATLAS_ONLINE
  title: varchar("title", { length: 128 }).notNull(),
  body: text("body"),
  delivered: boolean("delivered").default(false),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  metadata: json("metadata"),
});

export type NotificationLog = typeof notificationLog.$inferSelect;
export type InsertNotificationLog = typeof notificationLog.$inferInsert;

/**
 * ADE v2 Trade Records — Self-Learning Framework (SLF)
 * One row per closed paper trade with full Edge Attribution Record.
 * Used by the Dimension Correlation Report (every 50 trades per model).
 */
export const adeTradeRecords = mysqlTable("ade_trade_records", {
  id: int("id").autoincrement().primaryKey(),
  tradeId: varchar("trade_id", { length: 64 }).notNull().unique(),
  model: varchar("model", { length: 16 }).notNull(), // A1, A3, B1
  adeVersion: varchar("ade_version", { length: 16 }).notNull().default("2.0.0"),
  // Outcome
  outcome: mysqlEnum("outcome", ["WIN", "LOSS", "BREAKEVEN"]).notNull(),
  rMultiple: decimal("r_multiple", { precision: 8, scale: 4 }),
  pnl: decimal("pnl", { precision: 10, scale: 2 }),
  // ADE v2 normalised score
  normScore: decimal("norm_score", { precision: 6, scale: 2 }),
  confidence: varchar("confidence", { length: 16 }), // HIGH, MEDIUM, LOW
  // Dimension scores (raw pts)
  dMs01: decimal("d_ms01", { precision: 6, scale: 2 }),
  dMs02: decimal("d_ms02", { precision: 6, scale: 2 }),
  dMs03: decimal("d_ms03", { precision: 6, scale: 2 }),
  dMs04: decimal("d_ms04", { precision: 6, scale: 2 }),
  dMs05: decimal("d_ms05", { precision: 6, scale: 2 }),
  dEq01: decimal("d_eq01", { precision: 6, scale: 2 }),
  dEq02: decimal("d_eq02", { precision: 6, scale: 2 }),
  dEq03: decimal("d_eq03", { precision: 6, scale: 2 }),
  dTc01: decimal("d_tc01", { precision: 6, scale: 2 }),
  dTc02: decimal("d_tc02", { precision: 6, scale: 2 }),
  dSi01: decimal("d_si01", { precision: 6, scale: 2 }),
  dSi02: decimal("d_si02", { precision: 6, scale: 2 }),
  dSi03: decimal("d_si03", { precision: 6, scale: 2 }),
  dCr01: decimal("d_cr01", { precision: 6, scale: 2 }),
  dCr02: decimal("d_cr02", { precision: 6, scale: 2 }),
  rawScore: decimal("raw_score", { precision: 8, scale: 2 }),
  rawMax: decimal("raw_max", { precision: 8, scale: 2 }),
  // Context
  session: varchar("session", { length: 32 }),
  dow: int("dow"),
  adx14: decimal("adx14", { precision: 8, scale: 4 }),
  atr14: decimal("atr14", { precision: 12, scale: 4 }),
  volcomp: decimal("volcomp", { precision: 8, scale: 4 }),
  // Timing
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdeTradeRecord = typeof adeTradeRecords.$inferSelect;
export type InsertAdeTradeRecord = typeof adeTradeRecords.$inferInsert;

/**
 * ADE Version Governance — immutable audit log of every ADE version change.
 * Every weight or threshold change must be recorded here with full justification.
 */
export const adeVersionGovernance = mysqlTable("ade_version_governance", {
  id: int("id").autoincrement().primaryKey(),
  version: varchar("version", { length: 16 }).notNull(), // e.g. "2.0.0"
  sprintNumber: int("sprint_number").notNull(),
  changeType: mysqlEnum("change_type", ["INITIAL", "WEIGHT_CHANGE", "DIMENSION_ADD", "DIMENSION_REMOVE", "THRESHOLD_CHANGE", "BUGFIX"]).notNull(),
  description: text("description").notNull(),
  // Validation evidence
  tradesAnalysed: int("trades_analysed"),
  pfBefore: decimal("pf_before", { precision: 8, scale: 4 }),
  pfAfter: decimal("pf_after", { precision: 8, scale: 4 }),
  mcPassRateBefore: decimal("mc_pass_rate_before", { precision: 6, scale: 4 }),
  mcPassRateAfter: decimal("mc_pass_rate_after", { precision: 6, scale: 4 }),
  approvedBy: varchar("approved_by", { length: 64 }).notNull().default("OWNER"),
  // Immutable — no updatedAt
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdeVersionGovernance = typeof adeVersionGovernance.$inferSelect;
export type InsertAdeVersionGovernance = typeof adeVersionGovernance.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 088 — SB1 REGIME INTELLIGENCE & FORWARD VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SB1 paper trades — simulated SB1 Slow Burn positions during forward validation.
 * Isolated from A1/A3/B1 paper trades. No live account connection.
 * Governance: SB1 is LIVE ACCOUNT ONLY — no prop firm evaluation.
 */
export const sb1PaperTrades = mysqlTable("sb1_paper_trades", {
  id: varchar("id", { length: 64 }).primaryKey(),
  // Trade metadata
  symbol: varchar("symbol", { length: 16 }).notNull().default("MNQ1!"),
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  status: mysqlEnum("status", ["OPEN", "CLOSED", "CANCELLED"]).notNull().default("OPEN"),
  // Entry / exit
  entry: decimal("entry", { precision: 12, scale: 4 }),
  stop: decimal("stop", { precision: 12, scale: 4 }),
  target: decimal("target", { precision: 12, scale: 4 }),
  exitPrice: decimal("exit_price", { precision: 12, scale: 4 }),
  exitReason: varchar("exit_reason", { length: 64 }),
  // Size & risk
  contracts: int("contracts").default(1),
  riskDollars: decimal("risk_dollars", { precision: 10, scale: 2 }),
  // P&L
  pnl: decimal("pnl", { precision: 10, scale: 2 }),
  rMultiple: decimal("r_multiple", { precision: 8, scale: 4 }),
  mfe: decimal("mfe", { precision: 10, scale: 2 }),
  mae: decimal("mae", { precision: 10, scale: 2 }),
  // Timing
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  holdingTimeMs: bigint("holding_time_ms", { mode: "number" }),
  session: varchar("session", { length: 32 }),
  dow: int("dow"),
  // Regime context at entry
  ras: decimal("ras", { precision: 6, scale: 2 }),
  rasActivated: boolean("ras_activated").default(false),
  regimeCluster: int("regime_cluster"),
  // RAS component scores at entry (0–100 each normalised)
  rasC1PdRangeAtr: decimal("ras_c1_pd_range_atr", { precision: 6, scale: 2 }),
  rasC2PdPosition: decimal("ras_c2_pd_position", { precision: 6, scale: 2 }),
  rasC3OvernightGap: decimal("ras_c3_overnight_gap", { precision: 6, scale: 2 }),
  rasC4Chop: decimal("ras_c4_chop", { precision: 6, scale: 2 }),
  rasC5AtrExpansion: decimal("ras_c5_atr_expansion", { precision: 6, scale: 2 }),
  rasC6VwapDist: decimal("ras_c6_vwap_dist", { precision: 6, scale: 2 }),
  rasC7EmaSlope: decimal("ras_c7_ema_slope", { precision: 6, scale: 2 }),
  rasC8EmaDist: decimal("ras_c8_ema_dist", { precision: 6, scale: 2 }),
  rasC9TrendPers: decimal("ras_c9_trend_pers", { precision: 6, scale: 2 }),
  // Raw feature values at entry
  featurePdRangeAtr: decimal("feature_pd_range_atr", { precision: 8, scale: 4 }),
  featurePdPosition: decimal("feature_pd_position", { precision: 8, scale: 4 }),
  featureOvernightGap: decimal("feature_overnight_gap", { precision: 8, scale: 4 }),
  featureChop: decimal("feature_chop", { precision: 8, scale: 4 }),
  featureAtrExpansion: decimal("feature_atr_expansion", { precision: 8, scale: 4 }),
  featureVwapDist: decimal("feature_vwap_dist", { precision: 8, scale: 4 }),
  featureEmaSlope: decimal("feature_ema_slope", { precision: 8, scale: 4 }),
  featureEmaDist: decimal("feature_ema_dist", { precision: 8, scale: 4 }),
  featureTrendPers: decimal("feature_trend_pers", { precision: 8, scale: 4 }),
  // Pipeline context
  pipelineRunId: varchar("pipeline_run_id", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Sb1PaperTrade = typeof sb1PaperTrades.$inferSelect;
export type InsertSb1PaperTrade = typeof sb1PaperTrades.$inferInsert;

/**
 * SB1 rejected signals — entries that were suppressed by the RAS filter.
 * Records the reason for suppression for daily review analysis.
 */
export const sb1RejectedSignals = mysqlTable("sb1_rejected_signals", {
  id: int("id").autoincrement().primaryKey(),
  barTime: varchar("bar_time", { length: 32 }).notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull().default("MNQ1!"),
  direction: mysqlEnum("direction", ["LONG", "SHORT"]).notNull(),
  // RAS at rejection
  ras: decimal("ras", { precision: 6, scale: 2 }).notNull(),
  rejectionReason: varchar("rejection_reason", { length: 128 }).notNull(),
  // e.g. "RAS_BELOW_THRESHOLD", "CHOP_CONFIRMED", "NARROW_PRIOR_DAY", "ATR_CONTRACTING", "NEAR_VWAP"
  // Feature values
  featurePdRangeAtr: decimal("feature_pd_range_atr", { precision: 8, scale: 4 }),
  featureChop: decimal("feature_chop", { precision: 8, scale: 4 }),
  featureAtrExpansion: decimal("feature_atr_expansion", { precision: 8, scale: 4 }),
  featureVwapDist: decimal("feature_vwap_dist", { precision: 8, scale: 4 }),
  // Would-have outcome (filled in retrospectively if known)
  hypotheticalPnl: decimal("hypothetical_pnl", { precision: 10, scale: 2 }),
  hypotheticalOutcome: varchar("hypothetical_outcome", { length: 16 }),
  pipelineRunId: varchar("pipeline_run_id", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Sb1RejectedSignal = typeof sb1RejectedSignals.$inferSelect;
export type InsertSb1RejectedSignal = typeof sb1RejectedSignals.$inferInsert;

/**
 * SB1 RAS snapshots — per-bar RAS with all 9 component scores.
 * Used for Observatory display and regime fingerprint analysis.
 */
export const sb1RasSnapshots = mysqlTable("sb1_ras_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  barTime: varchar("bar_time", { length: 32 }).notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull().default("MNQ1!"),
  // Composite RAS
  ras: decimal("ras", { precision: 6, scale: 2 }).notNull(),
  rasActivated: boolean("ras_activated").notNull().default(false),
  activationReason: varchar("activation_reason", { length: 128 }),
  // Raw feature values
  featurePdRangeAtr: decimal("feature_pd_range_atr", { precision: 8, scale: 4 }),
  featurePdPosition: decimal("feature_pd_position", { precision: 8, scale: 4 }),
  featureOvernightGap: decimal("feature_overnight_gap", { precision: 8, scale: 4 }),
  featureChop: decimal("feature_chop", { precision: 8, scale: 4 }),
  featureAtrExpansion: decimal("feature_atr_expansion", { precision: 8, scale: 4 }),
  featureVwapDist: decimal("feature_vwap_dist", { precision: 8, scale: 4 }),
  featureEmaSlope: decimal("feature_ema_slope", { precision: 8, scale: 4 }),
  featureEmaDist: decimal("feature_ema_dist", { precision: 8, scale: 4 }),
  featureTrendPers: decimal("feature_trend_pers", { precision: 8, scale: 4 }),
  pipelineRunId: varchar("pipeline_run_id", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Sb1RasSnapshot = typeof sb1RasSnapshots.$inferSelect;
export type InsertSb1RasSnapshot = typeof sb1RasSnapshots.$inferInsert;

/**
 * Daily reviews — permanent archive of every Atlas daily self-review report.
 * Generated automatically at 4:30 PM ET by the Heartbeat scheduler.
 * One row per trading day. Never deleted.
 */
export const dailyReviews = mysqlTable("daily_reviews", {
  id: int("id").autoincrement().primaryKey(),
  reviewDate: date("review_date").notNull(),
  // Generation metadata
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  generatedBy: varchar("generated_by", { length: 32 }).notNull().default("HEARTBEAT"),
  // e.g. "HEARTBEAT", "MANUAL", "AGENT"
  generationStatus: mysqlEnum("generation_status", ["SUCCESS", "PARTIAL", "FAILED"]).notNull().default("SUCCESS"),
  generationError: text("generation_error"),
  // Trading summary (denormalised for fast display)
  totalTrades: int("total_trades").default(0),
  winningTrades: int("winning_trades").default(0),
  losingTrades: int("losing_trades").default(0),
  netPnl: decimal("net_pnl", { precision: 10, scale: 2 }),
  grossProfit: decimal("gross_profit", { precision: 10, scale: 2 }),
  grossLoss: decimal("gross_loss", { precision: 10, scale: 2 }),
  winRate: decimal("win_rate", { precision: 6, scale: 4 }),
  expectancy: decimal("expectancy", { precision: 10, scale: 2 }),
  largestWinner: decimal("largest_winner", { precision: 10, scale: 2 }),
  largestLoser: decimal("largest_loser", { precision: 10, scale: 2 }),
  // Full report JSON (all 5 sections)
  reportJson: json("report_json").notNull(),
  // Notification status
  notificationSent: boolean("notification_sent").default(false),
  notificationSentAt: timestamp("notification_sent_at"),
});
export type DailyReview = typeof dailyReviews.$inferSelect;
export type InsertDailyReview = typeof dailyReviews.$inferInsert;

/**
 * Rolling performance — pre-computed rolling stats for fast dashboard display.
 * Updated by the daily review scheduler. One row per window per review date.
 */
export const rollingPerformance = mysqlTable("rolling_performance", {
  id: int("id").autoincrement().primaryKey(),
  reviewDate: date("review_date").notNull(),
  window: mysqlEnum("window", ["7D", "30D", "90D", "LIFETIME"]).notNull(),
  // Core metrics
  tradeCount: int("trade_count").default(0),
  winCount: int("win_count").default(0),
  lossCount: int("loss_count").default(0),
  winRate: decimal("win_rate", { precision: 6, scale: 4 }),
  profitFactor: decimal("profit_factor", { precision: 8, scale: 4 }),
  expectancy: decimal("expectancy", { precision: 10, scale: 2 }),
  avgR: decimal("avg_r", { precision: 8, scale: 4 }),
  netPnl: decimal("net_pnl", { precision: 10, scale: 2 }),
  maxDrawdown: decimal("max_drawdown", { precision: 10, scale: 2 }),
  // SB1-specific
  sb1TradeCount: int("sb1_trade_count").default(0),
  sb1WinRate: decimal("sb1_win_rate", { precision: 6, scale: 4 }),
  sb1ProfitFactor: decimal("sb1_profit_factor", { precision: 8, scale: 4 }),
  sb1NetPnl: decimal("sb1_net_pnl", { precision: 10, scale: 2 }),
  sb1AvgRas: decimal("sb1_avg_ras", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type RollingPerformance = typeof rollingPerformance.$inferSelect;
export type InsertRollingPerformance = typeof rollingPerformance.$inferInsert;

/**
 * Atlas scheduled jobs — registry of all Heartbeat cron jobs.
 * Permanent scheduling service. Survives sandbox hibernation.
 */
export const atlasScheduledJobs = mysqlTable("atlas_scheduled_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobName: varchar("job_name", { length: 64 }).notNull().unique(),
  // e.g. "daily-review", "weekly-review", "monthly-review", "mc-refresh"
  description: text("description"),
  cronExpression: varchar("cron_expression", { length: 64 }).notNull(),
  callbackPath: varchar("callback_path", { length: 128 }).notNull(),
  // Heartbeat platform task UID (returned by manus-heartbeat create)
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  isEnabled: boolean("is_enabled").default(true),
  // Execution tracking
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 32 }),
  lastRunDurationMs: int("last_run_duration_ms"),
  totalRuns: int("total_runs").default(0),
  successfulRuns: int("successful_runs").default(0),
  failedRuns: int("failed_runs").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type AtlasScheduledJob = typeof atlasScheduledJobs.$inferSelect;
export type InsertAtlasScheduledJob = typeof atlasScheduledJobs.$inferInsert;

// ─── Sprint 089 — ARD Feature Store & Project ORACLE ─────────────────────────

/**
 * ARD Bar Observations — every confirmed MNQ 5-minute candle.
 * Constitutional requirement: Law 5 — Every Five-Minute Candle Is a Research Event.
 * Stores complete market-state snapshot for ORACLE and ARD pattern discovery.
 */
export const ardBarObservations = mysqlTable("ard_bar_observations", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  // Identity
  barTime: datetime("bar_time").notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull().default("MNQ1!"),
  timeframe: varchar("timeframe", { length: 8 }).notNull().default("5"),
  eventId: varchar("event_id", { length: 64 }).unique(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).unique(),
  // Session & time context
  session: varchar("session", { length: 16 }),
  dayOfWeek: varchar("day_of_week", { length: 16 }),
  // OHLCV
  open: decimal("open", { precision: 12, scale: 4 }),
  high: decimal("high", { precision: 12, scale: 4 }),
  low: decimal("low", { precision: 12, scale: 4 }),
  close: decimal("close", { precision: 12, scale: 4 }),
  volume: int("volume"),
  // Core indicators
  atr: decimal("atr", { precision: 10, scale: 4 }),
  adx: decimal("adx", { precision: 8, scale: 4 }),
  chop: decimal("chop", { precision: 8, scale: 4 }),
  vwap: decimal("vwap", { precision: 12, scale: 4 }),
  rsi: decimal("rsi", { precision: 8, scale: 4 }),
  // EMA values
  ema9: decimal("ema9", { precision: 12, scale: 4 }),
  ema21: decimal("ema21", { precision: 12, scale: 4 }),
  ema50: decimal("ema50", { precision: 12, scale: 4 }),
  ema200: decimal("ema200", { precision: 12, scale: 4 }),
  // EMA slopes (price per bar)
  ema9Slope: decimal("ema9_slope", { precision: 10, scale: 6 }),
  ema21Slope: decimal("ema21_slope", { precision: 10, scale: 6 }),
  ema50Slope: decimal("ema50_slope", { precision: 10, scale: 6 }),
  // Trend & regime
  trendDirection: varchar("trend_direction", { length: 8 }),
  emaAlignment: varchar("ema_alignment", { length: 16 }),
  volatilityState: varchar("volatility_state", { length: 16 }),
  compressionState: varchar("compression_state", { length: 16 }),
  regimeClassification: varchar("regime_classification", { length: 32 }),
  // Previous-day & overnight structure
  prevDayHigh: decimal("prev_day_high", { precision: 12, scale: 4 }),
  prevDayLow: decimal("prev_day_low", { precision: 12, scale: 4 }),
  prevDayClose: decimal("prev_day_close", { precision: 12, scale: 4 }),
  prevDayRange: decimal("prev_day_range", { precision: 10, scale: 4 }),
  overnightGap: decimal("overnight_gap", { precision: 10, scale: 4 }),
  priceVsPrevDay: varchar("price_vs_prev_day", { length: 16 }),
  // Model eligibility & scores
  a1Eligible: boolean("a1_eligible").default(false),
  a3Eligible: boolean("a3_eligible").default(false),
  b1Eligible: boolean("b1_eligible").default(false),
  sb1Eligible: boolean("sb1_eligible").default(false),
  adeEdgeScore: decimal("ade_edge_score", { precision: 8, scale: 4 }),
  adeCandidate: varchar("ade_candidate", { length: 8 }),
  ariDecision: varchar("ari_decision", { length: 16 }),
  tvlDecision: varchar("tvl_decision", { length: 16 }),
  sb1Ras: decimal("sb1_ras", { precision: 6, scale: 2 }),
  sb1RasActivated: boolean("sb1_ras_activated").default(false),
  // Active position state
  hasOpenPosition: boolean("has_open_position").default(false),
  openPositionDirection: varchar("open_position_direction", { length: 8 }),
  openPositionEntry: decimal("open_position_entry", { precision: 12, scale: 4 }),
  openPositionUnrealizedPnl: decimal("open_position_unrealized_pnl", { precision: 10, scale: 2 }),
  // Pipeline health
  pipelineRunId: varchar("pipeline_run_id", { length: 64 }),
  pipelineHealth: varchar("pipeline_health", { length: 16 }),
  // Metadata
  schemaVersion: varchar("schema_version", { length: 16 }).default("1.0.0"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});
export type ArdBarObservation = typeof ardBarObservations.$inferSelect;
export type InsertArdBarObservation = typeof ardBarObservations.$inferInsert;

/**
 * ARD Research Candidates — autonomous discovery of market behaviours.
 * Constitution Part VI §3: Candidate Research Record.
 */
export const ardCandidates = mysqlTable("ard_candidates", {
  id: int("id").autoincrement().primaryKey(),
  candidateId: varchar("candidate_id", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 128 }).notNull(),
  discoveryDate: date("discovery_date").notNull(),
  hypothesis: text("hypothesis").notNull(),
  direction: varchar("direction", { length: 16 }),
  horizon: varchar("horizon", { length: 32 }),
  featureDefinition: text("feature_definition"),
  occurrences: int("occurrences").default(0),
  sampleSize: int("sample_size").default(0),
  supportingEvidence: text("supporting_evidence"),
  contradictingEvidence: text("contradicting_evidence"),
  estimatedEffectSize: decimal("estimated_effect_size", { precision: 8, scale: 4 }),
  noveltyScore: decimal("novelty_score", { precision: 6, scale: 4 }),
  portfolioFit: varchar("portfolio_fit", { length: 32 }),
  riskConcerns: text("risk_concerns"),
  requiredValidation: text("required_validation"),
  status: varchar("status", { length: 16 }).notNull().default("Observed"),
  promotedToModel: varchar("promoted_to_model", { length: 16 }),
  rejectionReason: text("rejection_reason"),
  priorityScore: decimal("priority_score", { precision: 6, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ArdCandidate = typeof ardCandidates.$inferSelect;
export type InsertArdCandidate = typeof ardCandidates.$inferInsert;

/**
 * ORACLE Predictions — immutable prediction record created at trade approval.
 * Constitution Part V §2. Must be created BEFORE the outcome is known.
 */
export const oraclePredictions = mysqlTable("oracle_predictions", {
  id: int("id").autoincrement().primaryKey(),
  predictionId: varchar("prediction_id", { length: 64 }).notNull().unique(),
  tradeId: varchar("trade_id", { length: 64 }),
  modelId: varchar("model_id", { length: 16 }),
  timestamp: datetime("timestamp").notNull(),
  direction: varchar("direction", { length: 8 }),
  entryPrice: decimal("entry_price", { precision: 12, scale: 4 }),
  stopPrice: decimal("stop_price", { precision: 12, scale: 4 }),
  targetPrice: decimal("target_price", { precision: 12, scale: 4 }),
  expectedWinProb: decimal("expected_win_prob", { precision: 6, scale: 4 }),
  expectedR: decimal("expected_r", { precision: 8, scale: 4 }),
  expectedHoldingTimeMin: int("expected_holding_time_min"),
  expectedMfe: decimal("expected_mfe", { precision: 10, scale: 4 }),
  expectedMae: decimal("expected_mae", { precision: 10, scale: 4 }),
  expectedExitType: varchar("expected_exit_type", { length: 32 }),
  expectedTrendDuration: varchar("expected_trend_duration", { length: 32 }),
  expectedVolatility: varchar("expected_volatility", { length: 16 }),
  expectedRegime: varchar("expected_regime", { length: 32 }),
  adeEdgeScore: decimal("ade_edge_score", { precision: 8, scale: 4 }),
  ariState: varchar("ari_state", { length: 16 }),
  tvlStatus: varchar("tvl_status", { length: 16 }),
  sb1Ras: decimal("sb1_ras", { precision: 6, scale: 2 }),
  topContributors: text("top_contributors"),
  reasoningSummary: text("reasoning_summary"),
  atlasVersion: varchar("atlas_version", { length: 32 }),
  gitCommit: varchar("git_commit", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type OraclePrediction = typeof oraclePredictions.$inferSelect;
export type InsertOraclePrediction = typeof oraclePredictions.$inferInsert;

/**
 * ORACLE Reality Records — actual outcome recorded at trade closure.
 * Constitution Part V §3.
 */
export const oracleReality = mysqlTable("oracle_reality", {
  id: int("id").autoincrement().primaryKey(),
  predictionId: varchar("prediction_id", { length: 64 }).notNull().unique(),
  tradeId: varchar("trade_id", { length: 64 }),
  actualResult: varchar("actual_result", { length: 16 }),
  actualR: decimal("actual_r", { precision: 8, scale: 4 }),
  actualPnl: decimal("actual_pnl", { precision: 10, scale: 2 }),
  actualHoldingTimeMin: int("actual_holding_time_min"),
  actualMfe: decimal("actual_mfe", { precision: 10, scale: 4 }),
  actualMae: decimal("actual_mae", { precision: 10, scale: 4 }),
  actualExitType: varchar("actual_exit_type", { length: 32 }),
  actualRegimeEvolution: text("actual_regime_evolution"),
  actualVolatility: varchar("actual_volatility", { length: 16 }),
  actualSessionBehaviour: text("actual_session_behaviour"),
  unexpectedEvents: text("unexpected_events"),
  dataQualityIssues: text("data_quality_issues"),
  executionIssues: text("execution_issues"),
  rError: decimal("r_error", { precision: 8, scale: 4 }),
  holdingTimeError: int("holding_time_error"),
  mfeError: decimal("mfe_error", { precision: 10, scale: 4 }),
  maeError: decimal("mae_error", { precision: 10, scale: 4 }),
  regimeMatchCorrect: boolean("regime_match_correct"),
  exitTypeMatchCorrect: boolean("exit_type_match_correct"),
  winProbCalibrationBin: decimal("win_prob_calibration_bin", { precision: 6, scale: 4 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type OracleReality = typeof oracleReality.$inferSelect;
export type InsertOracleReality = typeof oracleReality.$inferInsert;

/**
 * ORACLE Scores — calibration metrics and Oracle Score by model/regime/portfolio.
 * Constitution Part V §5: Oracle Score (7 components, weighted).
 */
export const oracleScores = mysqlTable("oracle_scores", {
  id: int("id").autoincrement().primaryKey(),
  scoreDate: date("score_date").notNull(),
  modelId: varchar("model_id", { length: 16 }).notNull(),
  windowType: varchar("window_type", { length: 16 }).notNull(),
  calibrationAccuracy: decimal("calibration_accuracy", { precision: 6, scale: 2 }),
  predictionAccuracy: decimal("prediction_accuracy", { precision: 6, scale: 2 }),
  reasoningConsistency: decimal("reasoning_consistency", { precision: 6, scale: 2 }),
  regimeRecognition: decimal("regime_recognition", { precision: 6, scale: 2 }),
  confidenceReliability: decimal("confidence_reliability", { precision: 6, scale: 2 }),
  decisionQuality: decimal("decision_quality", { precision: 6, scale: 2 }),
  reportCompleteness: decimal("report_completeness", { precision: 6, scale: 2 }),
  oracleScore: decimal("oracle_score", { precision: 6, scale: 2 }),
  brierScore: decimal("brier_score", { precision: 8, scale: 6 }),
  logLoss: decimal("log_loss", { precision: 8, scale: 6 }),
  expectedCalibrationError: decimal("expected_calibration_error", { precision: 8, scale: 6 }),
  tradeCount: int("trade_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type OracleScore = typeof oracleScores.$inferSelect;
export type InsertOracleScore = typeof oracleScores.$inferInsert;

/**
 * ATLAS MEMORY — Sprint 089A
 * Permanent, immutable record of every confirmed 5-minute MNQ candle.
 * Constitutional basis: Atlas Constitution v1.0 — Law 5 + Atlas Memory Amendment.
 * "Every confirmed five-minute candle represents one market observation.
 *  Every market observation becomes permanent Atlas memory."
 *
 * ARCHITECTURAL RULES:
 *   - Never deleted, never truncated, never modified after insertion.
 *   - Idempotent: duplicate inserts (same idempotency_key) are silently ignored.
 *   - Completely isolated from execution pipeline (M-14, M-15).
 *   - Source of truth for ARD pattern discovery and ORACLE calibration.
 */
export const atlasMemory = mysqlTable("atlas_memory", {
  id: int("id").autoincrement().primaryKey(),
  // ── Identity & Memory
  memoryId: varchar("memory_id", { length: 64 }).notNull().unique(),
  eventId: varchar("event_id", { length: 80 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull().unique(),
  schemaVersion: varchar("schema_version", { length: 16 }).notNull().default("1.1.0"),
  atlasVersion: varchar("atlas_version", { length: 32 }),
  symbol: varchar("symbol", { length: 16 }).notNull().default("MNQ1!"),
  timeframe: varchar("timeframe", { length: 8 }).notNull().default("5"),
  barIndex: int("bar_index"),
  pipelineRunId: varchar("pipeline_run_id", { length: 64 }),
  // ── Timestamp
  barTime: bigint("bar_time", { mode: "number" }).notNull(),
  barTimeEt: varchar("bar_time_et", { length: 32 }),
  session: varchar("session", { length: 8 }),
  dayOfWeek: varchar("day_of_week", { length: 4 }),
  hourEt: int("hour_et"),
  isRth: boolean("is_rth").default(false),
  // ── OHLCV
  open: decimal("open", { precision: 10, scale: 2 }),
  high: decimal("high", { precision: 10, scale: 2 }),
  low: decimal("low", { precision: 10, scale: 2 }),
  close: decimal("close", { precision: 10, scale: 2 }),
  volume: decimal("volume", { precision: 14, scale: 0 }),
  // ── Core Indicators
  atr: decimal("atr", { precision: 10, scale: 4 }),
  atr5: decimal("atr5", { precision: 10, scale: 4 }),
  atrExpansion: decimal("atr_expansion", { precision: 8, scale: 4 }),
  atrPercentile: decimal("atr_percentile", { precision: 6, scale: 2 }),
  adx: decimal("adx", { precision: 6, scale: 2 }),
  adxTrending: boolean("adx_trending").default(false),
  chop: decimal("chop", { precision: 6, scale: 2 }),
  rsi: decimal("rsi", { precision: 6, scale: 2 }),
  vwap: decimal("vwap", { precision: 10, scale: 2 }),
  distVwap: decimal("dist_vwap", { precision: 10, scale: 2 }),
  // ── EMAs
  ema9: decimal("ema9", { precision: 10, scale: 2 }),
  ema21: decimal("ema21", { precision: 10, scale: 2 }),
  ema50: decimal("ema50", { precision: 10, scale: 2 }),
  ema200: decimal("ema200", { precision: 10, scale: 2 }),
  ema9Slope: decimal("ema9_slope", { precision: 10, scale: 6 }),
  ema21Slope: decimal("ema21_slope", { precision: 10, scale: 6 }),
  ema50Slope: decimal("ema50_slope", { precision: 10, scale: 6 }),
  emaAlignment: varchar("ema_alignment", { length: 8 }),
  trendDirection: varchar("trend_direction", { length: 12 }),
  // ── Regime
  volatilityState: varchar("volatility_state", { length: 16 }),
  compressionState: varchar("compression_state", { length: 16 }),
  regimeClassification: varchar("regime_classification", { length: 24 }),
  // ── Previous Day Structure
  prevDayHigh: decimal("prev_day_high", { precision: 10, scale: 2 }),
  prevDayLow: decimal("prev_day_low", { precision: 10, scale: 2 }),
  prevDayClose: decimal("prev_day_close", { precision: 10, scale: 2 }),
  prevDayRange: decimal("prev_day_range", { precision: 10, scale: 2 }),
  prevDayRangeAtr: decimal("prev_day_range_atr", { precision: 8, scale: 4 }),
  overnightGap: decimal("overnight_gap", { precision: 8, scale: 4 }),
  priceVsPrevDay: varchar("price_vs_prev_day", { length: 16 }),
  // ── Model Eligibility
  a1Eligible: boolean("a1_eligible").default(false),
  a3Eligible: boolean("a3_eligible").default(false),
  b1Eligible: boolean("b1_eligible").default(false),
  sb1Eligible: boolean("sb1_eligible").default(false),
  activeModels: varchar("active_models", { length: 32 }),
  // ── SB1 RAS
  sb1Ras: decimal("sb1_ras", { precision: 6, scale: 2 }),
  sb1RasActivated: boolean("sb1_ras_activated").default(false),
  // ── Pipeline Health
  pipelineHealth: varchar("pipeline_health", { length: 16 }).default("OK"),
  obsCount: int("obs_count"),
  errorCount: int("error_count").default(0),
  moduleVersion: varchar("module_version", { length: 16 }),
  sprint: int("sprint"),
  // ── Server Metadata
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  rawPayload: text("raw_payload"),
});
export type AtlasMemory = typeof atlasMemory.$inferSelect;
export type InsertAtlasMemory = typeof atlasMemory.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// SPRINT 090 — TEMPORAL INTELLIGENCE ENGINE (TIE)
// ══════════════════════════════════════════════════════════════════════════════

// ── tie_sequences ─────────────────────────────────────────────────────────────
// Active and completed multi-bar behavioural sequences detected by TIE.
// Sequences may overlap, branch, and terminate.
export const tieSequences = mysqlTable("tie_sequences", {
  id: int("id").autoincrement().primaryKey(),
  sequenceId: varchar("sequence_id", { length: 64 }).notNull().unique(),
  sequenceType: varchar("sequence_type", { length: 64 }).notNull(),
  label: varchar("label", { length: 128 }),
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  endTime: bigint("end_time", { mode: "number" }),
  startBarIndex: int("start_bar_index"),
  endBarIndex: int("end_bar_index"),
  durationBars: int("duration_bars"),
  symbol: varchar("symbol", { length: 20 }).notNull().default("MNQ1!"),
  timeframe: varchar("timeframe", { length: 8 }).notNull().default("5"),
  session: varchar("session", { length: 8 }),
  dominantTrend: varchar("dominant_trend", { length: 32 }),
  volatilityProfile: varchar("volatility_profile", { length: 32 }),
  vwapBehaviour: varchar("vwap_behaviour", { length: 64 }),
  emaBehaviour: varchar("ema_behaviour", { length: 64 }),
  adxEvolution: varchar("adx_evolution", { length: 32 }),
  atrEvolution: varchar("atr_evolution", { length: 32 }),
  chopEvolution: varchar("chop_evolution", { length: 32 }),
  regime: varchar("regime", { length: 32 }),
  marketStructure: varchar("market_structure", { length: 64 }),
  completionStatus: mysqlEnum("completion_status", ["active", "completed", "terminated", "branched"]).notNull().default("active"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  clusterId: varchar("cluster_id", { length: 64 }),
  oraclePredictionId: varchar("oracle_prediction_id", { length: 64 }),
  experienceScore: decimal("experience_score", { precision: 5, scale: 2 }),
  similarityCluster: varchar("similarity_cluster", { length: 64 }),
  similarityPct: decimal("similarity_pct", { precision: 5, scale: 2 }),
  expectedOutcome: varchar("expected_outcome", { length: 128 }),
  expectedDurationBars: int("expected_duration_bars"),
  expectedR: decimal("expected_r", { precision: 6, scale: 3 }),
  behaviourStory: text("behaviour_story"),
  barSnapshots: text("bar_snapshots"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type TieSequence = typeof tieSequences.$inferSelect;
export type InsertTieSequence = typeof tieSequences.$inferInsert;

// ── tie_sequence_library ──────────────────────────────────────────────────────
// Permanent behavioural encyclopedia. Every completed sequence type is archived here.
export const tieSequenceLibrary = mysqlTable("tie_sequence_library", {
  id: int("id").autoincrement().primaryKey(),
  sequenceType: varchar("sequence_type", { length: 64 }).notNull().unique(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  description: text("description"),
  firstObserved: bigint("first_observed", { mode: "number" }),
  lastObserved: bigint("last_observed", { mode: "number" }),
  occurrences: int("occurrences").notNull().default(0),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }),
  avgR: decimal("avg_r", { precision: 6, scale: 3 }),
  avgDurationBars: decimal("avg_duration_bars", { precision: 6, scale: 2 }),
  avgMfe: decimal("avg_mfe", { precision: 8, scale: 4 }),
  avgMae: decimal("avg_mae", { precision: 8, scale: 4 }),
  probabilityDistribution: text("probability_distribution"),
  typicalExitBehaviour: text("typical_exit_behaviour"),
  bestModels: varchar("best_models", { length: 256 }),
  worstModels: varchar("worst_models", { length: 256 }),
  oraclePredictionAccuracy: decimal("oracle_prediction_accuracy", { precision: 5, scale: 2 }),
  researchStatus: mysqlEnum("research_status", ["candidate", "active", "certified", "deprecated"]).notNull().default("candidate"),
  constitutionalNote: text("constitutional_note"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type TieSequenceLibrary = typeof tieSequenceLibrary.$inferSelect;
export type InsertTieSequenceLibrary = typeof tieSequenceLibrary.$inferInsert;

// ── tie_clusters ──────────────────────────────────────────────────────────────
// Automatically grouped clusters of similar behavioural sequences.
export const tieClusters = mysqlTable("tie_clusters", {
  id: int("id").autoincrement().primaryKey(),
  clusterId: varchar("cluster_id", { length: 64 }).notNull().unique(),
  clusterName: varchar("cluster_name", { length: 128 }).notNull(),
  description: text("description"),
  sequenceTypes: text("sequence_types"),
  occurrences: int("occurrences").notNull().default(0),
  avgPf: decimal("avg_pf", { precision: 6, scale: 3 }),
  avgDurationBars: decimal("avg_duration_bars", { precision: 6, scale: 2 }),
  avgReversalProbability: decimal("avg_reversal_probability", { precision: 5, scale: 2 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  dominantRegime: varchar("dominant_regime", { length: 32 }),
  dominantSession: varchar("dominant_session", { length: 16 }),
  behaviouralFingerprint: text("behavioural_fingerprint"),
  lastUpdated: timestamp("last_updated").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TieCluster = typeof tieClusters.$inferSelect;
export type InsertTieCluster = typeof tieClusters.$inferInsert;

// ── tie_oracle_predictions ────────────────────────────────────────────────────
// Per-sequence Oracle predictions vs actuals. Calibration tracking.
export const tieOraclePredictions = mysqlTable("tie_oracle_predictions", {
  id: int("id").autoincrement().primaryKey(),
  predictionId: varchar("prediction_id", { length: 64 }).notNull().unique(),
  sequenceId: varchar("sequence_id", { length: 64 }).notNull(),
  predictedOutcome: varchar("predicted_outcome", { length: 128 }),
  predictedR: decimal("predicted_r", { precision: 6, scale: 3 }),
  predictedDurationBars: int("predicted_duration_bars"),
  predictedConfidence: decimal("predicted_confidence", { precision: 5, scale: 2 }),
  actualOutcome: varchar("actual_outcome", { length: 128 }),
  actualR: decimal("actual_r", { precision: 6, scale: 3 }),
  actualDurationBars: int("actual_duration_bars"),
  predictionError: decimal("prediction_error", { precision: 6, scale: 3 }),
  confidenceCalibration: decimal("confidence_calibration", { precision: 5, scale: 2 }),
  sequenceReliability: decimal("sequence_reliability", { precision: 5, scale: 2 }),
  surpriseIndex: decimal("surprise_index", { precision: 5, scale: 2 }),
  status: mysqlEnum("status", ["pending", "resolved", "expired"]).notNull().default("pending"),
  predictedAt: bigint("predicted_at", { mode: "number" }),
  resolvedAt: bigint("resolved_at", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type TieOraclePrediction = typeof tieOraclePredictions.$inferSelect;
export type InsertTieOraclePrediction = typeof tieOraclePredictions.$inferInsert;

// ── tie_research_candidates ───────────────────────────────────────────────────
// Autonomously discovered new recurring behaviours pending certification.
export const tieResearchCandidates = mysqlTable("tie_research_candidates", {
  id: int("id").autoincrement().primaryKey(),
  candidateId: varchar("candidate_id", { length: 64 }).notNull().unique(),
  sequenceId: varchar("sequence_id", { length: 64 }),
  evidenceScore: decimal("evidence_score", { precision: 5, scale: 2 }),
  occurrenceCount: int("occurrence_count").notNull().default(0),
  statisticalConfidence: decimal("statistical_confidence", { precision: 5, scale: 2 }),
  researchPriority: mysqlEnum("research_priority", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  certificationStatus: mysqlEnum("certification_status", ["candidate", "under_review", "certified", "rejected"]).notNull().default("candidate"),
  firstSeen: bigint("first_seen", { mode: "number" }),
  lastSeen: bigint("last_seen", { mode: "number" }),
  behaviouralSignature: text("behavioural_signature"),
  notes: text("notes"),
  discoveredBy: varchar("discovered_by", { length: 64 }).default("TIE-AUTO"),
  promotedAt: bigint("promoted_at", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type TieResearchCandidate = typeof tieResearchCandidates.$inferSelect;
export type InsertTieResearchCandidate = typeof tieResearchCandidates.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// DARWIN — Discovery and Autonomous Research Workflow Intelligence Network
// Sprint 094
// ─────────────────────────────────────────────────────────────────────────────

// ── darwin_candidates ─────────────────────────────────────────────────────────
// Autonomously generated research candidates from Atlas Memory analysis.
export const darwinCandidates = mysqlTable("darwin_candidates", {
  id: int("id").autoincrement().primaryKey(),
  candidateId: varchar("candidate_id", { length: 64 }).notNull().unique(),
  behaviourClass: varchar("behaviour_class", { length: 64 }).notNull(),
  behaviourDescription: text("behaviour_description"),
  occurrenceCount: int("occurrence_count").notNull().default(0),
  statisticalSignificance: decimal("statistical_significance", { precision: 5, scale: 4 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  estimatedWinRate: decimal("estimated_win_rate", { precision: 5, scale: 2 }),
  estimatedPf: decimal("estimated_pf", { precision: 6, scale: 3 }),
  estimatedFrequency: int("estimated_frequency"),
  estimatedPcs: decimal("estimated_pcs", { precision: 5, scale: 2 }),
  estimatedCorrelation: decimal("estimated_correlation", { precision: 5, scale: 3 }),
  researchPriority: int("research_priority").notNull().default(99),
  evidenceScore: decimal("evidence_score", { precision: 5, scale: 2 }),
  supportingRegimes: text("supporting_regimes"),
  supportingSessions: text("supporting_sessions"),
  humanExplanation: text("human_explanation"),
  governanceStage: varchar("governance_stage", { length: 64 }).notNull().default("HYPOTHESIS"),
  rejectionReason: text("rejection_reason"),
  promotedAt: bigint("promoted_at", { mode: "number" }),
  firstObserved: bigint("first_observed", { mode: "number" }),
  lastObserved: bigint("last_observed", { mode: "number" }),
  discoveredBy: varchar("discovered_by", { length: 64 }).notNull().default("DARWIN"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type DarwinCandidate = typeof darwinCandidates.$inferSelect;
export type InsertDarwinCandidate = typeof darwinCandidates.$inferInsert;

// ── darwin_backtests ──────────────────────────────────────────────────────────
// Backtest results for each research candidate at each validation stage.
export const darwinBacktests = mysqlTable("darwin_backtests", {
  id: int("id").autoincrement().primaryKey(),
  backtestId: varchar("backtest_id", { length: 64 }).notNull().unique(),
  candidateId: varchar("candidate_id", { length: 64 }).notNull(),
  stage: varchar("stage", { length: 64 }).notNull(),
  totalTrades: int("total_trades"),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }),
  profitFactor: decimal("profit_factor", { precision: 6, scale: 3 }),
  netProfit: decimal("net_profit", { precision: 12, scale: 2 }),
  maxDrawdown: decimal("max_drawdown", { precision: 12, scale: 2 }),
  maxLossStreak: int("max_loss_streak"),
  expectancy: decimal("expectancy", { precision: 8, scale: 2 }),
  sharpeRatio: decimal("sharpe_ratio", { precision: 6, scale: 3 }),
  mcProfitProbability: decimal("mc_profit_probability", { precision: 5, scale: 2 }),
  ddViolationRisk: decimal("dd_violation_risk", { precision: 5, scale: 2 }),
  parameterStabilityScore: decimal("parameter_stability_score", { precision: 5, scale: 2 }),
  robustnessScore: decimal("robustness_score", { precision: 5, scale: 2 }),
  passed: boolean("passed").notNull().default(false),
  failureReason: text("failure_reason"),
  rawResults: json("raw_results"),
  runAt: bigint("run_at", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DarwinBacktest = typeof darwinBacktests.$inferSelect;
export type InsertDarwinBacktest = typeof darwinBacktests.$inferInsert;

// ── darwin_weekly_reports ─────────────────────────────────────────────────────
// Automatically generated weekly quantitative research briefings.
export const darwinWeeklyReports = mysqlTable("darwin_weekly_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportId: varchar("report_id", { length: 64 }).notNull().unique(),
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(),
  newObservations: int("new_observations").notNull().default(0),
  behaviouralChangesDetected: int("behavioural_changes_detected").notNull().default(0),
  candidatesCreated: int("candidates_created").notNull().default(0),
  candidatesRejected: int("candidates_rejected").notNull().default(0),
  candidatesPromoted: int("candidates_promoted").notNull().default(0),
  portfolioHealthScore: decimal("portfolio_health_score", { precision: 5, scale: 2 }),
  coverageScore: decimal("coverage_score", { precision: 5, scale: 2 }),
  highestPriorityCandidate: varchar("highest_priority_candidate", { length: 64 }),
  highestConfidenceOpportunity: varchar("highest_confidence_opportunity", { length: 64 }),
  estimatedPortfolioImpact: text("estimated_portfolio_impact"),
  oracleAccuracy: decimal("oracle_accuracy", { precision: 5, scale: 2 }),
  researchVelocity: decimal("research_velocity", { precision: 5, scale: 2 }),
  fullReportMarkdown: text("full_report_markdown"),
  generatedAt: bigint("generated_at", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DarwinWeeklyReport = typeof darwinWeeklyReports.$inferSelect;
export type InsertDarwinWeeklyReport = typeof darwinWeeklyReports.$inferInsert;

// ── darwin_self_eval ──────────────────────────────────────────────────────────
// DARWIN self-evaluation metrics — research quality tracking over time.
export const darwinSelfEval = mysqlTable("darwin_self_eval", {
  id: int("id").autoincrement().primaryKey(),
  evalId: varchar("eval_id", { length: 64 }).notNull().unique(),
  periodStart: bigint("period_start", { mode: "number" }).notNull(),
  periodEnd: bigint("period_end", { mode: "number" }).notNull(),
  hypothesesCreated: int("hypotheses_created").notNull().default(0),
  hypothesesValidated: int("hypotheses_validated").notNull().default(0),
  hypothesesRejected: int("hypotheses_rejected").notNull().default(0),
  falseDiscoveries: int("false_discoveries").notNull().default(0),
  predictionAccuracy: decimal("prediction_accuracy", { precision: 5, scale: 2 }),
  researchEfficiency: decimal("research_efficiency", { precision: 5, scale: 2 }),
  avgTimeToCertificationDays: decimal("avg_time_to_certification_days", { precision: 6, scale: 2 }),
  discoveryRate: decimal("discovery_rate", { precision: 5, scale: 2 }),
  qualityScore: decimal("quality_score", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DarwinSelfEval = typeof darwinSelfEval.$inferSelect;
export type InsertDarwinSelfEval = typeof darwinSelfEval.$inferInsert;

// ── darwin_job_queue ──────────────────────────────────────────────────────────
// Durable autonomous research job queue — survives restarts, no skips, no duplicates.
export const darwinJobQueue = mysqlTable("darwin_job_queue", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("job_id", { length: 64 }).notNull().unique(),
  jobType: varchar("job_type", { length: 64 }).notNull(),
  layer: int("layer").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  priority: int("priority").notNull().default(5),
  payload: text("payload"),
  referenceKey: varchar("reference_key", { length: 128 }),
  scheduledAt: bigint("scheduled_at", { mode: "number" }).notNull(),
  startedAt: bigint("started_at", { mode: "number" }),
  completedAt: bigint("completed_at", { mode: "number" }),
  durationMs: int("duration_ms"),
  errorMessage: text("error_message"),
  retryCount: int("retry_count").notNull().default(0),
  maxRetries: int("max_retries").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DarwinJob = typeof darwinJobQueue.$inferSelect;
export type InsertDarwinJob = typeof darwinJobQueue.$inferInsert;

// ── darwin_research_memory ────────────────────────────────────────────────────
// Permanent institutional research memory — every hypothesis ever investigated.
export const darwinResearchMemory = mysqlTable("darwin_research_memory", {
  id: int("id").autoincrement().primaryKey(),
  memoryId: varchar("memory_id", { length: 64 }).notNull().unique(),
  candidateId: varchar("candidate_id", { length: 64 }),
  behaviourClass: varchar("behaviour_class", { length: 64 }),
  hypothesisDescription: text("hypothesis_description").notNull(),
  proposedReason: text("proposed_reason"),
  supportingEvidence: text("supporting_evidence"),
  backtestSummary: text("backtest_summary"),
  monteCarloSummary: text("monte_carlo_summary"),
  robustnessScore: decimal("robustness_score", { precision: 5, scale: 2 }),
  oracleFindings: text("oracle_findings"),
  portfolioImpact: text("portfolio_impact"),
  finalOutcome: varchar("final_outcome", { length: 32 }),
  rejectionReasons: text("rejection_reasons"),
  lessonsLearned: text("lessons_learned"),
  researchHoursEstimate: decimal("research_hours_estimate", { precision: 6, scale: 2 }),
  certificationProbability: decimal("certification_probability", { precision: 5, scale: 2 }),
  expectedPortfolioContribution: decimal("expected_portfolio_contribution", { precision: 5, scale: 2 }),
  roiScore: decimal("roi_score", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
export type DarwinResearchMemory = typeof darwinResearchMemory.$inferSelect;
export type InsertDarwinResearchMemory = typeof darwinResearchMemory.$inferInsert;

// ── darwin_exec_briefings ─────────────────────────────────────────────────────
// Weekly executive research briefings — auto-generated every Sunday.
export const darwinExecBriefings = mysqlTable("darwin_exec_briefings", {
  id: int("id").autoincrement().primaryKey(),
  briefingId: varchar("briefing_id", { length: 64 }).notNull().unique(),
  briefingDate: bigint("briefing_date", { mode: "number" }).notNull(),
  portfolioHealthScore: decimal("portfolio_health_score", { precision: 5, scale: 2 }),
  portfolioCoverageScore: decimal("portfolio_coverage_score", { precision: 5, scale: 2 }),
  atlasMemoryGrowth: int("atlas_memory_growth").notNull().default(0),
  darwinHealthScore: decimal("darwin_health_score", { precision: 5, scale: 2 }),
  oracleAccuracy: decimal("oracle_accuracy", { precision: 5, scale: 2 }),
  newObservationsWeek: int("new_observations_week").notNull().default(0),
  totalCandidates: int("total_candidates").notNull().default(0),
  promotionCandidates: int("promotion_candidates").notNull().default(0),
  rejectedCandidates: int("rejected_candidates").notNull().default(0),
  highestConfidenceDiscovery: varchar("highest_confidence_discovery", { length: 128 }),
  highestConfidenceScore: decimal("highest_confidence_score", { precision: 5, scale: 2 }),
  highestExpectedGainCandidate: varchar("highest_expected_gain_candidate", { length: 128 }),
  highestPriorityResearch: text("highest_priority_research"),
  modelHealthSummary: text("model_health_summary"),
  behaviourCoverageMap: text("behaviour_coverage_map"),
  estimatedFutureImprovement: decimal("estimated_future_improvement", { precision: 5, scale: 2 }),
  fullBriefingMarkdown: text("full_briefing_markdown"),
  readTimeSeconds: int("read_time_seconds").notNull().default(45),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DarwinExecBriefing = typeof darwinExecBriefings.$inferSelect;
export type InsertDarwinExecBriefing = typeof darwinExecBriefings.$inferInsert;
