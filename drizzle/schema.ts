import {
  bigint,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
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
 * Indexed on idempotency_key for deduplication and on received_at for timeline queries.
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
