import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

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
 * Magic number configuration table
 * Stores trading account identifiers with their associated user details
 */
export const magicNumbers = mysqlTable("magic_numbers", {
  id: int("id").autoincrement().primaryKey(),
  magicNumber: varchar("magicNumber", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  profitShare: decimal("profitShare", { precision: 5, scale: 4 }).notNull().default("0.3500"),
  showAllData: boolean("showAllData").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  isAdmin: boolean("isAdmin").notNull().default(false),
  // MT4/MT5 Account Information
  mtAccount: varchar("mtAccount", { length: 50 }),
  mtServer: varchar("mtServer", { length: 100 }),
  mtPassword: varchar("mtPassword", { length: 255 }),
  mtVersion: varchar("mtVersion", { length: 10 }).default("MT5"),
  // MetaCopier Configuration
  mcLocation: varchar("mcLocation", { length: 50 }).default("London"),
  // Profit Tracking
  lifetimeProfit: decimal("lifetimeProfit", { precision: 15, scale: 2 }).default("0.00"),
  lifetimeProfitShare: decimal("lifetimeProfitShare", { precision: 15, scale: 2 }).default("0.00"),
  lifetimeIncome: decimal("lifetimeIncome", { precision: 15, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MagicNumber = typeof magicNumbers.$inferSelect;
export type InsertMagicNumber = typeof magicNumbers.$inferInsert;

/**
 * Trading sessions table
 * Tracks user login sessions with magic number associations
 */
export const tradingSessions = mysqlTable("trading_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionToken: varchar("sessionToken", { length: 255 }).notNull().unique(),
  magicNumberId: int("magicNumberId").notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TradingSession = typeof tradingSessions.$inferSelect;
export type InsertTradingSession = typeof tradingSessions.$inferInsert;
