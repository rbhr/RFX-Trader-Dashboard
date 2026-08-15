import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
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
 * Magic number configuration table
 * Stores trading account identifiers with their associated user details
 */
export const magicNumbers = mysqlTable("magic_numbers", {
  id: int("id").autoincrement().primaryKey(),
  magicNumber: varchar("magicNumber", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  profitShare: decimal("profitShare", { precision: 5, scale: 4 })
    .notNull()
    .default("0.3500"),
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
  mcAccountId: varchar("mcAccountId", { length: 100 }),
  liveAccountNumber: varchar("liveAccountNumber", { length: 50 }),
  manager: varchar("manager", { length: 100 }).default("RFX"),
  payoutCycle: mysqlEnum("payoutCycle", [
    "Weekly",
    "Fortnightly",
    "Self Service",
  ]).default("Fortnightly"),
  telegramHandle: varchar("telegramHandle", { length: 100 }),
  telegramChatId: varchar("telegramChatId", { length: 30 }),
  // Profit Tracking
  lifetimeProfit: decimal("lifetimeProfit", {
    precision: 15,
    scale: 2,
  }).default("0.00"),
  lifetimeProfitShare: decimal("lifetimeProfitShare", {
    precision: 15,
    scale: 2,
  }).default("0.00"),
  lifetimeIncome: decimal("lifetimeIncome", {
    precision: 15,
    scale: 2,
  }).default("0.00"),
  // High-water-mark baseline: cumulative realized profit already paid
  // profit-share on. Payout = max(0, cumulativeProfit - baseline) x share%.
  profitShareBaseline: decimal("profitShareBaseline", {
    precision: 15,
    scale: 2,
  }).default("0.00"),
  // Manual profit correction (± dollars) added to cumulative realized profit for
  // payout math and single-trader profit views. A running total, adjusted by
  // delta from the Process Payouts screen; persists until changed. Because a
  // payout raises the baseline to the (adjusted) cumulative, a correction is
  // captured once and then absorbed by the HWM.
  profitAdjustment: decimal("profitAdjustment", {
    precision: 15,
    scale: 2,
  }).default("0.00"),
  // Trailing Risk Limit
  trailingRiskLimit: decimal("trailingRiskLimit", {
    precision: 15,
    scale: 2,
  }),
  trailingRiskLimitEnabled: boolean("trailingRiskLimitEnabled")
    .notNull()
    .default(false),
  // USDT Payment Information
  showMyTradesUrl: varchar("showMyTradesUrl", { length: 500 }),
  usdtAddress: varchar("usdtAddress", { length: 255 }),
  usdtNetwork: mysqlEnum("usdtNetwork", ["TRC20", "ERC20"]),
  // Set once the trader completes onboarding (Telegram linked, password changed,
  // USDT details set) and their live copiers are activated. One-way: never cleared.
  liveCopiersActivatedAt: timestamp("liveCopiersActivatedAt"),
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

/**
 * Copier templates table
 * Stores reusable copier configuration templates
 */
export const copierTemplates = mysqlTable("copier_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  // Copier Settings
  multiplier: decimal("multiplier", { precision: 10, scale: 4 })
    .notNull()
    .default("1.0000"),
  copyStopLoss: boolean("copyStopLoss").notNull().default(true),
  copyTakeProfit: boolean("copyTakeProfit").notNull().default(true),
  skipPendingOrders: boolean("skipPendingOrders").notNull().default(true),
  scaleTypeId: int("scaleTypeId").notNull().default(3), // 3 = Fixed lot size, 4 = No scaling
  scaleTypeName: varchar("scaleTypeName", { length: 50 })
    .notNull()
    .default("Fixed lot size"),
  active: boolean("active").notNull().default(false),
  monitorOnly: boolean("monitorOnly").notNull().default(false),
  maxSlippage: int("maxSlippage").notNull().default(0),
  forceMinTrade: boolean("forceMinTrade").notNull().default(true),
  fixMasterBalanceAndEquity: decimal("fixMasterBalanceAndEquity", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0.00"),
  fixSlaveBalanceAndEquity: decimal("fixSlaveBalanceAndEquity", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0.00"),
  fixedLotSize: decimal("fixedLotSize", { precision: 10, scale: 2 })
    .notNull()
    .default("0.01"),
  martingaleStrategy: boolean("martingaleStrategy").notNull().default(false),
  openRetry: boolean("openRetry").notNull().default(true),
  openRetryTimeoutInMinutes: int("openRetryTimeoutInMinutes")
    .notNull()
    .default(10),
  reverse: boolean("reverse").notNull().default(false),
  copyOpenPositions: boolean("copyOpenPositions").notNull().default(false),
  maxOpenPositions: int("maxOpenPositions").notNull().default(0),
  maxLotSize: decimal("maxLotSize", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  maximumLot: decimal("maximumLot", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  hideComment: boolean("hideComment").notNull().default(false),
  forcePositionLotSize: boolean("forcePositionLotSize")
    .notNull()
    .default(false),
  ignoreContractSize: boolean("ignoreContractSize").notNull().default(false),
  ignoreCurrency: boolean("ignoreCurrency").notNull().default(false),
  copyMagicNumber: boolean("copyMagicNumber").notNull().default(true),
  copyOriginalComment: boolean("copyOriginalComment").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CopierTemplate = typeof copierTemplates.$inferSelect;
export type InsertCopierTemplate = typeof copierTemplates.$inferInsert;

/**
 * Payments table
 * Tracks all payments made to traders
 */
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  magicNumberId: int("magicNumberId").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  transactionHash: varchar("transactionHash", { length: 255 }).notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  networkFee: decimal("networkFee", { precision: 15, scale: 2 }).default(
    "0.00"
  ),
  network: mysqlEnum("network", ["TRC20", "ERC20"]),
  narration: varchar("narration", { length: 500 }),
  paymentType: varchar("paymentType", { length: 32 })
    .notNull()
    .default("Profit Share"),
  payoutPeriodFrom: timestamp("payoutPeriodFrom"),
  payoutPeriodTo: timestamp("payoutPeriodTo"),
  notificationSent: boolean("notificationSent").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Notifications table
 * Stores in-app notifications for traders
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  magicNumberId: int("magicNumberId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["payment", "info", "warning", "error"])
    .notNull()
    .default("info"),
  isRead: boolean("isRead").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Risk Limit Breaches table
 * Tracks when a trader's equity drops below their risk limit
 */
export const riskLimitBreaches = mysqlTable("risk_limit_breaches", {
  id: int("id").autoincrement().primaryKey(),
  magicNumberId: int("magicNumberId").notNull(),
  equityAtBreach: decimal("equityAtBreach", {
    precision: 15,
    scale: 2,
  }).notNull(),
  riskLimitAtBreach: decimal("riskLimitAtBreach", {
    precision: 15,
    scale: 2,
  }).notNull(),
  traderNotified: boolean("traderNotified").notNull().default(false),
  adminNotified: boolean("adminNotified").notNull().default(false),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RiskLimitBreach = typeof riskLimitBreaches.$inferSelect;
export type InsertRiskLimitBreach = typeof riskLimitBreaches.$inferInsert;

/**
 * Previous magic numbers for a trader
 * Tracks historical magic numbers that a trader used before their current one
 */
export const traderPreviousMagicNumbers = mysqlTable(
  "trader_previous_magic_numbers",
  {
    id: int("id").autoincrement().primaryKey(),
    magicNumberId: int("magicNumberId").notNull(),
    previousMagicNumber: varchar("previousMagicNumber", {
      length: 20,
    }).notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

export type TraderPreviousMagicNumber =
  typeof traderPreviousMagicNumbers.$inferSelect;
export type InsertTraderPreviousMagicNumber =
  typeof traderPreviousMagicNumbers.$inferInsert;

/**
 * Previous master accounts for a trader
 * Tracks historical live/master accounts that a trader was assigned to before their current one
 */
export const traderPreviousMasterAccounts = mysqlTable(
  "trader_previous_master_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    magicNumberId: int("magicNumberId").notNull(),
    liveAccountNumber: varchar("liveAccountNumber", { length: 50 }).notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

export type TraderPreviousMasterAccount =
  typeof traderPreviousMasterAccounts.$inferSelect;
export type InsertTraderPreviousMasterAccount =
  typeof traderPreviousMasterAccounts.$inferInsert;

/**
 * Two-factor authentication codes
 * Short-lived codes sent via Telegram for login verification and password changes
 */
export const twoFactorCodes = mysqlTable("two_factor_codes", {
  id: int("id").autoincrement().primaryKey(),
  magicNumberId: int("magicNumberId").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  purpose: mysqlEnum("purpose", [
    "login_2fa",
    "password_reset",
    "password_change",
  ]).notNull(),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TwoFactorCode = typeof twoFactorCodes.$inferSelect;
export type InsertTwoFactorCode = typeof twoFactorCodes.$inferInsert;

/**
 * Admin settings key-value store
 */
export const adminSettings = mysqlTable("admin_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: varchar("value", { length: 500 }).notNull(),
});

/**
 * System event log (persistent) — backs the admin "System Logs" tab.
 */
export const logs = mysqlTable("logs", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 32 }).notNull(),
  level: varchar("level", { length: 16 }).notNull().default("info"),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Log = typeof logs.$inferSelect;
export type InsertLog = typeof logs.$inferInsert;
