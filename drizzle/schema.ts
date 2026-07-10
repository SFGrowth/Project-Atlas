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
