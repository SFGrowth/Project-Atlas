import {
  bigint,
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
