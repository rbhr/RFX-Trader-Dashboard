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
  getPaymentsByMagicNumberId,
  getAllPayments,
  updatePaymentNotificationStatus,
  createNotification,
  getNotificationsByMagicNumberId,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createRiskLimitBreach,
  getActiveBreachByMagicNumberId,
  getAllRiskLimitBreaches,
  resolveRiskLimitBreach,
  countActiveRiskLimitBreaches,
  bulkResolveRiskLimitBreaches
} from "./db";
import { 
  metaCopierService, 
  calculatePnL,
  getStartOfToday,
  getEndOfToday,
  getStartOfWeek,
  getStartOfMonth,
  getAllTimeStart
} from "./metacopier";
import { nanoid } from "nanoid";
import { sendTelegramMessage, buildPaymentMessage, buildRiskLimitBreachMessage, buildAdminRiskLimitAlertMessage } from "./telegram";
import { notifyOwner } from "./_core/notification";
import { getLastCheckedAt } from "./breachMonitor";

const TRADING_SESSION_COOKIE = "rfx_trading_session";

// Custom procedure for trading authentication
const tradingProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const sessionToken = ctx.req.cookies?.[TRADING_SESSION_COOKIE];
  
  if (!sessionToken) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No trading session found" });
  }

  const sessionData = await getTradingSessionByToken(sessionToken);
  
  if (!sessionData) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired session" });
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

    // Login with magic number and password
    login: publicProcedure
      .input(z.object({
        magicNumber: z.string(),
        password: z.string(),
        rememberMe: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const magicNumberData = await getMagicNumberByNumber(input.magicNumber);
        
        if (!magicNumberData) {
          throw new TRPCError({ 
            code: "NOT_FOUND", 
            message: "Invalid magic number" 
          });
        }

        if (magicNumberData.password !== input.password) {
          throw new TRPCError({ 
            code: "UNAUTHORIZED", 
            message: "Invalid password" 
          });
        }

        // Create session
        const sessionToken = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (input.rememberMe ? 30 : 7));

        await createTradingSession({
          sessionToken,
          magicNumberId: magicNumberData.id,
          ipAddress: ctx.req.ip || null,
          userAgent: ctx.req.headers['user-agent'] || null,
          expiresAt,
        });

        // Set cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(TRADING_SESSION_COOKIE, sessionToken, {
          ...cookieOptions,
          maxAge: input.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
        });

        return {
          success: true,
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
      ctx.res.clearCookie(TRADING_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });

      return { success: true };
    }),

    // Get current session info
    getSession: tradingProcedure.query(({ ctx }) => {
      return {
        magicNumber: ctx.tradingSession.magicNumber.magicNumber,
        name: ctx.tradingSession.magicNumber.name,
        profitShare: parseFloat(ctx.tradingSession.magicNumber.profitShare),
        showAllData: ctx.tradingSession.magicNumber.showAllData,
        isAdmin: ctx.tradingSession.magicNumber.isAdmin || false,
        lifetimeProfit: parseFloat(ctx.tradingSession.magicNumber.lifetimeProfit || '0'),
        lifetimeProfitShare: parseFloat(ctx.tradingSession.magicNumber.lifetimeProfitShare || '0'),
        lifetimeIncome: parseFloat(ctx.tradingSession.magicNumber.lifetimeIncome || '0'),
        usdtAddress: ctx.tradingSession.magicNumber.usdtAddress || null,
        usdtNetwork: ctx.tradingSession.magicNumber.usdtNetwork || null,
        telegramHandle: ctx.tradingSession.magicNumber.telegramHandle || null,
        telegramConnected: !!ctx.tradingSession.magicNumber.telegramChatId,
      };
    }),

    // Update USDT payment information
    updateUsdtInfo: tradingProcedure
      .input(z.object({
        usdtAddress: z.string().optional(),
        usdtNetwork: z.enum(['TRC20', 'ERC20']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const magicNumberId = ctx.tradingSession.magicNumber.id;
        
        await updateMagicNumber(magicNumberId, {
          usdtAddress: input.usdtAddress,
          usdtNetwork: input.usdtNetwork,
        });
        
        return { success: true };
      }),

    // Update Telegram handle for current trader
    updateTelegramHandle: tradingProcedure
      .input(z.object({
        telegramHandle: z.string().min(1).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        const magicNumberId = ctx.tradingSession.magicNumber.id;
        await updateMagicNumber(magicNumberId, {
          telegramHandle: input.telegramHandle,
        });
        return { success: true };
      }),

    // Send a test "Hello World" Telegram message to the trader's handle
    testTelegramMessage: tradingProcedure
      .mutation(async ({ ctx }) => {
        const { telegramHandle, telegramChatId, name } = ctx.tradingSession.magicNumber;
        if (!telegramHandle) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No Telegram handle set. Save your handle first.' });
        }
        if (!telegramChatId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Telegram not connected yet. Open Telegram, search for @RFXTraderBot and send /start, then try again.' });
        }
        const sent = await sendTelegramMessage(telegramHandle, `Hello World! 👋 This is a test message from RFX Trader Dashboard, ${name}. Your Telegram notifications are working correctly.`, telegramChatId);
        if (!sent) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send Telegram message. Please try again.' });
        }
        return { success: true };
      }),

    // Get payment history for current trader
    getPayments: tradingProcedure.query(async ({ ctx }) => {
      const magicNumberId = ctx.tradingSession.magicNumber.id;
      const payments = await getPaymentsByMagicNumberId(magicNumberId);
      
      return payments.map(p => ({
        id: p.id,
        amount: parseFloat(p.amount),
        transactionHash: p.transactionHash,
        paymentDate: p.paymentDate,
        createdAt: p.createdAt,
      }));
    }),

    // Get notifications for current trader
    getNotifications: tradingProcedure.query(async ({ ctx }) => {
      const magicNumberId = ctx.tradingSession.magicNumber.id;
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

    // Mark notification as read
    markNotificationRead: tradingProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input }) => {
        await markNotificationAsRead(input.notificationId);
        return { success: true };
      }),

    // Mark all notifications as read
    markAllNotificationsRead: tradingProcedure.mutation(async ({ ctx }) => {
      const magicNumberId = ctx.tradingSession.magicNumber.id;
      await markAllNotificationsAsRead(magicNumberId);
      return { success: true };
    }),

    // Get copier configuration for trader's live account
    getCopierInfo: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, liveAccountNumber } = ctx.tradingSession.magicNumber;
      
      if (!liveAccountNumber) {
        return null; // No live account assigned
      }
      
      // Get the live account ID
      const liveAccountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
      if (!liveAccountId) {
        return null;
      }
      
      // Get all copiers for this live account
      const copiers = await metaCopierService.getCopiersByAccount(liveAccountId);
      
      // Find the copier that matches this trader's magic number
      const traderCopier = copiers.find((copier: any) => 
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
        liveAccountNumber
      };
    }),

    // Get max open trades from trader's MC account features
    getMaxOpenTrades: tradingProcedure.query(async ({ ctx }) => {
      const { mcAccountId } = ctx.tradingSession.magicNumber;
      
      if (!mcAccountId) {
        return null; // No MC account
      }
      
      try {
        const features = await metaCopierService.getAccountFeatures(mcAccountId);
        
        // Find the max open positions feature (type 17)
        const maxOpenPosFeature = features.find((f: any) => f.type?.id === 17);
        
        if (maxOpenPosFeature && maxOpenPosFeature.setting) {
          return maxOpenPosFeature.setting.maxOpenPositions || null;
        }
        
        return null;
      } catch (error) {
        console.error('[Router] Error fetching max open trades:', error);
        return null;
      }
    }),

    // Get max lot size per trade from Trade Guardrails feature (type 37)
    getMaxLotSize: tradingProcedure.query(async ({ ctx }) => {
      const { mcAccountId } = ctx.tradingSession.magicNumber;

      if (!mcAccountId) {
        return null;
      }

      try {
        const features = await metaCopierService.getAccountFeatures(mcAccountId);

        // Find the Trade Guardrails feature (type 37)
        const guardrailFeature = features.find((f: any) => f.type?.id === 37);

        if (guardrailFeature && guardrailFeature.setting?.enabled) {
          return guardrailFeature.setting.maxLotSizeThreshold ?? null;
        }

        return null;
      } catch (error) {
        console.error('[Router] Error fetching max lot size:', error);
        return null;
      }
    }),

    // Get account risk limit (absolute equity threshold before all trades close)
    getRiskLimit: tradingProcedure.query(async ({ ctx }) => {
      const { mcAccountId } = ctx.tradingSession.magicNumber;

      if (!mcAccountId) {
        return null;
      }

      try {
        const limits = await metaCopierService.getAccountRiskLimits(mcAccountId);
        // Find the first active absolute risk limit
        const activeLimit = limits.find((l: any) => l.active && l.absoluteRiskLimit != null);
        if (activeLimit) {
          return activeLimit.absoluteRiskLimit as number;
        }
        return null;
      } catch (error) {
        console.error('[Router] Error fetching risk limit:', error);
        return null;
      }
    }),

    // Get current account equity for breach detection
    getAccountEquity: tradingProcedure.query(async ({ ctx }) => {
      const { mcAccountId } = ctx.tradingSession.magicNumber;

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
    getAccountBalanceAndEquity: tradingProcedure.query(async ({ ctx }) => {
      const { mcAccountId } = ctx.tradingSession.magicNumber;

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
      .input(z.object({
        equity: z.number(),
        riskLimit: z.number(),
      }))
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
          title: "Risk Limit Breached — Trading Disabled",
          message: `Your incubator account equity dropped to $${input.equity.toFixed(2)}, below your risk limit of $${input.riskLimit.toFixed(2)}. All trades have been closed. Please contact an admin to re-enable trading.`,
          type: "error",
        });

        // Telegram notification for the trader
        let traderTelegramSent = false;
        if (trader.telegramHandle && trader.telegramChatId) {
          const msg = buildRiskLimitBreachMessage({
            traderName: trader.name,
            equity: input.equity,
            riskLimit: input.riskLimit,
          });
          traderTelegramSent = await sendTelegramMessage(trader.telegramHandle, msg, trader.telegramChatId);
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
    getOpenPositions: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData, liveAccountNumber } = ctx.tradingSession.magicNumber;
      
      // If trader has a live account assigned, fetch from that account
      if (liveAccountNumber && !showAllData) {
        const liveAccountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
        if (liveAccountId) {
          return await metaCopierService.getOpenPositionsFromAccount(liveAccountId, magicNumber);
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
    getTodayPositions: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData, liveAccountNumber } = ctx.tradingSession.magicNumber;
      
      // If trader has a live account assigned, fetch from that account
      if (liveAccountNumber && !showAllData) {
        const liveAccountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
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
    getWeekPositions: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData, liveAccountNumber } = ctx.tradingSession.magicNumber;
      
      // If trader has a live account assigned, fetch from that account
      if (liveAccountNumber && !showAllData) {
        const liveAccountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
        if (liveAccountId) {
          return await metaCopierService.getHistoricalPositionsFromAccount(
            liveAccountId,
            getStartOfWeek(),
            getEndOfToday(),
            magicNumber
          );
        }
      }
      
      // Fallback to default account
      const positions = await metaCopierService.getHistoricalPositions(
        getStartOfWeek(),
        getEndOfToday(),
        showAllData ? undefined : magicNumber,
        showAllData
      );
      return positions;
    }),

    // Get month's positions
    getMonthPositions: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData, liveAccountNumber } = ctx.tradingSession.magicNumber;
      
      // If trader has a live account assigned, fetch from that account
      if (liveAccountNumber && !showAllData) {
        const liveAccountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
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

    // Get all-time positions
    getAllTimePositions: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData, liveAccountNumber } = ctx.tradingSession.magicNumber;
      
      // If trader has a live account assigned, fetch from that account
      if (liveAccountNumber && !showAllData) {
        const liveAccountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
        if (liveAccountId) {
          return await metaCopierService.getHistoricalPositionsFromAccount(
            liveAccountId,
            getAllTimeStart(),
            getEndOfToday(),
            magicNumber
          );
        }
      }
      
      // Fallback to default account
      const positions = await metaCopierService.getHistoricalPositions(
        getAllTimeStart(),
        getEndOfToday(),
        showAllData ? undefined : magicNumber,
        showAllData
      );
      return positions;
    }),

    // Get account info
    getAccountInfo: tradingProcedure.query(async () => {
      return metaCopierService.getAccountInfo();
    }),

    // Calculate P&L summary
    getPnLSummary: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData, profitShare, liveAccountNumber } = ctx.tradingSession.magicNumber;
      
      // If trader has a live account assigned, fetch from that account
      let liveAccountId: string | null = null;
      if (liveAccountNumber && !showAllData) {
        liveAccountId = await metaCopierService.getAccountIdByLoginNumber(liveAccountNumber);
      }
      
      const [openPositions, todayPositions, weekPositions, monthPositions, allTimePositions] = await Promise.all([
        liveAccountId 
          ? metaCopierService.getOpenPositionsFromAccount(liveAccountId, magicNumber)
          : metaCopierService.getOpenPositions(showAllData ? undefined : magicNumber, showAllData),
        liveAccountId
          ? metaCopierService.getHistoricalPositionsFromAccount(liveAccountId, getStartOfToday(), getEndOfToday(), magicNumber)
          : metaCopierService.getHistoricalPositions(getStartOfToday(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
        liveAccountId
          ? metaCopierService.getHistoricalPositionsFromAccount(liveAccountId, getStartOfWeek(), getEndOfToday(), magicNumber)
          : metaCopierService.getHistoricalPositions(getStartOfWeek(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
        liveAccountId
          ? metaCopierService.getHistoricalPositionsFromAccount(liveAccountId, getStartOfMonth(), getEndOfToday(), magicNumber)
          : metaCopierService.getHistoricalPositions(getStartOfMonth(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
        liveAccountId
          ? metaCopierService.getHistoricalPositionsFromAccount(liveAccountId, getAllTimeStart(), getEndOfToday(), magicNumber)
          : metaCopierService.getHistoricalPositions(getAllTimeStart(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
      ]);

      const floatingPnL = calculatePnL(openPositions);
      const todayRealizedPnL = calculatePnL(todayPositions);
      const todayTotalPnL = floatingPnL + todayRealizedPnL;
      const weekPnL = calculatePnL(weekPositions) + floatingPnL;
      const monthPnL = calculatePnL(monthPositions) + floatingPnL;
      const allTimePnL = calculatePnL(allTimePositions) + floatingPnL;

      const profitShareValue = parseFloat(profitShare);
      const weeklyProfitShare = weekPnL > 0 ? weekPnL * profitShareValue : 0;

      return {
        floatingPnL,
        todayRealizedPnL,
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
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const traders = await getAllMagicNumbers();
      
      // Fetch copier info for all traders with live accounts
      const copierInfoMap = new Map();
      for (const trader of traders) {
        if (trader.liveAccountNumber) {
          try {
            const accountId = await metaCopierService.getAccountIdByLoginNumber(trader.liveAccountNumber);
            const liveAccount = accountId ? { id: accountId } : null;
            if (liveAccount) {
              const copiers = await metaCopierService.getCopiersByAccount(liveAccount.id);
              const traderCopier = copiers.find((c: any) => 
                c.fromAccountShortId === parseInt(trader.magicNumber) || 
                c.fromAccountShortId === trader.magicNumber ||
                c.customMagicNumber === parseInt(trader.magicNumber) ||
                c.customMagicNumber === trader.magicNumber
              );
              if (traderCopier) {
                copierInfoMap.set(trader.magicNumber, {
                  scaleType: traderCopier.scaleType?.id || traderCopier.scaleType,
                  multiplier: traderCopier.multiplier,
                  fixedLotSize: traderCopier.fixedLotSize,
                  isActive: traderCopier.active
                });
              }
            }
          } catch (error) {
            console.error(`Failed to fetch copier for trader ${trader.magicNumber}:`, error);
          }
        }
      }
      
      return traders.map(t => ({
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
        telegramHandle: t.telegramHandle,
        telegramConnected: !!t.telegramChatId,
        lifetimeProfit: t.lifetimeProfit ? parseFloat(t.lifetimeProfit) : 0,
        lifetimeProfitShare: t.lifetimeProfitShare ? parseFloat(t.lifetimeProfitShare) : 0,
        lifetimeIncome: t.lifetimeIncome ? parseFloat(t.lifetimeIncome) : 0,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        copierInfo: copierInfoMap.get(t.magicNumber) || null,
      }));
    }),

    // Create new trader
    createTrader: tradingProcedure
      .input(z.object({
        magicNumber: z.string(),
        name: z.string(),
        password: z.string(),
        profitShare: z.number().min(0).max(1),
        mtAccount: z.string().optional(),
        mtServer: z.string().optional(),
        mtPassword: z.string().optional(),
        mtVersion: z.string().optional(),
        mcLocation: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        await createMagicNumber({
          magicNumber: input.magicNumber,
          name: input.name,
          password: input.password,
          profitShare: input.profitShare.toString(),
          mtAccount: input.mtAccount || null,
          mtServer: input.mtServer || null,
          mtPassword: input.mtPassword || null,
          mtVersion: input.mtVersion || null,
          mcLocation: input.mcLocation || null,
        });

        return { success: true };
      }),

    // Update trader
    updateTrader: tradingProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        password: z.string().optional(),
        profitShare: z.number().min(0).max(1).optional(),
        isActive: z.boolean().optional(),
        mtAccount: z.string().optional(),
        mtServer: z.string().optional(),
        mtPassword: z.string().optional(),
        mtVersion: z.string().optional(),
        mcLocation: z.string().optional(),
        liveAccountNumber: z.string().optional(),
        telegramHandle: z.string().optional(),
        lifetimeProfit: z.number().optional(),
        lifetimeProfitShare: z.number().optional(),
        lifetimeIncome: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const { id, ...data } = input;
        const updateData: any = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.password !== undefined) updateData.password = data.password;
        if (data.profitShare !== undefined) updateData.profitShare = data.profitShare.toString();
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.mtAccount !== undefined) updateData.mtAccount = data.mtAccount;
        if (data.mtServer !== undefined) updateData.mtServer = data.mtServer;
        if (data.mtPassword !== undefined) updateData.mtPassword = data.mtPassword;
        if (data.mtVersion !== undefined) updateData.mtVersion = data.mtVersion;
        if (data.mcLocation !== undefined) updateData.mcLocation = data.mcLocation;
        if (data.liveAccountNumber !== undefined) updateData.liveAccountNumber = data.liveAccountNumber;
        if (data.telegramHandle !== undefined) updateData.telegramHandle = data.telegramHandle;
        if (data.lifetimeProfit !== undefined) updateData.lifetimeProfit = data.lifetimeProfit.toString();
        if (data.lifetimeProfitShare !== undefined) updateData.lifetimeProfitShare = data.lifetimeProfitShare.toString();
        if (data.lifetimeIncome !== undefined) updateData.lifetimeIncome = data.lifetimeIncome.toString();

        await updateMagicNumber(id, updateData);

        return { success: true };
      }),

    // Delete trader
    deleteTrader: tradingProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        await deleteMagicNumber(input.id);

        return { success: true };
      }),

    // Check MetaCopier account status
    checkMetaCopierStatus: tradingProcedure
      .input(z.object({ traderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const trader = await getMagicNumberById(input.traderId);
        if (!trader || !trader.mtAccount) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Trader MT account not configured" 
          });
        }

        // Check if we have a stored MC account ID
        if (trader.mcAccountId) {
          // Verify the account still exists in MetaCopier
          try {
            const accountDetails = await metaCopierService.getAccountById(trader.mcAccountId);
            // Check if account is deleted (status.name === "Deleted")
            if (accountDetails?.status?.name === 'Deleted') {
              console.warn(`[checkMetaCopierStatus] Account ${trader.mcAccountId} is deleted in MetaCopier`);
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
            console.warn(`[checkMetaCopierStatus] Stored account ID ${trader.mcAccountId} not found in MetaCopier`);
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
        const status = await metaCopierService.checkAccountExists(trader.mtAccount);

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
        console.log(`[createMetaCopierAccount] Called for traderId: ${input.traderId}`);
        
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          console.log('[createMetaCopierAccount] Admin check failed');
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const trader = await getMagicNumberById(input.traderId);
        console.log(`[createMetaCopierAccount] Trader data:`, trader ? { id: trader.id, name: trader.name, mtAccount: trader.mtAccount, hasPassword: !!trader.mtPassword } : 'NOT FOUND');
        if (!trader || !trader.mtAccount || !trader.mtPassword || !trader.mtServer || !trader.mtVersion || !trader.mcLocation) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Trader MT account details incomplete" 
          });
        }

        // Step 1: Create MC account
        console.log(`[createMetaCopierAccount] Calling metaCopierService.createAccount...`);
        const result = await metaCopierService.createAccount({
          accountNumber: trader.mtAccount,
          password: trader.mtPassword,
          server: trader.mtServer,
          location: trader.mcLocation,
          mtVersion: trader.mtVersion,
          name: trader.name,
        });
        console.log(`[createMetaCopierAccount] MetaCopier API result:`, result);

        if (!result.success || !result.accountId) {
          console.log(`[createMetaCopierAccount] Account creation failed:`, result.message);
          return result;
        }

        const mcAccountId = result.accountId;

        try {
          // Step 2: Create copier on slave account to get real magic number
          const SLAVE_ACCOUNT_ID = 'b94cabc8-946d-4a99-9b81-286f8553cc63';
          const copierResult = await metaCopierService.createCopier({
            fromAccountId: mcAccountId,
            toAccountId: SLAVE_ACCOUNT_ID,
          });

          if (!copierResult.success || !copierResult.fromAccountShortId) {
            console.warn('[MC Account Creation] Failed to create copier, magic number not updated');
            return {
              ...result,
              message: `${result.message} (Warning: Could not retrieve magic number)`,
            };
          }

          const realMagic = copierResult.fromAccountShortId;
          const copierId = copierResult.copierId;

          // Step 3: Update database with new magic number, password, and MC account ID
          await updateMagicNumber(trader.id, {
            magicNumber: realMagic,
            password: realMagic,
            mcAccountId: mcAccountId,
          });

          // Step 4: Delete the temporary copier (we only needed it to get the magic number)
          if (copierId) {
            try {
              await metaCopierService.removeCopier(SLAVE_ACCOUNT_ID, copierId);
              console.log(`[MC Account Creation] Deleted temporary copier ${copierId}`);
            } catch (error) {
              console.warn(`[MC Account Creation] Failed to delete copier ${copierId}:`, error);
              // Don't fail the whole process if copier deletion fails
            }
          }

          // Step 5: Rename MC account to "RFX - <name> - <magic>"
          const newAccountName = `RFX - ${trader.name} - ${realMagic}`;
          await metaCopierService.updateAccountName(mcAccountId, newAccountName);

          // Step 6: Add "RFX Trader" label
          await metaCopierService.addAccountLabel(mcAccountId, 'RFX Trader');

          return {
            success: true,
            accountId: mcAccountId,
            magicNumber: realMagic,
            message: `Account created successfully with magic number ${realMagic}`,
          };
        } catch (error: any) {
          console.error('[MC Account Creation] Error in post-creation steps:', error);
          return {
            success: true,
            accountId: mcAccountId,
            message: `Account created but some post-creation steps failed: ${error.message}`,
          };
        }
      }),

    // Get copiers for a trader (where trader is the source)
    getCopiers: tradingProcedure
      .input(z.object({ traderId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const trader = await getMagicNumberById(input.traderId);
        if (!trader) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Trader not found" });
        }

        // Check if trader has MC account
        const mcStatus = await metaCopierService.checkAccountExists(trader.mtAccount || '');
        if (!mcStatus.exists || !mcStatus.accountId) {
          return [];
        }

        const copiers = await metaCopierService.getCopiersBySourceAccount(mcStatus.accountId);
        return copiers;
      }),

    // Update copier status (Disable, Manage, Activate)
    updateCopierStatus: tradingProcedure
      .input(z.object({
        traderId: z.number(),
        toAccountId: z.string(),
        copierId: z.string(),
        status: z.enum(['ACTIVE', 'DISABLED', 'MANAGE']),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
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
      .input(z.object({
        traderId: z.number(),
        toAccountId: z.string(),
        copierId: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        // Check for open positions
        const hasOpenPositions = await metaCopierService.copierHasOpenPositions(input.toAccountId);
        if (hasOpenPositions) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove copier with open positions"
          });
        }

        await metaCopierService.removeCopier(input.toAccountId, input.copierId);

        return { success: true };
      }),

    // Get all accounts with "RFX Master" label
    getRfxMasterAccounts: tradingProcedure
      .query(async ({ ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const accounts = await metaCopierService.getAccountsByLabel('RFX Master');
        return accounts;
      }),

    // Get all traders with their current liveAccountNumber for master assignment UI
    getTradersForMasterAssignment: tradingProcedure
      .query(async ({ ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
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
      .input(z.object({
        masterLoginAccountNumber: z.string(),
        traderIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
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
      .input(z.object({
        traderId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        await updateMagicNumber(input.traderId, { liveAccountNumber: null });
        return { success: true };
      }),

    // Get risk limit for a specific trader (admin use)
    getTraderRiskLimit: tradingProcedure
      .input(z.object({ mcAccountId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const limits = await metaCopierService.getAccountRiskLimits(input.mcAccountId);
        const activeLimit = limits.find((l: any) => l.active && l.absoluteRiskLimit != null);
        return activeLimit
          ? { id: activeLimit.id, absoluteRiskLimit: activeLimit.absoluteRiskLimit as number }
          : null;
      }),

    // Update risk limit for a specific trader (admin use)
    updateTraderRiskLimit: tradingProcedure
      .input(z.object({
        mcAccountId: z.string(),
        absoluteRiskLimit: z.number().positive(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        // Fetch existing limits to find the limit ID to update
        const limits = await metaCopierService.getAccountRiskLimits(input.mcAccountId);
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
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      const breaches = await getAllRiskLimitBreaches();
      const traders = await getAllMagicNumbers();
      return breaches.map(b => {
        const trader = traders.find(t => t.id === b.magicNumberId);
        return {
          id: b.id,
          magicNumberId: b.magicNumberId,
          traderName: trader?.name || 'Unknown',
          magicNumber: trader?.magicNumber || 'N/A',
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
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        await resolveRiskLimitBreach(input.breachId);
        // Re-enable trading by setting isActive = true on the magic number
        await updateMagicNumber(input.magicNumberId, { isActive: true });
        // In-app notification to the trader that trading has been re-enabled
        await createNotification({
          magicNumberId: input.magicNumberId,
          title: "Trading Re-enabled",
          message: "An admin has reviewed your account and re-enabled trading. You may now resume trading.",
          type: "info",
        });
        return { success: true };
      }),

    // Count active (unresolved) risk limit breaches — used for sidebar badge
    countActiveBreaches: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      const count = await countActiveRiskLimitBreaches();
      return { count };
    }),

    // Get breach monitor status (last checked timestamp)
    getBreachMonitorStatus: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return { lastCheckedAt: getLastCheckedAt() };
    }),

    // Bulk resolve all active breaches and re-enable trading for each affected trader
    bulkResolveBreaches: tradingProcedure.mutation(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      // Fetch active breaches before resolving so we can re-enable each trader
      const allBreaches = await getAllRiskLimitBreaches();
      const activeBreaches = allBreaches.filter((b: any) => !b.resolvedAt);

      const resolved = await bulkResolveRiskLimitBreaches();

      // Re-enable trading and notify each affected trader
      for (const breach of activeBreaches) {
        await updateMagicNumber(breach.magicNumberId, { isActive: true });
        await createNotification({
          magicNumberId: breach.magicNumberId,
          title: "Trading Re-enabled",
          message: "An admin has reviewed your account and re-enabled trading. You may now resume trading.",
          type: "info",
        });
      }

      return { resolved };
    }),

    // Get all traders for payment dropdown
    getAllTraders: tradingProcedure.query(async ({ ctx }) => {
      if (!ctx.tradingSession.magicNumber.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
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
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
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
          traderName: trader?.name || 'Unknown',
          magicNumber: trader?.magicNumber || 'N/A',
          network: trader?.usdtNetwork || 'TRC20',
          networkFee: parseFloat(p.networkFee || '0'),
          usdtAddress: trader?.usdtAddress || null,
        };
      });
    }),

    // Make a payment
    makePayment: tradingProcedure
      .input(z.object({
        magicNumberId: z.number(),
        amount: z.number(),
        networkFee: z.number().optional(),
        transactionHash: z.string(),
        paymentDate: z.date(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        // Create payment record
        await createPayment({
          magicNumberId: input.magicNumberId,
          amount: input.amount.toString(),
          networkFee: (input.networkFee || 0).toString(),
          transactionHash: input.transactionHash,
          paymentDate: input.paymentDate,
          notificationSent: true,
        });

        // Get trader info for notification and update lifetime income
        const trader = await getMagicNumberById(input.magicNumberId);
        if (trader) {
          // Update lifetime income
          const currentLifetimeIncome = parseFloat(trader.lifetimeIncome || "0");
          const newLifetimeIncome = currentLifetimeIncome + input.amount;
          await updateMagicNumber(input.magicNumberId, {
            lifetimeIncome: newLifetimeIncome.toFixed(2),
          });
          
          // Create in-app notification for trader
          await createNotification({
            magicNumberId: input.magicNumberId,
            title: "Payment Received",
            message: `You have received a payment of $${input.amount.toFixed(2)}. Transaction hash: ${input.transactionHash}`,
            type: "payment",
            isRead: false,
          });
          console.log(`[Payment] In-app notification sent to ${trader.name} for payment of $${input.amount}`);

          // Send Telegram notification if trader has a handle and chat ID
          if (trader.telegramHandle && trader.telegramChatId) {
            const telegramMsg = buildPaymentMessage({
              traderName: trader.name,
              amount: input.amount,
              network: trader.usdtNetwork || 'TRC20',
              networkFee: input.networkFee || 0,
              transactionHash: input.transactionHash,
              paymentDate: input.paymentDate,
            });
            const sent = await sendTelegramMessage(trader.telegramHandle, telegramMsg, trader.telegramChatId);
            if (sent) {
              console.log(`[Payment] Telegram notification sent to ${trader.telegramHandle}`);
            } else {
              console.warn(`[Payment] Telegram notification failed for ${trader.telegramHandle} — in-app notification still delivered`);
            }
          }
        }

        return { success: true };
      }),

    // Broadcast a message to all connected traders (Telegram + In-App)
    broadcastMessage: tradingProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(2000),
        sendTelegram: z.boolean().default(true),
        sendInApp: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const allTraders = await getAllMagicNumbers();
        let telegramSent = 0;
        let inAppSent = 0;

        for (const trader of allTraders) {
          // In-app notification
          if (input.sendInApp) {
            await createNotification({
              magicNumberId: trader.id,
              title: input.title,
              message: input.message,
              type: "info",
              isRead: false,
            });
            inAppSent++;
          }

          // Telegram notification (only if trader has a connected chat ID)
          if (input.sendTelegram && trader.telegramHandle && trader.telegramChatId) {
            const sent = await sendTelegramMessage(
              trader.telegramHandle,
              `<b>${input.title}</b>\n\n${input.message}`,
              trader.telegramChatId
            );
            if (sent) telegramSent++;
          }
        }

        return { telegramSent, inAppSent, totalTraders: allTraders.length };
      }),

    // Send a direct message to a single trader (Telegram + In-App)
    sendDirectMessage: tradingProcedure
      .input(z.object({
        traderId: z.number(),
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(2000),
        sendTelegram: z.boolean().default(true),
        sendInApp: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const trader = await getMagicNumberById(input.traderId);
        if (!trader) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Trader not found" });
        }

        let telegramSent = false;
        let inAppSent = false;

        if (input.sendInApp) {
          await createNotification({
            magicNumberId: trader.id,
            title: input.title,
            message: input.message,
            type: "info",
            isRead: false,
          });
          inAppSent = true;
        }

        if (input.sendTelegram && trader.telegramHandle && trader.telegramChatId) {
          telegramSent = await sendTelegramMessage(
            trader.telegramHandle,
            `<b>${input.title}</b>\n\n${input.message}`,
            trader.telegramChatId
          );
        }

        return { telegramSent, inAppSent, traderName: trader.name };
      }),
  }),

  // Copier Templates
  copierTemplates: router({
    // Get all copier templates
    list: tradingProcedure
      .query(async () => {
        return await getAllCopierTemplates();
      }),

    // Get a single copier template by ID
    getById: tradingProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await getCopierTemplateById(input.id);
      }),

    // Create a new copier template
    create: tradingProcedure
      .input(z.object({
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
      }))
      .mutation(async ({ input }) => {
        await createCopierTemplate(input);
        return { success: true };
      }),

    // Update a copier template
    update: tradingProcedure
      .input(z.object({
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
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCopierTemplate(id, data);
        return { success: true };
      }),

    // Delete a copier template
    delete: tradingProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteCopierTemplate(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
