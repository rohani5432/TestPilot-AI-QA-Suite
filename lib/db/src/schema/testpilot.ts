import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const testCasesTable = pgTable("testpilot_test_cases", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bugsTable = pgTable("testpilot_bugs", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const testRunsTable = pgTable("testpilot_test_runs", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
