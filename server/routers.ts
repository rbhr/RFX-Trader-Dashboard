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
  createMagicNumber
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
      };
    }),

    // Get open positions
    getOpenPositions: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData } = ctx.tradingSession.magicNumber;
      const positions = await metaCopierService.getOpenPositions(
        showAllData ? undefined : magicNumber,
        showAllData
      );
      return positions;
    }),

    // Get today's closed positions
    getTodayPositions: tradingProcedure.query(async ({ ctx }) => {
      const { magicNumber, showAllData } = ctx.tradingSession.magicNumber;
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
      const { magicNumber, showAllData } = ctx.tradingSession.magicNumber;
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
      const { magicNumber, showAllData } = ctx.tradingSession.magicNumber;
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
      const { magicNumber, showAllData } = ctx.tradingSession.magicNumber;
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
      const { magicNumber, showAllData, profitShare } = ctx.tradingSession.magicNumber;
      
      const [openPositions, todayPositions, weekPositions, monthPositions, allTimePositions] = await Promise.all([
        metaCopierService.getOpenPositions(showAllData ? undefined : magicNumber, showAllData),
        metaCopierService.getHistoricalPositions(getStartOfToday(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
        metaCopierService.getHistoricalPositions(getStartOfWeek(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
        metaCopierService.getHistoricalPositions(getStartOfMonth(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
        metaCopierService.getHistoricalPositions(getAllTimeStart(), getEndOfToday(), showAllData ? undefined : magicNumber, showAllData),
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
        mtLocation: t.mtLocation,
        lifetimeProfit: t.lifetimeProfit ? parseFloat(t.lifetimeProfit) : 0,
        lifetimeProfitShare: t.lifetimeProfitShare ? parseFloat(t.lifetimeProfitShare) : 0,
        lifetimeIncome: t.lifetimeIncome ? parseFloat(t.lifetimeIncome) : 0,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
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
        mtLocation: z.string().optional(),
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
          mtLocation: input.mtLocation || null,
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
        mtLocation: z.string().optional(),
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
        if (data.mtLocation !== undefined) updateData.mtLocation = data.mtLocation;
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
        if (!ctx.tradingSession.magicNumber.isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }

        const trader = await getMagicNumberById(input.traderId);
        if (!trader || !trader.mtAccount || !trader.mtPassword || !trader.mtServer || !trader.mtLocation) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Trader MT account details incomplete" 
          });
        }

        const result = await metaCopierService.createAccount({
          accountNumber: trader.mtAccount,
          password: trader.mtPassword,
          server: trader.mtServer,
          location: trader.mtLocation,
        });

        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
