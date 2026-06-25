import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getMagicNumberByNumber,
  getAllActiveMagicNumbers,
  createTradingSession,
  getTradingSessionByToken,
  deleteTradingSession,
  getAllMagicNumbers,
  getMagicNumberById,
  updateMagicNumber,
  deleteMagicNumber,
  createMagicNumber,
  getAllCopierTemplates,
  getCopierTemplateById,
  createCopierTemplate,
  updateCopierTemplate,
  deleteCopierTemplate,
  createPayment,
  incrementLifetimeIncome,
  setProfitShareBaseline,
  getLastProfitSharePaymentDate,
  getPaymentsByMagicNumberId,
  getAllPayments,
  updatePaymentNotificationStatus,
  updatePaymentTransactionHash,
  createNotification,
  getNotificationsByMagicNumberId,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createRiskLimitBreach,
  getActiveBreachByMagicNumberId,
  getAllRiskLimitBreaches,
  resolveRiskLimitBreach,
  countActiveRiskLimitBreaches,
  bulkResolveRiskLimitBreaches,
  deleteRiskLimitBreach,
  clearResolvedRiskLimitBreaches,
  getLogsPaged,
  getPreviousMagicNumbers,
  addPreviousMagicNumber,
  removePreviousMagicNumber,
  getPreviousMasterAccounts,
  addPreviousMasterAccount,
  removePreviousMasterAccount,
  createTwoFactorCode,
  verifyTwoFactorCode,
  invalidateTwoFactorCodes,
  hasSeenDevice,
  getAdminSetting,
  setAdminSetting,
} from "./db";
import {
  metaCopierService,
  calculatePnL,
  getStartOfToday,
  getEndOfToday,
  getStartOfWeek,
  getStartOfMonth,
  getAllTimeStart,
} from "./metacopier";
import { nanoid } from "nanoid";
import bcrypt from "bcrypt";
import {
  sendTelegramMessage,
  buildPaymentMessage,
  buildRiskLimitBreachMessage,
  buildAdminRiskLimitAlertMessage,
} from "./telegram";
import { maybeActivateOnboarding } from "./onboarding";
import { notifyOwner } from "./_core/notification";
import { getLastCheckedAt } from "./breachMonitor";
import { getTrailingLastCheckedAt } from "./trailingRiskLimit";
import { logEvent, type LogCategory } from "./logStore";
import { socketStatus, reconnectMetaCopierSocket } from "./metacopierSocket";
import {
  getWalletAddress as getTronWalletAddress,
  getUsdtBalance as getTronBalance,
  sendUsdt,
  isTronConfigured,
  isGasFreeConfigured,
  getGasFreeAccountInfo,
} from "./tron";
import {
  getWalletAddress as getEvmWalletAddress,
  getUsdtBalance as getEvmBalance,
  sendUsdtErc20,
  getNativeBalance,
  isEvmConfigured,
} from "./erc20";
import { ENV } from "./_core/env";
import { TxFailedError, TxPendingError } from "./walletErrors";
import { checkRateLimit, resetRateLimit } from "./rateLimit";
import { randomInt } from "crypto";

const TRADING_SESSION_COOKIE = "rfx_trading_session";
const BCRYPT_ROUNDS = 12;

// Trader IDs with a wallet payout currently being broadcast (double-send guard)
const inFlightWalletPayments = new Set<number>();

// In Testing Mode, payout sends are redirected here (a TRON/TRC20 wallet we
// control) instead of the trader's real address, so the on-chain pipeline can
// be exercised without paying traders or touching their accounting.
const TEST_PAYOUT_ADDRESS = "TMECgXuUt9ZAuduNCGCfVeRxTFeHjVQLW9";

async function generateAndSend2FACode(
  magicNumberId: number,
  telegramHandle: string | null,
  telegramChatId: string | null,
  traderName: string,
  magicNumber: string,
  purpose: "login_2fa" | "password_reset" | "password_change"
): Promise<boolean> {
  if (!telegramHandle || !telegramChatId) return false;

  const code = String(randomInt(100000, 1000000));
  await createTwoFactorCode(magicNumberId, code, purpose);

  const purposeLabel =
    purpose === "login_2fa"
      ? "login from a new device"
      : purpose === "password_reset"
        ? "password reset"
        : "password change";

  const message =
    `[Magic ${magicNumber}] 🔐 <b>Verification Code</b>\n\n` +
    `Hi ${traderName},\n\n` +
    `Your verification code for <b>${purposeLabel}</b> is:\n\n` +
    `<code>${code}</code>\n\n` +
    `This code expires in 5 minutes. If you didn't request this, ignore this message.`;

  return sendTelegramMessage(telegramHandle, message, telegramChatId, {
    logLabel: `verification code (${purposeLabel})`,
  });
}

/**
 * Verifies a 2FA code with a hard attempt cap: after 5 failed attempts in
 * 5 minutes the outstanding codes are burned and the caller must request a
 * fresh one. Without this, a 6-digit code is brute-forceable in its window.
 */
async function verifyTwoFactorCodeWithCap(
  magicNumberId: number,
  code: string,
  purpose: "login_2fa" | "password_reset" | "password_change"
): Promise<boolean> {
  const key = `2fa:${magicNumberId}:${purpose}`;
  if (!checkRateLimit(key, 5, 5 * 60 * 1000)) {
    await invalidateTwoFactorCodes(magicNumberId, purpose);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Too many verification attempts. Request a new code and try again.",
    });
  }
  const valid = await verifyTwoFactorCode(magicNumberId, code, purpose);
  if (valid) resetRateLimit(key);
  return valid;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (hash.startsWith("$2b$") || hash.startsWith("$2a$")) {
    return bcrypt.compare(password, hash);
  }
  return password === hash;
}

// Custom procedure for trading authentication
const tradingProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const sessionToken = ctx.req.cookies?.[TRADING_SESSION_COOKIE];

  if (!sessionToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No trading session found",
    });
  }

  const sessionData = await getTradingSessionByToken(sessionToken);

  if (!sessionData) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired session",
    });
  }

  // Check if session is expired
  if (new Date() > sessionData.session.expiresAt) {
    await deleteTradingSession(sessionToken);
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session expired" });
  }

  return next({
    ctx: {
      ...ctx,
      tradingSession: sessionData,
    },
  });
});

// Admin-only procedure: trading session + isAdmin check enforced in middleware
// so individual procedures can't forget the guard.
const adminProcedure = tradingProcedure.use(async ({ ctx, next }) => {
  if (!ctx.tradingSession.magicNumber.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

/** Zod schema for optional admin view-as-trader input. */
const viewAsInput = z
  .object({ viewAsTraderId: z.number().int().positive().optional() })
  .optional();

const viewAsWithMasterInput = z
  .object({
    viewAsTraderId: z.number().int().positive().optional(),
    masterAccountId: z.string().optional(),
  })
  .optional();

/**
 * Resolves the trader to use for a query. If viewAsTraderId is provided
 * and the caller is admin, returns that trader's data. Otherwise returns
 * the caller's own trader data.
 */
async function resolveTrader(
  ctx: { tradingSession: { magicNumber: any } },
  viewAsTraderId?: number
) {
  if (!viewAsTraderId) return ctx.tradingSession.magicNumber;

  if (!ctx.tradingSession.magicNumber.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins can view as another trader",
    });
  }

  const trader = await getMagicNumberById(viewAsTraderId);
  if (!trader) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Trader not found" });
  }
  return trader;
}

/**
 * Fetches all-time positions for a trader, aggregating across current and
 * historical magic numbers / master accounts. Deduplicates by position ID.
 */
async function fetchAggregatedLifetimePositions(trader: {
  id: number;
  magicNumber: string;
  liveAccountNumber: string | null;
  showAllData: boolean;
}): Promise<import("./metacopier").Position[]> {
  const { id, magicNumber, liveAccountNumber, showAllData } = trader;

  // If showAllData, just return everything from the default account
  if (showAllData) {
    return metaCopierService.getHistoricalPositions(
      getAllTimeStart(),
      getEndOfToday(),
      undefined,
      true
    );
  }

  // Fetch historical entries from DB
  const [prevMagics, prevAccounts] = await Promise.all([
    getPreviousMagicNumbers(id),
    getPreviousMasterAccounts(id),
  ]);

  // If no historical entries, use the simple path
  if (prevMagics.length === 0 && prevAccounts.length === 0) {
    if (liveAccountNumber) {
      const liveAccountId =
        await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
      if (liveAccountId) {
        return metaCopierService.getHistoricalPositionsFromAccount(
          liveAccountId,
          getAllTimeStart(),
          getEndOfToday(),
          magicNumber
        );
      }
    }
    return metaCopierService.getHistoricalPositions(
      getAllTimeStart(),
      getEndOfToday(),
      magicNumber,
      false
    );
  }

  // Build full set of magic numbers (normalized to string) and master accounts
  const allMagicNumbers = new Set<string>([String(magicNumber)]);
  for (const pm of prevMagics)
    allMagicNumbers.add(String(pm.previousMagicNumber));

  const allAccountNumbers = new Set<string>();
  if (liveAccountNumber) allAccountNumbers.add(liveAccountNumber);
  for (const pa of prevAccounts) allAccountNumbers.add(pa.liveAccountNumber);

  // For each unique master account, resolve to MC accountId, then fetch positions
  // filtered by ALL relevant magic numbers
  const allPositions: import("./metacopier").Position[] = [];

  if (allAccountNumbers.size > 0) {
    const accountFetches = Array.from(allAccountNumbers).map(async accNum => {
      const accountId =
        await metaCopierService.getAccountIdByLoginNumber(accNum);
      if (!accountId) return [];
      // Fetch all positions from this account (no magic filter — we filter ourselves)
      const positions =
        await metaCopierService.getHistoricalPositionsFromAccount(
          accountId,
          getAllTimeStart(),
          getEndOfToday()
        );
      // Filter to any of the trader's magic numbers
      return positions.filter(p => allMagicNumbers.has(String(p.magicNumber)));
    });

    const results = await Promise.all(accountFetches);
    for (const positions of results) allPositions.push(...positions);
  } else {
    // No master accounts at all — use default account with all magic numbers
    const positions = await metaCopierService.getHistoricalPositions(
      getAllTimeStart(),
      getEndOfToday(),
      undefined,
      false
    );
    allPositions.push(
      ...positions.filter(p => allMagicNumbers.has(String(p.magicNumber)))
    );
  }

  // Deduplicate by position ID
  const seen = new Set<string>();
  return allPositions.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/**
 * Compute week / month / lifetime PnL for a trader, aggregating across
 * previous magic numbers and previous master accounts. Includes floating
 * PnL from current open positions to match Dashboard semantics.
 */
async function computeTraderProfitSummary(trader: {
  id: number;
  magicNumber: string;
  liveAccountNumber: string | null;
  showAllData: boolean;
}): Promise<{ weekPnL: number; monthPnL: number; lifetimePnL: number }> {
  // One call for all closed positions (across history), one for open (current only)
  let liveAccountId: string | null = null;
  if (trader.liveAccountNumber && !trader.showAllData) {
    liveAccountId = await metaCopierService.getAccountIdByLoginNumber(
      trader.liveAccountNumber
    );
  }

  const [closed, open] = await Promise.all([
    fetchAggregatedLifetimePositions(trader),
    liveAccountId
      ? metaCopierService.getOpenPositionsFromAccount(
          liveAccountId,
          trader.magicNumber
        )
      : metaCopierService.getOpenPositions(
          trader.showAllData ? undefined : trader.magicNumber,
          trader.showAllData
        ),
  ]);

  const floating = calculatePnL(open);

  const weekStart = new Date(getStartOfWeek()).getTime();
  const monthStart = new Date(getStartOfMonth()).getTime();

  const weekClosed = closed.filter(
    p => p.closeTime && new Date(p.closeTime).getTime() >= weekStart
  );
  const monthClosed = closed.filter(
    p => p.closeTime && new Date(p.closeTime).getTime() >= monthStart
  );

  return {
    weekPnL: calculatePnL(weekClosed) + floating,
    monthPnL: calculatePnL(monthClosed) + floating,
    lifetimePnL: calculatePnL(closed) + floating,
  };
}

/**
 * Cumulative REALIZED profit (profit+swap+commission of closed trades) for a
 * trader's magic on their live account, from inception up to `to`. Reuses the
 * same closed-trade source as the dashboard lifetime figure (so the numbers
 * match), bounded by close time. No floating — payouts run at Saturday 11:00
 * Adelaide when the market is closed.
 */
async function computeCumulativeRealizedProfit(
  trader: {
    id: number;
    magicNumber: string;
    liveAccountNumber: string | null;
  },
  to: Date
): Promise<number> {
  const closed = await fetchAggregatedLifetimePositions({
    id: trader.id,
    magicNumber: trader.magicNumber,
    liveAccountNumber: trader.liveAccountNumber,
    showAllData: false,
  });
  const toMs = to.getTime();
  const relevant = closed.filter(
    p => p.closeTime && new Date(p.closeTime).getTime() <= toMs
  );
  return calculatePnL(relevant);
}

const PAYOUT_CYCLE_WAIT_DAYS: Record<string, number> = {
  Weekly: 7,
  Fortnightly: 14,
  "Ad-hoc": 0,
};

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/** Shared helper: record a payment and send notifications. */
async function recordPaymentAndNotify(params: {
  magicNumberId: number;
  amount: number;
  transactionHash: string;
  networkFee?: number;
  network?: "TRC20" | "ERC20";
  paymentDate: Date;
  narration?: string;
  paymentType?: string;
  payoutPeriodFrom?: Date;
  payoutPeriodTo?: Date;
  /** Skip trader notifications (Telegram + in-app) — used for test payouts. */
  silent?: boolean;
  /** Skip incrementing the trader's lifetimeIncome — used for test payouts. */
  skipLifetime?: boolean;
}) {
  const {
    magicNumberId,
    transactionHash,
    network,
    paymentDate,
    narration,
    payoutPeriodFrom,
    payoutPeriodTo,
    silent,
    skipLifetime,
  } = params;
  // Round to cents before persisting into decimal(15,2) columns
  const amount = Math.round(params.amount * 100) / 100;
  const networkFee = Math.round((params.networkFee ?? 0) * 100) / 100;

  await createPayment({
    magicNumberId,
    amount: amount.toFixed(2),
    networkFee: networkFee.toFixed(2),
    transactionHash,
    paymentDate,
    network: network ?? null,
    narration: narration ?? null,
    paymentType: params.paymentType ?? "Profit Share",
    payoutPeriodFrom: payoutPeriodFrom ?? null,
    payoutPeriodTo: payoutPeriodTo ?? null,
    notificationSent: true,
  });

  const trader = await getMagicNumberById(magicNumberId);
  if (trader) {
    if (!skipLifetime) {
      await incrementLifetimeIncome(magicNumberId, amount);
    }

    logEvent(
      "payment",
      `Paid $${amount.toFixed(2)}${network ? ` (${network})` : ""} to ${trader.name} (${trader.magicNumber}) — tx ${transactionHash.slice(0, 10)}…`
    );

    if (silent) {
      return;
    }

    await createNotification({
      magicNumberId,
      title: `[Magic ${trader.magicNumber}] Payment Received`,
      message: `You have received a payment of $${amount.toFixed(2)}. Transaction hash: ${transactionHash}`,
      type: "payment",
      isRead: false,
    });
    console.log(
      `[Payment] In-app notification sent to ${trader.name} for payment of $${amount}`
    );

    if (trader.telegramHandle && trader.telegramChatId) {
      const telegramMsg = buildPaymentMessage({
        traderName: trader.name,
        magicNumber: trader.magicNumber,
        amount,
        network: network || trader.usdtNetwork || "TRC20",
        networkFee,
        transactionHash,
        paymentDate,
      });
      const sent = await sendTelegramMessage(
        trader.telegramHandle,
        telegramMsg,
        trader.telegramChatId
      );
      if (sent) {
        console.log(
          `[Payment] Telegram notification sent to ${trader.telegramHandle}`
        );
      } else {
        console.warn(
          `[Payment] Telegram notification failed for ${trader.telegramHandle} — in-app notification still delivered`
        );
      }
    }
  }
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  trading: router({
    // Get all available magic numbers for login dropdown
    getMagicNumbers: publicProcedure.query(async () => {
      const magicNumbers = await getAllActiveMagicNumbers();
      return magicNumbers.map(mn => ({
        magicNumber: mn.magicNumber,
        name: mn.name,
      }));
    }),

    login: publicProcedure
      .input(
        z.object({
          magicNumber: z.string(),
          password: z.string(),
          rememberMe: z.boolean().optional(),
          twoFactorCode: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // req.ip respects Express "trust proxy" (set to 1 hop for Caddy),
        // so it can't be spoofed via X-Forwarded-For by external clients.
        const clientIp = ctx.req.ip || null;

        // Brute-force protection: per-account and per-IP attempt limits
        const magicKey = `login:magic:${input.magicNumber}`;
        if (
          !checkRateLimit(magicKey, 10, 15 * 60 * 1000) ||
          (clientIp && !checkRateLimit(`login:ip:${clientIp}`, 30, 15 * 60 * 1000))
        ) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many login attempts. Try again in 15 minutes.",
          });
        }

        const magicNumberData = await getMagicNumberByNumber(input.magicNumber);

        if (!magicNumberData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invalid magic number",
          });
        }

        const passwordValid = await verifyPassword(
          input.password,
          magicNumberData.password
        );
        if (!passwordValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid password",
          });
        }
        const knownDevice = await hasSeenDevice(magicNumberData.id, clientIp);

        if (
          !knownDevice &&
          magicNumberData.telegramChatId &&
          !magicNumberData.isAdmin
        ) {
          if (!input.twoFactorCode) {
            await generateAndSend2FACode(
              magicNumberData.id,
              magicNumberData.telegramHandle,
              magicNumberData.telegramChatId,
              magicNumberData.name,
              magicNumberData.magicNumber,
              "login_2fa"
            );
            return {
              success: false,
              requires2FA: true,
              magicNumber: magicNumberData.magicNumber,
              name: magicNumberData.name,
              isAdmin: false,
            };
          }

          const codeValid = await verifyTwoFactorCodeWithCap(
            magicNumberData.id,
            input.twoFactorCode,
            "login_2fa"
          );
          if (!codeValid) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid or expired verification code",
            });
          }
        }

        // Hash plaintext password on first successful login (migration)
        if (
          !magicNumberData.password.startsWith("$2b$") &&
          !magicNumberData.password.startsWith("$2a$")
        ) {
          const hashed = await hashPassword(input.password);
          await updateMagicNumber(magicNumberData.id, { password: hashed });
        }

        const sessionToken = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (input.rememberMe ? 30 : 7));

        await createTradingSession({
          sessionToken,
          magicNumberId: magicNumberData.id,
          ipAddress: clientIp,
          userAgent: ctx.req.headers["user-agent"] || null,
          expiresAt,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(TRADING_SESSION_COOKIE, sessionToken, {
          ...cookieOptions,
          maxAge: input.rememberMe
            ? 30 * 24 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000,
        });

        resetRateLimit(magicKey);

        return {
          success: true,
          requires2FA: false,
          magicNumber: magicNumberData.magicNumber,
          name: magicNumberData.name,
          isAdmin: magicNumberData.isAdmin || false,
        };
      }),

    // Logout
    tradingLogout: publicProcedure.mutation(async ({ ctx }) => {
      const sessionToken = ctx.req.cookies?.[TRADING_SESSION_COOKIE];

      if (sessionToken) {
        await deleteTradingSession(sessionToken);
      }

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(TRADING_SESSION_COOKIE, {
        ...cookieOptions,
        maxAge: -1,
      });

      return { success: true };
    }),

    requestPasswordReset: publicProcedure
      .input(z.object({ magicNumber: z.string() }))
      .mutation(async ({ input }) => {
        // Limit reset-code requests so the endpoint can't be used to spam
        // a trader's Telegram or stack brute-force windows
        if (!checkRateLimit(`pwreset:${input.magicNumber}`, 3, 15 * 60 * 1000)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many reset requests. Try again in 15 minutes.",
          });
        }

        const trader = await getMagicNumberByNumber(input.magicNumber);
        if (!trader) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Magic number not found",
          });
        }

        if (!trader.telegramChatId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "No Telegram linked to this account. Contact an admin to reset your password.",
          });
        }

        const sent = await generateAndSend2FACode(
          trader.id,
          trader.telegramHandle,
          trader.telegramChatId,
          trader.name,
          trader.magicNumber,
          "password_reset"
        );

        if (!sent) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send verification code. Try again later.",
          });
        }

        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(
        z.object({
          magicNumber: z.string(),
          code: z.string().length(6),
          newPassword: z.string().min(6),
        })
      )
      .mutation(async ({ input }) => {
        const trader = await getMagicNumberByNumber(input.magicNumber);
        if (!trader) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Magic number not found",
          });
        }

        const codeValid = await verifyTwoFactorCodeWithCap(
          trader.id,
          input.code,
          "password_reset"
        );
        if (!codeValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid or expired verification code",
          });
        }

        const hashed = await hashPassword(input.newPassword);
        await updateMagicNumber(trader.id, { password: hashed });

        // Password change may complete onboarding → activate live copiers.
        void maybeActivateOnboarding(trader.id);

        return { success: true };
      }),

    changePassword: tradingProcedure
      .input(
        z.object({
          currentPassword: z.string(),
          newPassword: z.string().min(6),
          twoFactorCode: z.string().length(6).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const trader = ctx.tradingSession.magicNumber;

        const passwordValid = await verifyPassword(
          input.currentPassword,
          trader.password
        );
        if (!passwordValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect",
          });
        }

        if (trader.telegramChatId) {
          if (!input.twoFactorCode) {
            await generateAndSend2FACode(
              trader.id,
              trader.telegramHandle,
              trader.telegramChatId,
              trader.name,
              trader.magicNumber,
              "password_change"
            );
            return { success: false, requires2FA: true };
          }

          const codeValid = await verifyTwoFactorCodeWithCap(
            trader.id,
            input.twoFactorCode,
            "password_change"
          );
          if (!codeValid) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid or expired verification code",
            });
          }
        }

        const hashed = await hashPassword(input.newPassword);
        await updateMagicNumber(trader.id, { password: hashed });

        // Password change may complete onboarding → activate live copiers.
        void maybeActivateOnboarding(trader.id);

        return { success: true, requires2FA: false };
      }),

    getSession: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        return {
          id: trader.id,
          magicNumber: trader.magicNumber,
          name: trader.name,
          profitShare: parseFloat(trader.profitShare),
          showAllData: trader.showAllData,
          isAdmin: ctx.tradingSession.magicNumber.isAdmin || false,
          isViewedTraderAdmin: trader.isAdmin || false,
          lifetimeProfit: parseFloat(trader.lifetimeProfit || "0"),
          lifetimeProfitShare: parseFloat(trader.lifetimeProfitShare || "0"),
          lifetimeIncome: parseFloat(trader.lifetimeIncome || "0"),
          usdtAddress: trader.usdtAddress || null,
          usdtNetwork: trader.usdtNetwork || null,
          telegramHandle: trader.telegramHandle || null,
          telegramConnected: !!trader.telegramChatId,
          showMyTradesUrl: trader.showMyTradesUrl || null,
        };
      }),

    // Update USDT payment information
    updateUsdtInfo: tradingProcedure
      .input(
        z.object({
          usdtAddress: z.string().optional(),
          usdtNetwork: z.enum(["TRC20", "ERC20"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const magicNumberId = ctx.tradingSession.magicNumber.id;

        await updateMagicNumber(magicNumberId, {
          usdtAddress: input.usdtAddress,
          usdtNetwork: input.usdtNetwork,
        });

        // Saving USDT details may complete onboarding → activate live copiers.
        void maybeActivateOnboarding(magicNumberId);

        return { success: true };
      }),

    // Update Telegram handle for current trader
    updateTelegramHandle: tradingProcedure
      .input(
        z.object({
          telegramHandle: z.string().min(1).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const magicNumberId = ctx.tradingSession.magicNumber.id;
        await updateMagicNumber(magicNumberId, {
          telegramHandle: input.telegramHandle,
        });
        return { success: true };
      }),

    // Send a test "Hello World" Telegram message to the trader's handle
    testTelegramMessage: tradingProcedure.mutation(async ({ ctx }) => {
      const { telegramHandle, telegramChatId, name } =
        ctx.tradingSession.magicNumber;
      if (!telegramHandle) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Telegram handle set. Save your handle first.",
        });
      }
      if (!telegramChatId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Telegram not connected yet. Open Telegram, search for @RFXTraderBot and send /start, then try again.",
        });
      }
      const sent = await sendTelegramMessage(
        telegramHandle,
        `Hello World! 👋 This is a test message from RFX Trader Dashboard, ${name}. Your Telegram notifications are working correctly.`,
        telegramChatId
      );
      if (!sent) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send Telegram message. Please try again.",
        });
      }
      return { success: true };
    }),

    // Get payment history for current trader (or viewed trader for admin)
    getPayments: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const magicNumberId = trader.id;
        const payments = await getPaymentsByMagicNumberId(magicNumberId);

        return payments.map(p => ({
          id: p.id,
          amount: parseFloat(p.amount),
          networkFee: p.networkFee != null ? parseFloat(p.networkFee) : 0,
          network: p.network ?? null,
          narration: p.narration ?? null,
          transactionHash: p.transactionHash,
          paymentDate: p.paymentDate,
          createdAt: p.createdAt,
          traderName: trader.name,
          usdtAddress: trader.usdtAddress ?? null,
        }));
      }),

    // Get notifications for current trader (or viewed trader for admin)
    getNotifications: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const magicNumberId = trader.id;
        const notifs = await getNotificationsByMagicNumberId(magicNumberId);

        return notifs.map(n => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.isRead,
          createdAt: n.createdAt,
        }));
      }),

    // Mark notification as read (scoped to the caller's own notifications)
    markNotificationRead: tradingProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await markNotificationAsRead(
          input.notificationId,
          ctx.tradingSession.magicNumber.id
        );
        return { success: true };
      }),

    // Mark all notifications as read
    markAllNotificationsRead: tradingProcedure.mutation(async ({ ctx }) => {
      const magicNumberId = ctx.tradingSession.magicNumber.id;
      await markAllNotificationsAsRead(magicNumberId);
      return { success: true };
    }),

    // Get copier configuration for trader's live account
    getCopierInfo: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { magicNumber, liveAccountNumber } = trader;

        if (!liveAccountNumber) {
          return null; // No live account assigned
        }

        // Get the live account ID
        const liveAccountId =
          await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
        if (!liveAccountId) {
          return null;
        }

        // Get all copiers for this live account
        const copiers =
          await metaCopierService.getCopiersByAccount(liveAccountId);

        // Find the copier that matches this trader's magic number
        const traderCopier = copiers.find(
          (copier: any) =>
            copier.fromAccountShortId === parseInt(magicNumber) ||
            copier.fromAccountShortId === magicNumber ||
            copier.customMagicNumber === parseInt(magicNumber) ||
            copier.customMagicNumber === magicNumber
        );

        if (!traderCopier) {
          return null;
        }

        return {
          scaleType: traderCopier.scaleType?.id || traderCopier.scaleType,
          multiplier: traderCopier.multiplier,
          fixedLotSize: traderCopier.fixedLotSize,
          isActive: traderCopier.active,
          liveAccountNumber,
        };
      }),

    // Get max open trades from trader's MC account features
    getMaxOpenTrades: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { mcAccountId } = trader;

        if (!mcAccountId) {
          return null; // No MC account
        }

        try {
          const features =
            await metaCopierService.getAccountFeatures(mcAccountId);

          // Find the max open positions feature (type 17)
          const maxOpenPosFeature = features.find(
            (f: any) => f.type?.id === 17
          );

          if (maxOpenPosFeature && maxOpenPosFeature.setting) {
            return maxOpenPosFeature.setting.maxOpenPositions || null;
          }

          return null;
        } catch (error) {
          console.error("[Router] Error fetching max open trades:", error);
          return null;
        }
      }),

    // Get max lot size per trade from Trade Guardrails feature (type 37)
    getMaxLotSize: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { mcAccountId } = trader;

        if (!mcAccountId) {
          return null;
        }

        try {
          const features =
            await metaCopierService.getAccountFeatures(mcAccountId);

          // Find the Trade Guardrails feature (type 37)
          const guardrailFeature = features.find((f: any) => f.type?.id === 37);

          if (guardrailFeature && guardrailFeature.setting?.enabled) {
            return guardrailFeature.setting.maxLotSizeThreshold ?? null;
          }

          return null;
        } catch (error) {
          console.error("[Router] Error fetching max lot size:", error);
          return null;
        }
      }),

    // Get account risk limit (absolute equity threshold before all trades close)
    getRiskLimit: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { mcAccountId } = trader;

        if (!mcAccountId) {
          return null;
        }

        try {
          const limits =
            await metaCopierService.getAccountRiskLimits(mcAccountId);
          // Find the first active absolute risk limit
          const activeLimit = limits.find(
            (l: any) => l.active && l.absoluteRiskLimit != null
          );
          if (activeLimit) {
            return activeLimit.absoluteRiskLimit as number;
          }
          return null;
        } catch (error) {
          console.error("[Router] Error fetching risk limit:", error);
          return null;
        }
      }),

    // Get current account equity for breach detection
    getAccountEquity: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { mcAccountId } = trader;

        // Always use the trader's own MC account for equity (breach detection must compare
        // the trader's incubator account equity against their risk limit, not the master account)
        if (!mcAccountId) return null;

        try {
          const info = await metaCopierService.getAccountInfoById(mcAccountId);
          return info.equity ?? null;
        } catch {
          return null;
        }
      }),

    // Get both balance and equity for the trader's own incubator account
    getAccountBalanceAndEquity: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { mcAccountId } = trader;

        // Always use the trader's own MC account (mcAccountId), not the master/live account
        if (!mcAccountId) return null;

        try {
          const info = await metaCopierService.getAccountInfoById(mcAccountId);
          return { balance: info.balance ?? null, equity: info.equity ?? null };
        } catch {
          return null;
        }
      }),

    // Report a risk limit breach (called by the trader's dashboard when equity drops below limit)
    reportRiskLimitBreach: tradingProcedure
      .input(
        z.object({
          equity: z.number(),
          riskLimit: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const trader = ctx.tradingSession.magicNumber;

        // Avoid duplicate breach records — only create one if no active breach exists
        const existing = await getActiveBreachByMagicNumberId(trader.id);
        if (existing) {
          return { alreadyReported: true };
        }

        // Record the breach
        await createRiskLimitBreach({
          magicNumberId: trader.id,
          equityAtBreach: String(input.equity),
          riskLimitAtBreach: String(input.riskLimit),
          traderNotified: false,
          adminNotified: false,
        });

        // In-app notification for the trader
        await createNotification({
          magicNumberId: trader.id,
          title: `[Magic ${trader.magicNumber}] Risk Limit Breached — Trading Disabled`,
          message: `Your incubator account equity dropped to $${input.equity.toFixed(2)}, below your risk limit of $${input.riskLimit.toFixed(2)}. All trades have been closed. Please contact an admin to re-enable trading.`,
          type: "error",
        });

        // Telegram notification for the trader
        let traderTelegramSent = false;
        if (trader.telegramHandle && trader.telegramChatId) {
          const msg = buildRiskLimitBreachMessage({
            traderName: trader.name,
            magicNumber: trader.magicNumber,
            equity: input.equity,
            riskLimit: input.riskLimit,
          });
          traderTelegramSent = await sendTelegramMessage(
            trader.telegramHandle,
            msg,
            trader.telegramChatId
          );
        }

        // Owner in-app notification
        try {
          await notifyOwner({
            title: `Risk Limit Breach: ${trader.name}`,
            content: `Trader ${trader.name} (Magic: ${trader.magicNumber}) breached their risk limit. Equity: $${input.equity.toFixed(2)}, Limit: $${input.riskLimit.toFixed(2)}.`,
          });
        } catch {
          // Non-fatal
        }

        return { reported: true, traderTelegramSent };
      }),

    // Get open positions
    getOpenPositions: tradingProcedure
      .input(viewAsWithMasterInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { magicNumber, liveAccountNumber } = trader;
        const showAllData = trader.showAllData || trader.isAdmin;

        // Admin: filter by specific master account
        if (showAllData && input?.masterAccountId) {
          return metaCopierService.getOpenPositionsFromAccount(
            input.masterAccountId
          );
        }

        // Admin with no master selected: aggregate across all master accounts
        if (showAllData && trader.isAdmin) {
          const masters = await metaCopierService.getAccountsByLabel("RFX Master");
          const allPositions: import("./metacopier").Position[] = [];
          for (const m of masters) {
            const positions = await metaCopierService.getOpenPositionsFromAccount(m.id);
            allPositions.push(...positions);
          }
          return allPositions;
        }

        // If trader has a live account assigned, fetch from that account
        if (liveAccountNumber && !showAllData) {
          const liveAccountId =
            await metaCopierService.getAccountIdByLoginNumber(
              liveAccountNumber
            );
          if (liveAccountId) {
            return await metaCopierService.getOpenPositionsFromAccount(
              liveAccountId,
              magicNumber
            );
          }
        }

        // Fallback to default account
        const positions = await metaCopierService.getOpenPositions(
          showAllData ? undefined : magicNumber,
          showAllData
        );
        return positions;
      }),

    // Get today's closed positions
    getTodayPositions: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { magicNumber, liveAccountNumber } = trader;
        const showAllData = trader.showAllData || trader.isAdmin;

        // Admin: aggregate across all master accounts
        if (showAllData && trader.isAdmin) {
          const masters = await metaCopierService.getAccountsByLabel("RFX Master");
          const all: import("./metacopier").Position[] = [];
          for (const m of masters) {
            all.push(...await metaCopierService.getHistoricalPositionsFromAccount(
              m.id, getStartOfToday(), getEndOfToday()
            ));
          }
          return all;
        }

        // If trader has a live account assigned, fetch from that account
        if (liveAccountNumber && !showAllData) {
          const liveAccountId =
            await metaCopierService.getAccountIdByLoginNumber(
              liveAccountNumber
            );
          if (liveAccountId) {
            return await metaCopierService.getHistoricalPositionsFromAccount(
              liveAccountId,
              getStartOfToday(),
              getEndOfToday(),
              magicNumber
            );
          }
        }

        // Fallback to default account
        const positions = await metaCopierService.getHistoricalPositions(
          getStartOfToday(),
          getEndOfToday(),
          showAllData ? undefined : magicNumber,
          showAllData
        );
        return positions;
      }),

    // Get week's positions
    getWeekPositions: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { magicNumber, liveAccountNumber } = trader;
        const showAllData = trader.showAllData || trader.isAdmin;

        if (showAllData && trader.isAdmin) {
          const masters = await metaCopierService.getAccountsByLabel("RFX Master");
          const all: import("./metacopier").Position[] = [];
          for (const m of masters) {
            all.push(...await metaCopierService.getHistoricalPositionsFromAccount(
              m.id, getStartOfWeek(), getEndOfToday()
            ));
          }
          return all;
        }

        if (liveAccountNumber && !showAllData) {
          const liveAccountId =
            await metaCopierService.getAccountIdByLoginNumber(
              liveAccountNumber
            );
          if (liveAccountId) {
            return await metaCopierService.getHistoricalPositionsFromAccount(
              liveAccountId,
              getStartOfWeek(),
              getEndOfToday(),
              magicNumber
            );
          }
        }

        const positions = await metaCopierService.getHistoricalPositions(
          getStartOfWeek(),
          getEndOfToday(),
          showAllData ? undefined : magicNumber,
          showAllData
        );
        return positions;
      }),

    // Get month's positions
    getMonthPositions: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { magicNumber, showAllData, liveAccountNumber } = trader;

        // If trader has a live account assigned, fetch from that account
        if (liveAccountNumber && !showAllData) {
          const liveAccountId =
            await metaCopierService.getAccountIdByLoginNumber(
              liveAccountNumber
            );
          if (liveAccountId) {
            return await metaCopierService.getHistoricalPositionsFromAccount(
              liveAccountId,
              getStartOfMonth(),
              getEndOfToday(),
              magicNumber
            );
          }
        }

        // Fallback to default account
        const positions = await metaCopierService.getHistoricalPositions(
          getStartOfMonth(),
          getEndOfToday(),
          showAllData ? undefined : magicNumber,
          showAllData
        );
        return positions;
      }),

    // Get all-time positions (aggregated across historical magic numbers & master accounts)
    getAllTimePositions: tradingProcedure
      .input(viewAsWithMasterInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);

        const effectiveShowAll = trader.showAllData || trader.isAdmin;

        // Admin: filter by specific master account
        if (effectiveShowAll && input?.masterAccountId) {
          return metaCopierService.getHistoricalPositionsFromAccount(
            input.masterAccountId,
            getAllTimeStart(),
            getEndOfToday()
          );
        }

        // Admin with no master selected: aggregate across all master accounts
        if (effectiveShowAll && trader.isAdmin) {
          const masters = await metaCopierService.getAccountsByLabel("RFX Master");
          const allPositions: import("./metacopier").Position[] = [];
          for (const m of masters) {
            const positions = await metaCopierService.getHistoricalPositionsFromAccount(
              m.id,
              getAllTimeStart(),
              getEndOfToday()
            );
            allPositions.push(...positions);
          }
          const seen = new Set<string>();
          return allPositions.filter(p => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        }

        return fetchAggregatedLifetimePositions({
          ...trader,
          showAllData: effectiveShowAll,
        });
      }),

    // Get account info
    getAccountInfo: tradingProcedure.query(async () => {
      return metaCopierService.getAccountInfo();
    }),

    // Calculate P&L summary
    getPnLSummary: tradingProcedure
      .input(viewAsInput)
      .query(async ({ ctx, input }) => {
        const trader = await resolveTrader(ctx, input?.viewAsTraderId);
        const { magicNumber, profitShare, liveAccountNumber } = trader;
        const showAllData = trader.showAllData || trader.isAdmin;

        // Admin: aggregate P&L across all master accounts
        if (showAllData && trader.isAdmin) {
          const masters = await metaCopierService.getAccountsByLabel("RFX Master");
          const aggregate = async (
            fetcher: (accountId: string) => Promise<import("./metacopier").Position[]>
          ) => {
            const all: import("./metacopier").Position[] = [];
            for (const m of masters) all.push(...await fetcher(m.id));
            return all;
          };
          const [
            openPositions,
            todayPositions,
            weekPositions,
            monthPositions,
            allTimePositions,
          ] = await Promise.all([
            aggregate(id => metaCopierService.getOpenPositionsFromAccount(id)),
            aggregate(id => metaCopierService.getHistoricalPositionsFromAccount(id, getStartOfToday(), getEndOfToday())),
            aggregate(id => metaCopierService.getHistoricalPositionsFromAccount(id, getStartOfWeek(), getEndOfToday())),
            aggregate(id => metaCopierService.getHistoricalPositionsFromAccount(id, getStartOfMonth(), getEndOfToday())),
            aggregate(id => metaCopierService.getHistoricalPositionsFromAccount(id, getAllTimeStart(), getEndOfToday())),
          ]);

          const floatingPnL = calculatePnL(openPositions);
          const todayRealizedPnL = calculatePnL(todayPositions);
          const profitShareValue = parseFloat(profitShare);
          const weekPnL = calculatePnL(weekPositions) + floatingPnL;

          return {
            floatingPnL,
            todayRealizedPnL,
            todayTotalPnL: floatingPnL + todayRealizedPnL,
            weekPnL,
            monthPnL: calculatePnL(monthPositions) + floatingPnL,
            allTimePnL: calculatePnL(allTimePositions) + floatingPnL,
            weeklyProfitShare: weekPnL > 0 ? weekPnL * profitShareValue : 0,
            profitSharePercent: profitShareValue,
          };
        }

        // If trader has a live account assigned, fetch from that account
        let liveAccountId: string | null = null;
        if (liveAccountNumber && !showAllData) {
          liveAccountId =
            await metaCopierService.getAccountIdByLoginNumber(
              liveAccountNumber
            );
        }

        // Day/week/month use current magic + current account only.
        // All-time aggregates across historical magic numbers & master accounts.
        const [
          openPositions,
          todayPositions,
          weekPositions,
          monthPositions,
          allTimePositions,
        ] = await Promise.all([
          liveAccountId
            ? metaCopierService.getOpenPositionsFromAccount(
                liveAccountId,
                magicNumber
              )
            : metaCopierService.getOpenPositions(
                showAllData ? undefined : magicNumber,
                showAllData
              ),
          liveAccountId
            ? metaCopierService.getHistoricalPositionsFromAccount(
                liveAccountId,
                getStartOfToday(),
                getEndOfToday(),
                magicNumber
              )
            : metaCopierService.getHistoricalPositions(
                getStartOfToday(),
                getEndOfToday(),
                showAllData ? undefined : magicNumber,
                showAllData
              ),
          liveAccountId
            ? metaCopierService.getHistoricalPositionsFromAccount(
                liveAccountId,
                getStartOfWeek(),
                getEndOfToday(),
                magicNumber
              )
            : metaCopierService.getHistoricalPositions(
                getStartOfWeek(),
                getEndOfToday(),
                showAllData ? undefined : magicNumber,
                showAllData
              ),
          liveAccountId
            ? metaCopierService.getHistoricalPositionsFromAccount(
                liveAccountId,
                getStartOfMonth(),
                getEndOfToday(),
                magicNumber
              )
            : metaCopierService.getHistoricalPositions(
                getStartOfMonth(),
                getEndOfToday(),
                showAllData ? undefined : magicNumber,
                showAllData
              ),
          fetchAggregatedLifetimePositions(trader),
        ]);

        const floatingPnL = calculatePnL(openPositions);
        const todayRealizedPnL = calculatePnL(todayPositions);
        const weekRealizedPnL = calculatePnL(weekPositions);
        const monthRealizedPnL = calculatePnL(monthPositions);
        const allTimeRealizedPnL = calculatePnL(allTimePositions);
        const todayTotalPnL = floatingPnL + todayRealizedPnL;
        const weekPnL = weekRealizedPnL + floatingPnL;
        const monthPnL = monthRealizedPnL + floatingPnL;
        const allTimePnL = allTimeRealizedPnL + floatingPnL;

        const profitShareValue = parseFloat(profitShare);
        const weeklyProfitShare = weekPnL > 0 ? weekPnL * profitShareValue : 0;

        return {
          floatingPnL,
          todayRealizedPnL,
          // Realized (closed-only) components, so the client can recombine with
          // live floating P&L for realtime week/month/all-time figures.
          weekRealizedPnL,
          monthRealizedPnL,
          allTimeRealizedPnL,
          todayTotalPnL,
          weekPnL,
          monthPnL,
          allTimePnL,
          weeklyProfitShare,
          profitSharePercent: profitShareValue,
        };
      }),
  }),

  admin: router({
    // List all traders
    listTraders: tradingProcedure.query(async ({ ctx }) => {
      // Check if user is admin
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const traders = await getAllMagicNumbers();

      // Process traders with concurrency limit to avoid 429 rate limits
      const CONCURRENCY = 3;
      const enriched: Awaited<ReturnType<typeof enrichTrader>>[] = [];

      async function enrichTrader(t: (typeof traders)[number]) {
          const profitSummary: {
            weekPnL: number | null;
            monthPnL: number | null;
            lifetimePnL: number | null;
          } = { weekPnL: null, monthPnL: null, lifetimePnL: null };
          type CopierInfo = {
            scaleType: number;
            multiplier: number;
            fixedLotSize: number;
            isActive: boolean;
          };
          let copierInfo: CopierInfo | null = null;

          // The admin account isn't a real trader (no magic / live account), so
          // MetaCopier profit + copier lookups 400 and just spam logs — skip them.
          const profitPromise = t.isAdmin
            ? Promise.resolve()
            : computeTraderProfitSummary({
                id: t.id,
                magicNumber: t.magicNumber,
                liveAccountNumber: t.liveAccountNumber,
                showAllData: t.showAllData,
              })
                .then(s => {
                  profitSummary.weekPnL = s.weekPnL;
                  profitSummary.monthPnL = s.monthPnL;
                  profitSummary.lifetimePnL = s.lifetimePnL;
                })
                .catch(error => {
                  console.error(
                    `Failed to compute profit summary for ${t.name} (${t.magicNumber}):`,
                    error?.message || error
                  );
                });

          const copierPromise = (async () => {
            if (t.isAdmin || !t.liveAccountNumber) return;
            try {
              const accountId =
                await metaCopierService.getAccountIdByLoginNumber(
                  t.liveAccountNumber
                );
              if (!accountId) return;
              const copiers =
                await metaCopierService.getCopiersByAccount(accountId);
              const traderCopier = copiers.find(
                (c: any) =>
                  c.fromAccountShortId === parseInt(t.magicNumber) ||
                  c.fromAccountShortId === t.magicNumber ||
                  c.customMagicNumber === parseInt(t.magicNumber) ||
                  c.customMagicNumber === t.magicNumber
              );
              if (traderCopier) {
                copierInfo = {
                  scaleType:
                    traderCopier.scaleType?.id || traderCopier.scaleType,
                  multiplier: traderCopier.multiplier,
                  fixedLotSize: traderCopier.fixedLotSize,
                  isActive: traderCopier.active,
                };
              }
            } catch (error) {
              console.error(
                `Failed to fetch copier for trader ${t.magicNumber}:`,
                error
              );
            }
          })();

          await Promise.all([profitPromise, copierPromise]);

          return {
            id: t.id,
            magicNumber: t.magicNumber,
            name: t.name,
            profitShare: parseFloat(t.profitShare),
            isActive: t.isActive,
            isAdmin: t.isAdmin,
            mtAccount: t.mtAccount,
            mtServer: t.mtServer,
            mtPassword: t.mtPassword,
            mtVersion: t.mtVersion,
            mcLocation: t.mcLocation,
            mcAccountId: t.mcAccountId,
            liveAccountNumber: t.liveAccountNumber,
            manager: t.manager,
            payoutCycle: t.payoutCycle,
            telegramHandle: t.telegramHandle,
            telegramConnected: !!t.telegramChatId,
            showMyTradesUrl: t.showMyTradesUrl || null,
            trailingRiskLimit: t.trailingRiskLimit
              ? parseFloat(t.trailingRiskLimit)
              : null,
            trailingRiskLimitEnabled: t.trailingRiskLimitEnabled,
            weekPnL: profitSummary.weekPnL,
            monthPnL: profitSummary.monthPnL,
            lifetimeProfit: profitSummary.lifetimePnL,
            lifetimeProfitShare:
              profitSummary.lifetimePnL !== null &&
              profitSummary.lifetimePnL > 0
                ? profitSummary.lifetimePnL * parseFloat(t.profitShare)
                : profitSummary.lifetimePnL === null
                  ? null
                  : 0,
            lifetimeIncome: t.lifetimeIncome ? parseFloat(t.lifetimeIncome) : 0,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            copierInfo: copierInfo as CopierInfo | null,
          };
      }

      for (let i = 0; i < traders.length; i += CONCURRENCY) {
        const batch = traders.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(enrichTrader));
        enriched.push(...results);
      }

      return enriched;
    }),

    // Create new trader
    createTrader: tradingProcedure
      .input(
        z.object({
          magicNumber: z.string(),
          name: z.string(),
          password: z.string(),
          profitShare: z.number().min(0).max(1),
          mtAccount: z.string().optional(),
          mtServer: z.string().optional(),
          mtPassword: z.string().optional(),
          mtVersion: z.string().optional(),
          mcLocation: z.string().optional(),
          payoutCycle: z
            .enum(["Weekly", "Fortnightly", "Self Service"])
            .optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const hashedPassword = await hashPassword(input.password);
        await createMagicNumber({
          magicNumber: input.magicNumber,
          name: input.name,
          password: hashedPassword,
          profitShare: input.profitShare.toString(),
          mtAccount: input.mtAccount || null,
          mtServer: input.mtServer || null,
          mtPassword: input.mtPassword || null,
          mtVersion: input.mtVersion || null,
          mcLocation: input.mcLocation || null,
          payoutCycle: input.payoutCycle || "Fortnightly",
        });

        return { success: true };
      }),

    // Update trader
    updateTrader: tradingProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          magicNumber: z.string().min(1).optional(),
          password: z.string().optional(),
          profitShare: z.number().min(0).max(1).optional(),
          isActive: z.boolean().optional(),
          mtAccount: z.string().optional(),
          mtServer: z.string().optional(),
          mtPassword: z.string().optional(),
          mtVersion: z.string().optional(),
          mcLocation: z.string().optional(),
          payoutCycle: z
            .enum(["Weekly", "Fortnightly", "Self Service"])
            .optional(),
          liveAccountNumber: z.string().optional(),
          telegramHandle: z.string().optional(),
          showMyTradesUrl: z.string().optional(),
          trailingRiskLimit: z.number().nullable().optional(),
          trailingRiskLimitEnabled: z.boolean().optional(),
          lifetimeProfit: z.number().optional(),
          lifetimeProfitShare: z.number().optional(),
          lifetimeIncome: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const { id, ...data } = input;
        const updateData: any = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.magicNumber !== undefined)
          updateData.magicNumber = data.magicNumber;
        if (data.password !== undefined)
          updateData.password = await hashPassword(data.password);
        if (data.profitShare !== undefined)
          updateData.profitShare = data.profitShare.toString();
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.mtAccount !== undefined) updateData.mtAccount = data.mtAccount;
        if (data.mtServer !== undefined) updateData.mtServer = data.mtServer;
        if (data.mtPassword !== undefined)
          updateData.mtPassword = data.mtPassword;
        if (data.mtVersion !== undefined) updateData.mtVersion = data.mtVersion;
        if (data.mcLocation !== undefined)
          updateData.mcLocation = data.mcLocation;
        if (data.payoutCycle !== undefined)
          updateData.payoutCycle = data.payoutCycle;
        if (data.liveAccountNumber !== undefined)
          updateData.liveAccountNumber = data.liveAccountNumber;
        if (data.telegramHandle !== undefined)
          updateData.telegramHandle = data.telegramHandle;
        if (data.showMyTradesUrl !== undefined)
          updateData.showMyTradesUrl = data.showMyTradesUrl || null;
        if (data.trailingRiskLimit !== undefined)
          updateData.trailingRiskLimit =
            data.trailingRiskLimit != null
              ? data.trailingRiskLimit.toString()
              : null;
        if (data.trailingRiskLimitEnabled !== undefined)
          updateData.trailingRiskLimitEnabled = data.trailingRiskLimitEnabled;
        if (data.lifetimeProfit !== undefined)
          updateData.lifetimeProfit = data.lifetimeProfit.toString();
        if (data.lifetimeProfitShare !== undefined)
          updateData.lifetimeProfitShare = data.lifetimeProfitShare.toString();
        if (data.lifetimeIncome !== undefined)
          updateData.lifetimeIncome = data.lifetimeIncome.toString();

        await updateMagicNumber(id, updateData);

        return { success: true };
      }),

    // Delete trader
    deleteTrader: tradingProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        await deleteMagicNumber(input.id);

        return { success: true };
      }),

    // Check MetaCopier account status
    checkMetaCopierStatus: tradingProcedure
      .input(z.object({ traderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const trader = await getMagicNumberById(input.traderId);
        if (!trader || !trader.mtAccount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Trader MT account not configured",
          });
        }

        // Check if we have a stored MC account ID
        if (trader.mcAccountId) {
          // Verify the account still exists in MetaCopier
          try {
            const accountDetails = await metaCopierService.getAccountById(
              trader.mcAccountId
            );
            // Check if account is deleted (status.name === "Deleted")
            if (accountDetails?.status?.name === "Deleted") {
              console.warn(
                `[checkMetaCopierStatus] Account ${trader.mcAccountId} is deleted in MetaCopier`
              );
              // Clear the deleted account ID from database
              await updateMagicNumber(trader.id, { mcAccountId: null });
              return {
                exists: false,
                accountId: undefined,
                mtAccount: trader.mtAccount,
              };
            }
            return {
              exists: true,
              accountId: trader.mcAccountId,
              mtAccount: trader.mtAccount,
            };
          } catch (error: any) {
            // Account ID stored but account doesn't exist anymore
            console.warn(
              `[checkMetaCopierStatus] Stored account ID ${trader.mcAccountId} not found in MetaCopier`
            );
            // Clear the invalid mcAccountId from database
            await updateMagicNumber(trader.id, { mcAccountId: null });
            // Return not found immediately - don't search by MT account
            return {
              exists: false,
              accountId: undefined,
              mtAccount: trader.mtAccount,
            };
          }
        }

        // Fallback: search by MT account number (only if no mcAccountId was stored)
        const status = await metaCopierService.checkAccountExists(
          trader.mtAccount
        );

        return {
          exists: status.exists,
          accountId: status.accountId,
          mtAccount: trader.mtAccount,
        };
      }),

    // Create MetaCopier account
    createMetaCopierAccount: tradingProcedure
      .input(z.object({ traderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        console.log(
          `[createMetaCopierAccount] Called for traderId: ${input.traderId}`
        );

        if (!ctx.tradingSession.magicNumber.isAdmin) {
          console.log("[createMetaCopierAccount] Admin check failed");
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const trader = await getMagicNumberById(input.traderId);
        console.log(
          `[createMetaCopierAccount] Trader data:`,
          trader
            ? {
                id: trader.id,
                name: trader.name,
                mtAccount: trader.mtAccount,
                hasPassword: !!trader.mtPassword,
              }
            : "NOT FOUND"
        );
        if (
          !trader ||
          !trader.mtAccount ||
          !trader.mtPassword ||
          !trader.mtServer ||
          !trader.mtVersion ||
          !trader.mcLocation
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Trader MT account details incomplete",
          });
        }

        // Reusable demo/slave account for magic-number routing.
        const SLAVE_ACCOUNT_ID = "b94cabc8-946d-4a99-9b81-286f8553cc63";
        const warnings: string[] = [];

        // Step 1: Idempotent account — adopt an existing MC account that matches
        // this trader's MT login, otherwise create one. This avoids creating a
        // duplicate when a previous attempt half-failed, and doubles as a repair
        // path for orphaned accounts (MC account exists, DB never linked).
        let mcAccountId: string;
        let freshlyCreated = false;
        const existingAccount = await metaCopierService.checkAccountExists(
          trader.mtAccount
        );
        if (existingAccount.exists && existingAccount.accountId) {
          mcAccountId = existingAccount.accountId;
          console.log(
            `[createMetaCopierAccount] Adopting existing MC account ${mcAccountId} for MT ${trader.mtAccount}`
          );
        } else {
          console.log(
            `[createMetaCopierAccount] Calling metaCopierService.createAccount...`
          );
          const result = await metaCopierService.createAccount({
            accountNumber: trader.mtAccount,
            password: trader.mtPassword,
            server: trader.mtServer,
            location: trader.mcLocation,
            mtVersion: trader.mtVersion,
            name: trader.name,
          });
          console.log(
            `[createMetaCopierAccount] MetaCopier API result:`,
            result
          );
          if (!result.success || !result.accountId) {
            // Genuine creation failure — nothing was persisted, surface it.
            return result;
          }
          mcAccountId = result.accountId;
          freshlyCreated = true;
        }

        // Step 2: Persist mcAccountId IMMEDIATELY, before any copier work, so the
        // trader stays linked to the account even if a later step fails. This is
        // the core fix for orphaned accounts (MC created, DB never updated).
        await updateMagicNumber(trader.id, { mcAccountId });

        // Step 3: Ensure the demo copier exists and obtain the real magic number.
        // Reuse an existing demo copier if present (idempotent), else create one.
        let realMagic: string | number | undefined;
        try {
          const sourceCopiers =
            await metaCopierService.getCopiersBySourceAccount(mcAccountId);
          const demo = sourceCopiers.find(
            (c: any) => c.toAccountId === SLAVE_ACCOUNT_ID
          );
          if (demo) {
            realMagic = demo.fromAccountShortId ?? demo.customMagicNumber;
          } else {
            const copierResult = await metaCopierService.createCopier({
              fromAccountId: mcAccountId,
              toAccountId: SLAVE_ACCOUNT_ID,
            });
            if (copierResult.success && copierResult.fromAccountShortId) {
              realMagic = copierResult.fromAccountShortId;
            } else {
              warnings.push("could not retrieve magic number (demo copier)");
            }
          }
        } catch (error: any) {
          warnings.push(`demo copier step failed: ${error.message}`);
        }

        // Step 4: If we obtained the real magic, set it and reset the login
        // password to the new default (the magic) — only when it actually changed.
        if (
          realMagic !== undefined &&
          String(realMagic) !== String(trader.magicNumber)
        ) {
          await updateMagicNumber(trader.id, {
            magicNumber: String(realMagic),
            password: await hashPassword(String(realMagic)),
          });
        }
        // Trailing risk-limit defaults only for brand-new accounts — don't clobber
        // an existing trader's configured limit when repairing.
        if (freshlyCreated) {
          await updateMagicNumber(trader.id, {
            trailingRiskLimit: "1000",
            trailingRiskLimitEnabled: true,
          });
        }

        // Step 5: Ensure a (disabled) live-account copier when a live account is
        // configured. Skip if one already copies from this account (idempotent).
        if (trader.liveAccountNumber) {
          try {
            const liveAccount = await metaCopierService.checkAccountExists(
              trader.liveAccountNumber
            );
            if (liveAccount.exists && liveAccount.accountId) {
              const liveCopiers =
                await metaCopierService.getCopiersByAccount(
                  liveAccount.accountId
                );
              const hasLive = liveCopiers.some(
                (c: any) => c.fromAccountId === mcAccountId
              );
              if (!hasLive) {
                const liveCopierResult = await metaCopierService.createCopier({
                  fromAccountId: mcAccountId,
                  toAccountId: liveAccount.accountId,
                  status: "DISABLED",
                });
                if (!liveCopierResult.success) {
                  warnings.push(
                    `live copier failed: ${liveCopierResult.message}`
                  );
                }
              }
            } else {
              warnings.push(
                `live account ${trader.liveAccountNumber} not found in MetaCopier`
              );
            }
          } catch (error: any) {
            warnings.push(`live copier step failed: ${error.message}`);
          }
        }

        // Step 6: Rename MC account to "RFX - <name> - <magic>".
        const magicForName = realMagic ?? trader.magicNumber;
        try {
          await metaCopierService.updateAccountName(
            mcAccountId,
            `RFX - ${trader.name} - ${magicForName}`
          );
        } catch (error: any) {
          warnings.push(`rename failed: ${error.message}`);
        }

        // Step 7: Add "RFX Trader" label.
        try {
          await metaCopierService.addAccountLabel(mcAccountId, "RFX Trader");
        } catch (error: any) {
          warnings.push(`label failed: ${error.message}`);
        }

        logEvent(
          "metacopier",
          `${freshlyCreated ? "Created" : "Linked/repaired"} MC account for ${trader.name} (magic ${magicForName})` +
            (warnings.length ? ` — ${warnings.length} warning(s): ${warnings.join("; ")}` : ""),
          warnings.length ? "warn" : "info"
        );

        return {
          success: true,
          accountId: mcAccountId,
          magicNumber: String(magicForName),
          warnings,
          message: warnings.length
            ? `Account ${freshlyCreated ? "created" : "linked"} (magic ${magicForName}) with ${warnings.length} warning(s): ${warnings.join("; ")}`
            : `Account ${freshlyCreated ? "created" : "repaired"} successfully with magic number ${magicForName}`,
        };
      }),

    // Get copiers for a trader (where trader is the source)
    getCopiers: tradingProcedure
      .input(z.object({ traderId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const trader = await getMagicNumberById(input.traderId);
        if (!trader) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trader not found",
          });
        }

        // Check if trader has MC account
        const mcStatus = await metaCopierService.checkAccountExists(
          trader.mtAccount || ""
        );
        if (!mcStatus.exists || !mcStatus.accountId) {
          return [];
        }

        const copiers = await metaCopierService.getCopiersBySourceAccount(
          mcStatus.accountId
        );
        return copiers;
      }),

    // Update copier status (Disable, Manage, Activate)
    updateCopierStatus: tradingProcedure
      .input(
        z.object({
          traderId: z.number(),
          toAccountId: z.string(),
          copierId: z.string(),
          status: z.enum(["ACTIVE", "DISABLED", "MANAGE"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        await metaCopierService.updateCopierStatus(
          input.toAccountId,
          input.copierId,
          input.status
        );

        return { success: true };
      }),

    // Remove copier
    removeCopier: tradingProcedure
      .input(
        z.object({
          traderId: z.number(),
          toAccountId: z.string(),
          copierId: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        // Check for open positions
        const hasOpenPositions = await metaCopierService.copierHasOpenPositions(
          input.toAccountId
        );
        if (hasOpenPositions) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove copier with open positions",
          });
        }

        await metaCopierService.removeCopier(input.toAccountId, input.copierId);

        return { success: true };
      }),

    // Get all accounts with "RFX Master" label
    getRfxMasterAccounts: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const accounts = await metaCopierService.getAccountsByLabel("RFX Master");
      return accounts;
    }),

    // Get all traders with their current liveAccountNumber for master assignment UI
    getTradersForMasterAssignment: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const traders = await getAllMagicNumbers();
      return traders
        .filter(t => !t.isAdmin)
        .map(t => ({
          id: t.id,
          name: t.name,
          magicNumber: t.magicNumber,
          liveAccountNumber: t.liveAccountNumber || null,
        }));
    }),

    // Assign traders to a master account (sets liveAccountNumber)
    assignTradersToMaster: tradingProcedure
      .input(
        z.object({
          masterLoginAccountNumber: z.string(),
          traderIds: z.array(z.number()),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        // Update each selected trader's liveAccountNumber
        for (const traderId of input.traderIds) {
          await updateMagicNumber(traderId, {
            liveAccountNumber: input.masterLoginAccountNumber,
          });
        }
        return { success: true, updated: input.traderIds.length };
      }),

    // Unassign a trader from their current master account (clears liveAccountNumber)
    unassignTraderFromMaster: tradingProcedure
      .input(
        z.object({
          traderId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await updateMagicNumber(input.traderId, { liveAccountNumber: null });
        return { success: true };
      }),

    // Get risk limit for a specific trader (admin use)
    getTraderRiskLimit: tradingProcedure
      .input(z.object({ mcAccountId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        const limits = await metaCopierService.getAccountRiskLimits(
          input.mcAccountId
        );
        const activeLimit = limits.find(
          (l: any) => l.active && l.absoluteRiskLimit != null
        );
        return activeLimit
          ? {
              id: activeLimit.id,
              absoluteRiskLimit: activeLimit.absoluteRiskLimit as number,
            }
          : null;
      }),

    // Update risk limit for a specific trader (admin use)
    updateTraderRiskLimit: tradingProcedure
      .input(
        z.object({
          mcAccountId: z.string(),
          absoluteRiskLimit: z.number().positive(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        // Fetch existing limits to find the limit ID to update
        const limits = await metaCopierService.getAccountRiskLimits(
          input.mcAccountId
        );
        const activeLimit = limits.find((l: any) => l.active);

        if (activeLimit?.id) {
          // Update existing limit via PUT
          await metaCopierService.updateAccountRiskLimit(
            input.mcAccountId,
            activeLimit.id,
            input.absoluteRiskLimit
          );
        } else {
          // No existing limit — create one
          await metaCopierService.createAccountRiskLimit(
            input.mcAccountId,
            input.absoluteRiskLimit
          );
        }
        return { success: true };
      }),

    // Get all risk limit breach records (admin)
    getRiskLimitBreaches: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const breaches = await getAllRiskLimitBreaches();
      const traders = await getAllMagicNumbers();
      return breaches.map(b => {
        const trader = traders.find(t => t.id === b.magicNumberId);
        return {
          id: b.id,
          magicNumberId: b.magicNumberId,
          traderName: trader?.name || "Unknown",
          magicNumber: trader?.magicNumber || "N/A",
          equityAtBreach: parseFloat(b.equityAtBreach),
          riskLimitAtBreach: parseFloat(b.riskLimitAtBreach),
          traderNotified: b.traderNotified,
          adminNotified: b.adminNotified,
          resolvedAt: b.resolvedAt,
          createdAt: b.createdAt,
        };
      });
    }),

    // Resolve (clear) a risk limit breach and re-enable trading (admin)
    resolveRiskLimitBreach: tradingProcedure
      .input(z.object({ breachId: z.number(), magicNumberId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await resolveRiskLimitBreach(input.breachId);
        await updateMagicNumber(input.magicNumberId, { isActive: true });
        const resolvedTrader = await getMagicNumberById(input.magicNumberId);
        await createNotification({
          magicNumberId: input.magicNumberId,
          title: `[Magic ${resolvedTrader?.magicNumber ?? "?"}] Trading Re-enabled`,
          message:
            "An admin has reviewed your account and re-enabled trading. You may now resume trading.",
          type: "info",
        });
        return { success: true };
      }),

    // Hard-delete a single breach record (data cleanup; does NOT re-enable
    // trading — use resolveRiskLimitBreach for that).
    deleteRiskLimitBreach: tradingProcedure
      .input(z.object({ breachId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await deleteRiskLimitBreach(input.breachId);
        return { success: true };
      }),

    // Clear all resolved (historical) breach records. Active breaches untouched.
    clearBreachHistory: tradingProcedure.mutation(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const deleted = await clearResolvedRiskLimitBreaches();
      return { deleted };
    }),

    // Count active (unresolved) risk limit breaches — used for sidebar badge
    countActiveBreaches: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const count = await countActiveRiskLimitBreaches();
      return { count };
    }),

    // Get breach monitor status (last checked timestamp)
    getBreachMonitorStatus: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      return { lastCheckedAt: getLastCheckedAt() };
    }),

    // Persistent system event log for the admin Logs tab — server-side
    // pagination, latest first. "all" page size is capped to keep responses sane.
    getLogs: tradingProcedure
      .input(
        z.object({
          category: z
            .enum([
              "onboarding",
              "trailing",
              "breach",
              "telegram",
              "metacopier",
              "socket",
              "payment",
              "missed_trade",
              "system",
            ])
            .optional(),
          page: z.number().min(0).optional(),
          pageSize: z.union([z.number().min(1).max(100), z.literal("all")]).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        const ALL_CAP = 500;
        const page = input.page ?? 0;
        let limit: number;
        let offset: number;
        if (input.pageSize === "all") {
          limit = ALL_CAP;
          offset = 0;
        } else {
          limit = input.pageSize ?? 10;
          offset = page * limit;
        }
        const { entries, total } = await getLogsPaged({
          category: input.category as LogCategory | undefined,
          limit,
          offset,
        });
        return { entries, total, allCap: ALL_CAP };
      }),

    // Real-time MetaCopier socket status (for the Logs tab indicator).
    getSocketStatus: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return socketStatus();
    }),

    // Force an immediate socket reconnect (manual "force check").
    reconnectSocket: tradingProcedure.mutation(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      reconnectMetaCopierSocket();
      return { ok: true };
    }),

    getTrailingRiskLimitConfig: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      const val = await getAdminSetting(
        "trailing_risk_limit_interval_minutes"
      );
      return {
        intervalMinutes: val ? parseInt(val, 10) : 5,
        lastCheckedAt: getTrailingLastCheckedAt(),
      };
    }),

    updateTrailingRiskLimitConfig: tradingProcedure
      .input(z.object({ intervalMinutes: z.number().min(1).max(1440) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await setAdminSetting(
          "trailing_risk_limit_interval_minutes",
          String(input.intervalMinutes)
        );
        return { success: true };
      }),

    // Bulk resolve all active breaches and re-enable trading for each affected trader
    bulkResolveBreaches: tradingProcedure.mutation(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }
      // Fetch active breaches before resolving so we can re-enable each trader
      const allBreaches = await getAllRiskLimitBreaches();
      const activeBreaches = allBreaches.filter((b: any) => !b.resolvedAt);

      const resolved = await bulkResolveRiskLimitBreaches();

      for (const breach of activeBreaches) {
        await updateMagicNumber(breach.magicNumberId, { isActive: true });
        const breachTrader = await getMagicNumberById(breach.magicNumberId);
        await createNotification({
          magicNumberId: breach.magicNumberId,
          title: `[Magic ${breachTrader?.magicNumber ?? "?"}] Trading Re-enabled`,
          message:
            "An admin has reviewed your account and re-enabled trading. You may now resume trading.",
          type: "info",
        });
      }

      return { resolved };
    }),

    // Get all traders for payment dropdown
    getAllTraders: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const traders = await getAllMagicNumbers();
      return traders.map(t => ({
        id: t.id,
        name: t.name,
        magicNumber: t.magicNumber,
        usdtAddress: t.usdtAddress,
        usdtNetwork: t.usdtNetwork,
      }));
    }),

    // Get all payments with trader info
    getAllPayments: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      const payments = await getAllPayments();
      const traders = await getAllMagicNumbers();

      return payments.map(p => {
        const trader = traders.find(t => t.id === p.magicNumberId);
        return {
          id: p.id,
          amount: parseFloat(p.amount),
          transactionHash: p.transactionHash,
          paymentDate: p.paymentDate,
          notificationSent: p.notificationSent,
          traderName: trader?.name || "Unknown",
          magicNumber: trader?.magicNumber || "N/A",
          network: p.network || trader?.usdtNetwork || "TRC20",
          networkFee: parseFloat(p.networkFee || "0"),
          usdtAddress: trader?.usdtAddress || null,
          narration: p.narration || null,
          paymentType: p.paymentType || "Profit Share",
          payoutPeriodFrom: p.payoutPeriodFrom,
          payoutPeriodTo: p.payoutPeriodTo,
        };
      });
    }),

    // Make a payment
    makePayment: tradingProcedure
      .input(
        z.object({
          magicNumberId: z.number(),
          amount: z.number().positive().max(1_000_000),
          networkFee: z.number().min(0).max(10_000).optional(),
          transactionHash: z.string().min(1),
          paymentDate: z.date(),
          narration: z.string().max(500).optional(),
          paymentType: z.string().max(32).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const trader = await getMagicNumberById(input.magicNumberId);
        await recordPaymentAndNotify({
          magicNumberId: input.magicNumberId,
          amount: input.amount,
          transactionHash: input.transactionHash,
          networkFee: input.networkFee,
          network: (trader?.usdtNetwork as "TRC20" | "ERC20") ?? undefined,
          paymentDate: input.paymentDate,
          narration: input.narration,
          paymentType: input.paymentType,
        });

        return { success: true };
      }),

    // Update transaction hash on a pending payment
    updatePaymentHash: tradingProcedure
      .input(
        z.object({
          paymentId: z.number().int().positive(),
          transactionHash: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        await updatePaymentTransactionHash(
          input.paymentId,
          input.transactionHash
        );
        console.log(
          `[Payment] Updated tx hash for payment #${input.paymentId}: ${input.transactionHash}`
        );
        return { success: true };
      }),

    // Broadcast a message to all connected traders (Telegram + In-App)
    broadcastMessage: tradingProcedure
      .input(
        z.object({
          title: z.string().min(1).max(200),
          message: z.string().min(1).max(2000),
          sendTelegram: z.boolean().default(true),
          sendInApp: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const allTraders = await getAllMagicNumbers();
        let telegramSent = 0;
        let inAppSent = 0;

        for (const trader of allTraders) {
          if (input.sendInApp) {
            await createNotification({
              magicNumberId: trader.id,
              title: `[Magic ${trader.magicNumber}] ${input.title}`,
              message: input.message,
              type: "info",
              isRead: false,
            });
            inAppSent++;
          }

          // Telegram notification (only if trader has a connected chat ID)
          if (
            input.sendTelegram &&
            trader.telegramHandle &&
            trader.telegramChatId
          ) {
            const sent = await sendTelegramMessage(
              trader.telegramHandle,
              `[Magic ${trader.magicNumber}] <b>${input.title}</b>\n\n${input.message}`,
              trader.telegramChatId
            );
            if (sent) telegramSent++;
          }
        }

        return { telegramSent, inAppSent, totalTraders: allTraders.length };
      }),

    // Send a direct message to a single trader (Telegram + In-App)
    sendDirectMessage: tradingProcedure
      .input(
        z.object({
          traderId: z.number(),
          title: z.string().min(1).max(200),
          message: z.string().min(1).max(2000),
          sendTelegram: z.boolean().default(true),
          sendInApp: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const trader = await getMagicNumberById(input.traderId);
        if (!trader) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Trader not found",
          });
        }

        let telegramSent = false;
        let inAppSent = false;

        if (input.sendInApp) {
          await createNotification({
            magicNumberId: trader.id,
            title: `[Magic ${trader.magicNumber}] ${input.title}`,
            message: input.message,
            type: "info",
            isRead: false,
          });
          inAppSent = true;
        }

        if (
          input.sendTelegram &&
          trader.telegramHandle &&
          trader.telegramChatId
        ) {
          telegramSent = await sendTelegramMessage(
            trader.telegramHandle,
            `[Magic ${trader.magicNumber}] <b>${input.title}</b>\n\n${input.message}`,
            trader.telegramChatId
          );
        }

        return { telegramSent, inAppSent, traderName: trader.name };
      }),

    // Get wallet addresses and balances for configured chains
    getWalletInfo: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required",
        });
      }

      let trc20: {
        address: string;
        usdtBalance: string;
        gasFreeEnabled: boolean;
        gasFreeAddress?: string;
        gasFreeBalance?: string;
      } | null = null;
      let erc20: {
        address: string;
        usdtBalance: string;
        nativeBalance: string;
        chainName: string;
      } | null = null;

      if (isTronConfigured()) {
        try {
          const [address, usdtBalance] = await Promise.all([
            getTronWalletAddress(),
            getTronBalance(),
          ]);
          trc20 = {
            address,
            usdtBalance,
            gasFreeEnabled: isGasFreeConfigured(),
          };

          // Fetch GasFree address and balance if configured
          if (isGasFreeConfigured()) {
            try {
              const gfInfo = await getGasFreeAccountInfo();
              trc20.gasFreeAddress = gfInfo.gasFreeAddress;
              trc20.gasFreeBalance = gfInfo.usdtBalance;
            } catch (err) {
              console.error(
                "[Wallet] Failed to fetch GasFree account info:",
                err
              );
            }
          }
        } catch (err) {
          console.error("[Wallet] Failed to fetch TRC-20 wallet info:", err);
        }
      }

      if (isEvmConfigured()) {
        try {
          const [address, usdtBalance, nativeBalance] = await Promise.all([
            getEvmWalletAddress(),
            getEvmBalance(),
            getNativeBalance(),
          ]);
          erc20 = {
            address,
            usdtBalance,
            nativeBalance,
            chainName: ENV.evmChainName,
          };
        } catch (err) {
          console.error("[Wallet] Failed to fetch ERC-20 wallet info:", err);
        }
      }

      return { trc20, erc20 };
    }),

    // Send USDT from the configured wallet to a trader's address
    sendWalletPayment: tradingProcedure
      .input(
        z.object({
          magicNumberId: z.number().int().positive(),
          amount: z.number().positive().max(10_000),
          narration: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        // One in-flight payout per trader: a double-click or concurrent admin
        // must not broadcast the same payment twice.
        if (inFlightWalletPayments.has(input.magicNumberId)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A wallet payment for this trader is already in progress. Wait for it to finish before sending another.",
          });
        }
        inFlightWalletPayments.add(input.magicNumberId);

        try {
          const trader = await getMagicNumberById(input.magicNumberId);
          if (!trader) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Trader not found",
            });
          }
          if (!trader.usdtAddress || !trader.usdtNetwork) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Trader has no USDT address or network configured",
            });
          }

          const network = trader.usdtNetwork as "TRC20" | "ERC20";
          let txHash: string;

          try {
            if (network === "TRC20") {
              if (!isTronConfigured()) {
                throw new Error("TRON wallet is not configured on this server");
              }
              txHash = await sendUsdt(trader.usdtAddress, input.amount);
            } else {
              if (!isEvmConfigured()) {
                throw new Error("EVM wallet is not configured on this server");
              }
              txHash = await sendUsdtErc20(trader.usdtAddress, input.amount);
            }
          } catch (err: any) {
            if (err instanceof TxPendingError) {
              // Broadcast but unconfirmed — record it (with the real hash when
              // we have one) so the admin never re-sends manually.
              const recordedHash = err.txHash ?? `PENDING-${Date.now()}`;
              await recordPaymentAndNotify({
                magicNumberId: input.magicNumberId,
                amount: input.amount,
                transactionHash: recordedHash,
                network,
                paymentDate: new Date(),
                narration: input.narration,
              });
              console.warn(
                `[Payment] Recorded unconfirmed payment ${recordedHash} for ${trader.name} — ${err.message}`
              );
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Payment was sent but confirmation timed out. It has been recorded${err.txHash ? "" : " as pending"} — verify on the block explorer${err.txHash ? "" : " and update the transaction hash"}.`,
              });
            }

            if (err instanceof TxFailedError) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Transfer failed on-chain — no funds were sent. ${err.message}`,
              });
            }

            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: err?.message ?? "On-chain transaction failed",
            });
          }

          await recordPaymentAndNotify({
            magicNumberId: input.magicNumberId,
            amount: input.amount,
            transactionHash: txHash,
            network,
            paymentDate: new Date(),
            narration: input.narration,
          });

          return { success: true, txHash, network };
        } finally {
          inFlightWalletPayments.delete(input.magicNumberId);
        }
      }),

    // --- Profit-share payouts (high-water-mark) ---

    // Preview the payout run: per eligible trader, cumulative realized profit
    // up to `to`, their baseline, the shareable amount and payout owed.
    previewPayouts: tradingProcedure
      .input(
        z.object({
          cycle: z.enum(["Weekly", "Fortnightly", "Ad-hoc"]),
          from: z.date(),
          to: z.date(),
        })
      )
      .query(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const { cycle, from, to } = input;
        const all = await getAllMagicNumbers();

        // Eligible: active real traders with a live account, never Self Service.
        // Weekly/Fortnightly runs only include traders on that cycle; Ad-hoc
        // includes every remaining (non-Self-Service) trader.
        const eligible = all.filter(
          t =>
            t.isActive &&
            !t.isAdmin &&
            !!t.liveAccountNumber &&
            t.payoutCycle !== "Self Service" &&
            (cycle === "Ad-hoc" || t.payoutCycle === cycle)
        );

        // Last Profit-Share payment per trader (for the waiting-period check).
        const allPayments = await getAllPayments();
        const lastPaidMap = new Map<number, Date>();
        for (const p of allPayments) {
          if (p.paymentType !== "Profit Share") continue;
          // Skip testing-mode payouts ([TEST] narration) — they must not gate
          // real payouts' waiting period.
          if (p.narration && p.narration.startsWith("[TEST]")) continue;
          // Use payoutPeriodTo only — undated legacy/manual payments don't gate.
          const when = p.payoutPeriodTo;
          if (!when) continue;
          const prev = lastPaidMap.get(p.magicNumberId);
          if (!prev || new Date(when).getTime() > prev.getTime()) {
            lastPaidMap.set(p.magicNumberId, new Date(when));
          }
        }

        const waitDays = PAYOUT_CYCLE_WAIT_DAYS[cycle] ?? 0;

        const CONCURRENCY = 3;
        const rows: Array<{
          id: number;
          name: string;
          magicNumber: string;
          profitShare: number;
          cumulativeProfit: number;
          baseline: number;
          shareableProfit: number;
          payoutAmount: number;
          usdtAddress: string | null;
          usdtNetwork: string | null;
          payoutCycle: string | null;
          lastPayoutAt: Date | null;
          payable: boolean;
          reason: string | null;
        }> = [];

        async function buildRow(t: (typeof eligible)[number]) {
          let cumulative = 0;
          try {
            cumulative = await computeCumulativeRealizedProfit(
              {
                id: t.id,
                magicNumber: t.magicNumber,
                liveAccountNumber: t.liveAccountNumber,
              },
              to
            );
          } catch (error) {
            console.error(
              `[Payouts] Failed to compute profit for ${t.name} (${t.magicNumber}):`,
              (error as any)?.message || error
            );
          }

          const profitShare = parseFloat(t.profitShare);
          const baseline = parseFloat(t.profitShareBaseline ?? "0") || 0;
          const shareableProfit = Math.max(0, cumulative - baseline);
          const payoutAmount = Math.round(shareableProfit * profitShare * 100) / 100;

          const lastPayoutAt = lastPaidMap.get(t.id) ?? null;
          const waitOk =
            cycle === "Ad-hoc" ||
            !lastPayoutAt ||
            daysBetween(lastPayoutAt, to) >= waitDays;

          let payable = true;
          let reason: string | null = null;
          if (payoutAmount <= 0) {
            payable = false;
            reason = "Nothing owed";
          } else if (!t.usdtAddress || !t.usdtNetwork) {
            payable = false;
            reason = "No USDT address set";
          } else if (!waitOk) {
            payable = false;
            const nextDue = lastPayoutAt
              ? new Date(
                  lastPayoutAt.getTime() + waitDays * 24 * 60 * 60 * 1000
                )
              : null;
            reason = nextDue
              ? `Next due ${nextDue.toISOString().slice(0, 10)}`
              : "Waiting period";
          }

          return {
            id: t.id,
            name: t.name,
            magicNumber: t.magicNumber,
            profitShare,
            cumulativeProfit: Math.round(cumulative * 100) / 100,
            baseline: Math.round(baseline * 100) / 100,
            shareableProfit: Math.round(shareableProfit * 100) / 100,
            payoutAmount,
            usdtAddress: t.usdtAddress,
            usdtNetwork: t.usdtNetwork,
            payoutCycle: t.payoutCycle,
            lastPayoutAt,
            payable,
            reason,
          };
        }

        for (let i = 0; i < eligible.length; i += CONCURRENCY) {
          const batch = eligible.slice(i, i + CONCURRENCY);
          const results = await Promise.all(batch.map(buildRow));
          rows.push(...results);
        }

        return rows;
      }),

    // Process one trader's profit-share payout: send USDT, record the payment,
    // then raise the baseline. Called once per selected trader by the client.
    processProfitSharePayout: tradingProcedure
      .input(
        z.object({
          magicNumberId: z.number().int().positive(),
          from: z.date(),
          to: z.date(),
          expectedPayoutAmount: z.number().positive(),
          cycle: z.enum(["Weekly", "Fortnightly", "Ad-hoc"]),
          testingMode: z.boolean(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        if (inFlightWalletPayments.has(input.magicNumberId)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A payout for this trader is already in progress. Wait for it to finish before sending another.",
          });
        }
        inFlightWalletPayments.add(input.magicNumberId);

        try {
          const trader = await getMagicNumberById(input.magicNumberId);
          if (!trader) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Trader not found" });
          }

          // Recompute server-side — never trust the client's figure.
          const cumulative = await computeCumulativeRealizedProfit(
            {
              id: trader.id,
              magicNumber: trader.magicNumber,
              liveAccountNumber: trader.liveAccountNumber,
            },
            input.to
          );
          const profitShare = parseFloat(trader.profitShare);
          const baseline = parseFloat(trader.profitShareBaseline ?? "0") || 0;
          const shareable = Math.max(0, cumulative - baseline);
          const payout = Math.round(shareable * profitShare * 100) / 100;

          if (payout <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No profit share is owed for this trader.",
            });
          }
          if (Math.abs(payout - input.expectedPayoutAmount) > 0.01) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Payout figure changed since preview (now $${payout.toFixed(2)}). Re-calculate before processing.`,
            });
          }

          // Waiting period (Weekly/Fortnightly only).
          if (input.cycle !== "Ad-hoc") {
            const lastPaid = await getLastProfitSharePaymentDate(
              input.magicNumberId
            );
            const waitDays = PAYOUT_CYCLE_WAIT_DAYS[input.cycle] ?? 0;
            if (lastPaid && daysBetween(lastPaid, input.to) < waitDays) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `Trader was paid less than ${waitDays} days ago — not yet due.`,
              });
            }
          }

          // Destination + network. Testing Mode redirects to our test wallet
          // (TRC20) regardless of the trader's configured address/network.
          let destination: string;
          let network: "TRC20" | "ERC20";
          if (input.testingMode) {
            destination = TEST_PAYOUT_ADDRESS;
            network = "TRC20";
          } else {
            if (!trader.usdtAddress || !trader.usdtNetwork) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Trader has no USDT address or network configured",
              });
            }
            destination = trader.usdtAddress;
            network = trader.usdtNetwork as "TRC20" | "ERC20";
          }

          const periodLabel = `${input.from.toISOString().slice(0, 10)} – ${input.to
            .toISOString()
            .slice(0, 10)}`;
          const narration = input.testingMode
            ? `[TEST] Profit share ${periodLabel}`
            : `Profit share ${periodLabel}`;

          // Test payouts must not notify the trader, touch lifetimeIncome, or
          // raise the baseline.
          const recordExtras = input.testingMode
            ? { silent: true as const, skipLifetime: true as const }
            : {};

          let txHash: string;
          try {
            if (network === "TRC20") {
              if (!isTronConfigured()) {
                throw new Error("TRON wallet is not configured on this server");
              }
              txHash = await sendUsdt(destination, payout);
            } else {
              if (!isEvmConfigured()) {
                throw new Error("EVM wallet is not configured on this server");
              }
              txHash = await sendUsdtErc20(destination, payout);
            }
          } catch (err: any) {
            if (err instanceof TxPendingError) {
              const recordedHash = err.txHash ?? `PENDING-${Date.now()}`;
              await recordPaymentAndNotify({
                magicNumberId: input.magicNumberId,
                amount: payout,
                transactionHash: recordedHash,
                network,
                paymentDate: new Date(),
                narration,
                paymentType: "Profit Share",
                payoutPeriodFrom: input.from,
                payoutPeriodTo: input.to,
                ...recordExtras,
              });
              // Baseline is NOT raised here — confirmation is uncertain.
              console.warn(
                `[Payouts] Recorded unconfirmed payout ${recordedHash} for ${trader.name} — ${err.message}`
              );
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Payout was sent but confirmation timed out. It has been recorded${err.txHash ? "" : " as pending"} — verify on the block explorer. Baseline was not advanced; re-check before re-paying.`,
              });
            }
            if (err instanceof TxFailedError) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Transfer failed on-chain — no funds were sent. ${err.message}`,
              });
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: err?.message ?? "On-chain transaction failed",
            });
          }

          await recordPaymentAndNotify({
            magicNumberId: input.magicNumberId,
            amount: payout,
            transactionHash: txHash,
            network,
            paymentDate: new Date(),
            narration,
            paymentType: "Profit Share",
            payoutPeriodFrom: input.from,
            payoutPeriodTo: input.to,
            ...recordExtras,
          });

          // Raise the high-water-mark only for real payouts.
          if (!input.testingMode) {
            await setProfitShareBaseline(input.magicNumberId, cumulative);
          }

          return {
            success: true,
            txHash,
            network,
            payout,
            newBaseline: input.testingMode ? baseline : cumulative,
            testingMode: input.testingMode,
          };
        } finally {
          inFlightWalletPayments.delete(input.magicNumberId);
        }
      }),

    // Mark a trader as settled up to `to` WITHOUT paying — sets the baseline to
    // their current cumulative profit. The start-at-zero escape hatch.
    setPayoutBaseline: tradingProcedure
      .input(
        z.object({
          magicNumberId: z.number().int().positive(),
          to: z.date(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }

        const trader = await getMagicNumberById(input.magicNumberId);
        if (!trader) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Trader not found" });
        }

        const cumulative = await computeCumulativeRealizedProfit(
          {
            id: trader.id,
            magicNumber: trader.magicNumber,
            liveAccountNumber: trader.liveAccountNumber,
          },
          input.to
        );
        await setProfitShareBaseline(input.magicNumberId, cumulative);
        logEvent(
          "payment",
          `Set profit-share baseline for ${trader.name} (${trader.magicNumber}) to $${cumulative.toFixed(2)} (no payout)`
        );

        return { success: true, baseline: Math.round(cumulative * 100) / 100 };
      }),

    // --- Previous Magic Numbers ---

    getPreviousMagicNumbers: tradingProcedure
      .input(z.object({ traderId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        return await getPreviousMagicNumbers(input.traderId);
      }),

    addPreviousMagicNumber: tradingProcedure
      .input(
        z.object({
          traderId: z.number(),
          magicNumber: z.string().min(1).max(20),
          note: z.string().max(255).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await addPreviousMagicNumber(
          input.traderId,
          input.magicNumber,
          input.note
        );
        return { success: true };
      }),

    removePreviousMagicNumber: tradingProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await removePreviousMagicNumber(input.id);
        return { success: true };
      }),

    // --- Previous Master Accounts ---

    getPreviousMasterAccounts: tradingProcedure
      .input(z.object({ traderId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        return await getPreviousMasterAccounts(input.traderId);
      }),

    addPreviousMasterAccount: tradingProcedure
      .input(
        z.object({
          traderId: z.number(),
          liveAccountNumber: z.string().min(1).max(50),
          note: z.string().max(255).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await addPreviousMasterAccount(
          input.traderId,
          input.liveAccountNumber,
          input.note
        );
        return { success: true };
      }),

    removePreviousMasterAccount: tradingProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required",
          });
        }
        await removePreviousMasterAccount(input.id);
        return { success: true };
      }),
  }),

  // Copier Templates
  copierTemplates: router({
    // Get all copier templates
    list: adminProcedure.query(async () => {
      return await getAllCopierTemplates();
    }),

    // Get a single copier template by ID
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await getCopierTemplateById(input.id);
      }),

    // Create a new copier template
    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          multiplier: z.string().default("1.0000"),
          copyStopLoss: z.boolean().default(true),
          copyTakeProfit: z.boolean().default(true),
          skipPendingOrders: z.boolean().default(true),
          scaleTypeId: z.number().default(3),
          scaleTypeName: z.string().default("Fixed lot size"),
          active: z.boolean().default(false),
          monitorOnly: z.boolean().default(false),
          maxSlippage: z.number().default(0),
          forceMinTrade: z.boolean().default(true),
          fixMasterBalanceAndEquity: z.string().default("0.00"),
          fixSlaveBalanceAndEquity: z.string().default("0.00"),
          fixedLotSize: z.string().default("0.01"),
          martingaleStrategy: z.boolean().default(false),
          openRetry: z.boolean().default(true),
          openRetryTimeoutInMinutes: z.number().default(10),
          reverse: z.boolean().default(false),
          copyOpenPositions: z.boolean().default(false),
          maxOpenPositions: z.number().default(0),
          maxLotSize: z.string().default("0.00"),
          maximumLot: z.string().default("0.00"),
          hideComment: z.boolean().default(false),
          forcePositionLotSize: z.boolean().default(false),
          ignoreContractSize: z.boolean().default(false),
          ignoreCurrency: z.boolean().default(false),
          copyMagicNumber: z.boolean().default(true),
          copyOriginalComment: z.boolean().default(false),
        })
      )
      .mutation(async ({ input }) => {
        await createCopierTemplate(input);
        return { success: true };
      }),

    // Update a copier template
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          multiplier: z.string().optional(),
          copyStopLoss: z.boolean().optional(),
          copyTakeProfit: z.boolean().optional(),
          skipPendingOrders: z.boolean().optional(),
          scaleTypeId: z.number().optional(),
          scaleTypeName: z.string().optional(),
          active: z.boolean().optional(),
          monitorOnly: z.boolean().optional(),
          maxSlippage: z.number().optional(),
          forceMinTrade: z.boolean().optional(),
          fixMasterBalanceAndEquity: z.string().optional(),
          fixSlaveBalanceAndEquity: z.string().optional(),
          fixedLotSize: z.string().optional(),
          martingaleStrategy: z.boolean().optional(),
          openRetry: z.boolean().optional(),
          openRetryTimeoutInMinutes: z.number().optional(),
          reverse: z.boolean().optional(),
          copyOpenPositions: z.boolean().optional(),
          maxOpenPositions: z.number().optional(),
          maxLotSize: z.string().optional(),
          maximumLot: z.string().optional(),
          hideComment: z.boolean().optional(),
          forcePositionLotSize: z.boolean().optional(),
          ignoreContractSize: z.boolean().optional(),
          ignoreCurrency: z.boolean().optional(),
          copyMagicNumber: z.boolean().optional(),
          copyOriginalComment: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCopierTemplate(id, data);
        return { success: true };
      }),

    // Delete a copier template
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCopierTemplate(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
