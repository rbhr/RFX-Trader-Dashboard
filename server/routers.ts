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
  markAllNotificationsAsRead
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
      .query(async () => {
        const accounts = await metaCopierService.getAccountsByLabel('RFX Master');
        return accounts;
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
          console.log(`[Payment] Notification sent to ${trader.name} for payment of $${input.amount}`);
        }

        return { success: true };
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
