import axios from 'axios';

const API_BASE = 'https://api.metacopier.io/rest/api/v1';

export interface Position {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  closePrice?: number;
  profit: number;
  swap: number;
  commission: number;
  magicNumber: string;
  openTime: string;
  closeTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
}

export interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  profit: number;
  currency: string;
  leverage: number;
  name: string;
  server: string;
  company: string;
}

class MetaCopierService {
  private apiKey: string;
  private accountId: string;
  private accountsCache: { data: any[] | null; fetchedAt: number } = {
    data: null,
    fetchedAt: 0,
  };
  private accountsCachePromise: Promise<any[]> | null = null;
  private static ACCOUNTS_CACHE_TTL = 30_000; // 30 seconds

  constructor() {
    this.apiKey = process.env.METACOPIER_API_KEY || '';
    this.accountId = process.env.METACOPIER_ACCOUNT_ID || '';

    if (!this.apiKey || !this.accountId) {
      console.warn('[MetaCopier] API credentials not configured');
    }
  }

  private async getCachedAccounts(): Promise<any[]> {
    const now = Date.now();
    if (
      this.accountsCache.data &&
      now - this.accountsCache.fetchedAt < MetaCopierService.ACCOUNTS_CACHE_TTL
    ) {
      return this.accountsCache.data;
    }
    if (this.accountsCachePromise) return this.accountsCachePromise;
    this.accountsCachePromise = this.fetchWithAuth<any[]>('/accounts', 'GET')
      .then(accounts => {
        this.accountsCache = { data: accounts, fetchedAt: Date.now() };
        this.accountsCachePromise = null;
        return accounts;
      })
      .catch(err => {
        this.accountsCachePromise = null;
        throw err;
      });
    return this.accountsCachePromise;
  }

  private async fetchWithAuth<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET', data?: any): Promise<T> {
    const maxRetries = 4;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios({
          method,
          url: `${API_BASE}${endpoint}`,
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          data,
          timeout: 300000,
        });
        return response.data;
      } catch (error: any) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          throw new Error(`MetaCopier API timeout for ${method} ${endpoint}`);
        }
        if (error.response?.status === 429 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`MetaCopier API failed after ${maxRetries} retries for ${method} ${endpoint}`);
  }

  async getOpenPositions(magicNumber?: string, showAll = false): Promise<Position[]> {
    const positions = await this.fetchWithAuth<Position[]>(
      `/accounts/${this.accountId}/positions`
    );

    if (!Array.isArray(positions)) return [];

    if (showAll || !magicNumber) {
      return positions;
    }

    return positions.filter(p => String(p.magicNumber) === String(magicNumber));
  }

  async getOpenPositionsFromAccount(accountId: string, magicNumber?: string): Promise<Position[]> {
    const positions = await this.fetchWithAuth<Position[]>(
      `/accounts/${accountId}/positions`
    );

    if (!Array.isArray(positions)) return [];

    if (!magicNumber) {
      return positions;
    }

    return positions.filter(p => String(p.magicNumber) === String(magicNumber));
  }

  async getHistoricalPositions(
    start: string,
    stop: string,
    magicNumber?: string,
    showAll = false
  ): Promise<Position[]> {
    const positions = await this.fetchWithAuth<Position[]>(
      `/accounts/${this.accountId}/history/positions?start=${encodeURIComponent(start)}&stop=${encodeURIComponent(stop)}`
    );

    if (!Array.isArray(positions)) return [];

    if (showAll || !magicNumber) {
      return positions;
    }

    return positions.filter(p => String(p.magicNumber) === String(magicNumber));
  }

  async getHistoricalPositionsFromAccount(
    accountId: string,
    start: string,
    stop: string,
    magicNumber?: string
  ): Promise<Position[]> {
    const positions = await this.fetchWithAuth<Position[]>(
      `/accounts/${accountId}/history/positions?start=${encodeURIComponent(start)}&stop=${encodeURIComponent(stop)}`
    );

    if (!Array.isArray(positions)) return [];

    if (!magicNumber) {
      return positions;
    }

    return positions.filter(p => String(p.magicNumber) === String(magicNumber));
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return this.fetchWithAuth<AccountInfo>(
      `/accounts/${this.accountId}/information`
    );
  }

  async getAccountInfoById(accountId: string): Promise<AccountInfo> {
    return this.fetchWithAuth<AccountInfo>(
      `/accounts/${accountId}/information`
    );
  }

  /**
   * Check if a MetaCopier account exists by account number
   */
  async checkAccountExists(accountNumber: string): Promise<{ exists: boolean; accountId?: string }> {
    try {
      const accounts = await this.getCachedAccounts();
      const account = accounts.find(
        acc =>
          acc.loginAccountNumber === accountNumber ||
          acc.login === accountNumber ||
          acc.accountNumber === accountNumber
      );
      
      if (account) {
        return { exists: true, accountId: account.id };
      }
      return { exists: false };
    } catch (error) {
      console.error('[MetaCopier] Error checking account:', error);
      throw new Error('Failed to check MetaCopier account status');
    }
  }

  /**
   * Create a new MetaCopier account
   */
  async createAccount(params: {
    accountNumber: string;
    password: string;
    server: string;
    location: string;
    mtVersion: string;
    name: string;
  }): Promise<{ success: boolean; accountId?: string; message?: string }> {
    try {
      // Map location to region ID
      const regionMap: Record<string, number> = {
        'London': 2,
        'New York': 1,
        'Berlin': 3,
        'Singapore': 4,
      };
      
      // Map MT version to type ID
      const typeMap: Record<string, number> = {
        'MT4': 0,
        'MT5': 1,
      };
      
      const response = await this.fetchWithAuth<any>(
        '/accounts',
        'POST',
        {
          alias: `RFX - ${params.name}`,
          loginAccountNumber: params.accountNumber,
          loginAccountPassword: params.password,
          loginServer: params.server,
          type: { id: typeMap[params.mtVersion] || 1 },
          region: { id: regionMap[params.location] || 2 },
          skipCredentialCheck: true, // Skip broker validation to speed up creation
        }
      );
      
      const accountId = response.id;
      
      // Add features: HFT mode, Socket, Trade guardrails, Data collector
      await this.addAccountFeatures(accountId);
      
      // Add risk limit: Actual, Absolute $300, fulfil in 1 second, close all
      await this.addRiskLimit(accountId);
      
      return {
        success: true,
        accountId,
        message: 'Account created successfully with features and risk limits',
      };
    } catch (error: any) {
      const errorDetails = {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        accountNumber: params.accountNumber,
        server: params.server,
      };
      console.error('[MetaCopier] Error creating account:', JSON.stringify(errorDetails, null, 2));
      
      // Also write to file for debugging
      try {
        console.error('[MC Account Creation Error]', errorDetails);
      } catch (logError) {
        console.error('Failed to write error log:', logError);
      }
      
      const errorMsg = error.response?.data?.message || error.message || 'Failed to create MetaCopier account';
      return {
        success: false,
        message: errorMsg,
      };
    }
  }

  /**
   * Add features to a MetaCopier account
   */
  private async addAccountFeatures(accountId: string): Promise<void> {
    try {
      // HFT mode (type 24)
      await this.fetchWithAuth(
        `/accounts/${accountId}/features`,
        'POST',
        {
          type: { id: 24 },
          setting: { activateHftMode: true }
        }
      );

      // Socket (type 25)
      await this.fetchWithAuth(
        `/accounts/${accountId}/features`,
        'POST',
        {
          type: { id: 25 },
          setting: { activateSocket: true }
        }
      );

      // Trade guardrails (type 37)
      await this.fetchWithAuth(
        `/accounts/${accountId}/features`,
        'POST',
        {
          type: { id: 37 },
          setting: {
            maxLotSizeThreshold: 0.01,
            enabled: true,
            aggregatePerSymbol: false,
            maxOpenTimeSeconds: 0,
            symbolsConfiguration: {}
          }
        }
      );

      // Max open positions (type 17)
      await this.fetchWithAuth(
        `/accounts/${accountId}/features`,
        'POST',
        {
          type: { id: 17 },
          setting: {
            maxOpenPositions: 3,
            maxPositionsInTimeWindow: 0,
            timeWindowSeconds: 0,
            symbolsConfiguration: {}
          }
        }
      );

      // Data collector (type 35)
      await this.fetchWithAuth(
        `/accounts/${accountId}/features`,
        'POST',
        {
          type: { id: 35 },
          setting: {
            activateDataCollector: true,
            collectionIntervalSeconds: 60,
            recordEquity: true,
            recordBalance: true,
            recordFloatingPnL: true,
            normalizeValues: false,
            retentionDays: 90
          }
        }
      );

      console.log(`[MetaCopier] Added features to account ${accountId}`);
    } catch (error) {
      console.error('[MetaCopier] Error adding features:', error);
      // Don't throw - account is created, features are optional
    }
  }

  /**
   * Get all copiers where the specified account is the source
   */
  async getCopiersBySourceAccount(sourceAccountId: string): Promise<any[]> {
    try {
      const accounts = await this.getCachedAccounts();
      const copiers: any[] = [];
      for (const account of accounts) {
        if (account.countCopier && account.countCopier > 0) {
          const accountCopiers = await this.fetchWithAuth<any[]>(
            `/accounts/${account.id}/copiers`
          );
          
          for (const copier of accountCopiers) {
            if (copier.fromAccountId === sourceAccountId) {
              copiers.push({
                ...copier,
                toAccountId: account.id,
                toAccountAlias: account.alias,
              });
            }
          }
        }
      }
      
      return copiers;
    } catch (error) {
      console.error('[MetaCopier] Error fetching copiers:', error);
      throw new Error('Failed to fetch copiers');
    }
  }

  /**
   * Get all copiers for a specific account
   */
  async getCopiersByAccount(accountId: string): Promise<any[]> {
    try {
      const copiers = await this.fetchWithAuth<any[]>(
        `/accounts/${accountId}/copiers`
      );
      return copiers;
    } catch (error) {
      console.error('[MetaCopier] Error fetching copiers for account:', error);
      return [];
    }
  }

  /**
   * Read-modify-write a copier: the copier PUT endpoint REPLACES the whole
   * config — any field omitted reverts to its default (scaleType -> Balance,
   * copyMagicNumber -> false, customMagicNumber -> cleared, etc.). So we GET the
   * current copier and PUT it back with only `changes` overridden, preserving
   * every other setting.
   */
  private async patchCopier(toAccountId: string, copierId: string, changes: Record<string, unknown>): Promise<void> {
    const current = await this.fetchWithAuth<any>(
      `/accounts/${toAccountId}/copiers/${copierId}`,
      'GET'
    );
    await this.fetchWithAuth(
      `/accounts/${toAccountId}/copiers/${copierId}`,
      'PUT',
      { ...current, ...changes }
    );
  }

  /**
   * Update copier status. Enable/disable is the `active` boolean (and
   * `monitorOnly` for Manage) — the API ignores a `status: { id }` field on
   * copiers. Uses read-modify-write so toggling never wipes the copier's other
   * settings (scaleType, copyMagicNumber, customMagicNumber, …).
   */
  async updateCopierStatus(toAccountId: string, copierId: string, status: 'ACTIVE' | 'DISABLED' | 'MANAGE'): Promise<void> {
    try {
      const changes =
        status === 'DISABLED'
          ? { active: false }
          : status === 'MANAGE'
            ? { active: true, monitorOnly: true }
            : { active: true, monitorOnly: false }; // ACTIVE
      await this.patchCopier(toAccountId, copierId, changes);
    } catch (error) {
      console.error('[MetaCopier] Error updating copier status:', error);
      throw new Error('Failed to update copier status');
    }
  }

  /**
   * Remove a copier
   */
  async removeCopier(toAccountId: string, copierId: string): Promise<void> {
    try {
      await this.fetchWithAuth(
        `/accounts/${toAccountId}/copiers/${copierId}`,
        'DELETE'
      );
    } catch (error) {
      console.error('[MetaCopier] Error removing copier:', error);
      throw new Error('Failed to remove copier');
    }
  }

  /**
   * Check if copier has open positions
   */
  async copierHasOpenPositions(toAccountId: string): Promise<boolean> {
    try {
      const positions = await this.fetchWithAuth<any[]>(
        `/accounts/${toAccountId}/positions`
      );
      return positions.length > 0;
    } catch (error) {
      console.error('[MetaCopier] Error checking open positions:', error);
      return false; // Assume no positions on error
    }
  }

  /**
   * Create a copier on a slave account
   */
  async createCopier(params: {
    fromAccountId: string;
    toAccountId: string;
    status?: 'ACTIVE' | 'DISABLED' | 'MANAGE';
  }): Promise<{ success: boolean; copierId?: string; fromAccountShortId?: string; message?: string }> {
    try {
      const response = await this.fetchWithAuth<any>(
        `/accounts/${params.toAccountId}/copiers`,
        'POST',
        {
          fromAccountId: params.fromAccountId,
          scaleType: { id: 4 }, // No scaling
          lotMultiplier: 1.0,
          maxLotSize: 0,
          minLotSize: 0,
          copyStopLoss: true,
          copyTakeProfit: true,
          copyMagicNumber: true, // use a custom magic number (set below)
          reverseSignals: false,
        }
      );

      const copierId = response.id;
      const shortId = response.fromAccountShortId;

      // The create (POST) endpoint ignores scaleType, copyMagicNumber and the
      // active/monitorOnly state — copiers come back as scaleType 1 (Balance),
      // copyMagicNumber false, and active. They must be set via a follow-up PUT.
      // Use read-modify-write (patchCopier) so the PUT doesn't wipe the other
      // settings the POST applied (copyStopLoss/copyTakeProfit, etc.).
      if (copierId) {
        try {
          const status = params.status ?? 'ACTIVE';
          const settings: Record<string, unknown> = {
            scaleType: { id: 4 }, // No scaling
            copyMagicNumber: true,
            copyStopLoss: true,
            copyTakeProfit: true,
            // Enable/disable is the `active` boolean (status:{id} is ignored).
            active: status !== 'DISABLED',
            monitorOnly: status === 'MANAGE',
          };
          // Set the custom magic number to the trader's magic (the source short id)
          if (shortId !== undefined && shortId !== null) {
            settings.customMagicNumber = shortId;
          }
          await this.patchCopier(params.toAccountId, copierId, settings);
        } catch (e) {
          console.warn(
            `[MetaCopier] Failed to set scale/magic number on copier ${copierId}:`,
            e
          );
        }
      }

      // Add "Skip position if SL or TP missing" feature (type 31)
      if (copierId) {
        try {
          await this.addCopierSkipPositionFeature(params.toAccountId, copierId);
        } catch (e) {
          console.warn(
            `[MetaCopier] Failed to add skip-position feature on copier ${copierId}:`,
            e
          );
        }
      }

      return {
        success: true,
        copierId,
        fromAccountShortId: shortId,
        message: 'Copier created successfully',
      };
    } catch (error: any) {
      console.error('[MetaCopier] Error creating copier:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to create copier',
      };
    }
  }

  /**
   * Add the "Skip position" feature (type 31) to a copier so positions are
   * skipped if either SL or TP is missing on the master. Idempotent: does not
   * add a second copy if a type-31 feature already exists.
   */
  async addCopierSkipPositionFeature(
    toAccountId: string,
    copierId: string
  ): Promise<void> {
    const existing = await this.fetchWithAuth<any[]>(
      `/accounts/${toAccountId}/copiers/${copierId}/features`,
      'GET'
    ).catch(() => [] as any[]);
    if (existing.some(f => f?.type?.id === 31)) return;

    await this.fetchWithAuth(
      `/accounts/${toAccountId}/copiers/${copierId}/features`,
      'POST',
      {
        type: { id: 31 },
        setting: {
          ifSlNotDefined: true,
          ifTpNotDefined: true,
          logicOperatorTpSl: 'OR',
          symbolsConfiguration: {},
        },
      }
    );
  }

  /**
   * Update account name/alias
   */
  async updateAccountName(accountId: string, name: string): Promise<void> {
    try {
      console.log(`[MetaCopier] Attempting to update account ${accountId} name to "${name}"`);
      
      // Try PATCH first (partial update)
      try {
        await this.fetchWithAuth(
          `/accounts/${accountId}`,
          'PATCH',
          { alias: name }
        );
        console.log(`[MetaCopier] Successfully updated account ${accountId} name via PATCH`);
        return;
      } catch (patchError: any) {
        console.warn(`[MetaCopier] PATCH failed, trying PUT with full account data:`, patchError.response?.data || patchError.message);
      }
      
      // Fallback to PUT with full account data
      const account = await this.fetchWithAuth<any>(
        `/accounts/${accountId}`,
        'GET'
      );
      console.log(`[MetaCopier] Retrieved account data, current alias: "${account.alias}"`);
      
      await this.fetchWithAuth(
        `/accounts/${accountId}`,
        'PUT',
        {
          ...account,
          alias: name,
        }
      );
      console.log(`[MetaCopier] Successfully updated account ${accountId} name via PUT`);
    } catch (error: any) {
      const errorDetails = {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
      };
      console.error('[MetaCopier] Error updating account name:', JSON.stringify(errorDetails, null, 2));
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      throw new Error(`Failed to update account name: ${errorMsg}`);
    }
  }

  /**
   * Add label to account
   */
  async addAccountLabel(accountId: string, label: string): Promise<void> {
    try {
      // Get current account data
      const account = await this.fetchWithAuth<any>(`/accounts/${accountId}`, 'GET');
      
      // Add the new label if it doesn't already exist
      const currentLabels = account.labels || [];
      if (!currentLabels.includes(label)) {
        currentLabels.push(label);
      }
      
      // Update account with new labels array using PUT
      await this.fetchWithAuth(
        `/accounts/${accountId}`,
        'PUT',
        {
          ...account,
          labels: currentLabels,
        }
      );
      console.log(`[MetaCopier] Added label "${label}" to account ${accountId}`);
    } catch (error) {
      console.error('[MetaCopier] Error adding label:', error);
      throw new Error('Failed to add label to account');
    }
  }

  /**
   * Add risk limit to a MetaCopier account
   */
  private async addRiskLimit(accountId: string): Promise<void> {
    try {
      const riskLimitData = {
        riskType: { id: 4 }, // Actual - must be object format
        riskLimit: 0.0, // Required field - relative risk limit
        absoluteRiskLimit: 1000.0, // Absolute dollar amount
        fulfillSeconds: 1, // Close positions within 1 second
        closeAllOpenPositions: true,
        active: true
      };
      

      console.log(`[MetaCopier] Adding risk limit to account ${accountId}:`, riskLimitData);
      
      const response = await this.fetchWithAuth(
        `/accounts/${accountId}/riskLimits`,
        'POST',
        riskLimitData
      );


      console.log(`[MetaCopier] Risk limit added successfully:`, response);
    } catch (error: any) {

      console.error('[MetaCopier] Error adding risk limit:', {
        accountId,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      // Don't throw - account is created, risk limit is optional
    }
  }

  /**
   * Get account by ID
   */
  async getAccountById(accountId: string): Promise<any> {
    try {
      const account = await this.fetchWithAuth<any>(`/accounts/${accountId}`, 'GET');
      return account;
    } catch (error) {
      console.error('[MetaCopier] Error fetching account by ID:', error);
      throw new Error('Account not found');
    }
  }

  /**
   * Get account features by account ID
   */
  async getAccountFeatures(accountId: string): Promise<any[]> {
    try {
      const features = await this.fetchWithAuth<any[]>(`/accounts/${accountId}/features`, 'GET');
      return features || [];
    } catch (error) {
      console.error('[MetaCopier] Error fetching account features:', error);
      return [];
    }
  }

  /**
   * Get all accounts with a specific label
   */
  async getAccountsByLabel(label: string): Promise<any[]> {
    try {
      const accounts = await this.getCachedAccounts();
      
      // Filter accounts that have the specified label
      const filteredAccounts = accounts.filter((account: any) => {
        return account.labels && account.labels.includes(label);
      });
      
      return filteredAccounts.map((account: any) => ({
        id: account.id,
        alias: account.alias,
        loginAccountNumber: account.loginAccountNumber,
        status: account.status?.name,
      }));
    } catch (error) {
      console.error('[MetaCopier] Error fetching accounts by label:', error);
      throw new Error('Failed to fetch accounts');
    }
  }

  /**
   * Get risk limits for an account
   */
  async getAccountRiskLimits(accountId: string): Promise<any[]> {
    try {
      const limits = await this.fetchWithAuth<any[]>(`/accounts/${accountId}/riskLimits`, 'GET');
      return limits || [];
    } catch (error) {
      console.error('[MetaCopier] Error fetching account risk limits:', error);
      return [];
    }
  }

  /**
   * Update an existing risk limit on an account
   */
  async updateAccountRiskLimit(accountId: string, limitId: string, absoluteRiskLimit: number): Promise<void> {
    try {
      const existing = (await this.fetchWithAuth<any[]>(`/accounts/${accountId}/riskLimits`, 'GET')) || [];
      const current = existing.find((l: any) => l.id === limitId) || {};
      await this.fetchWithAuth(
        `/accounts/${accountId}/riskLimits/${limitId}`,
        'PUT',
        {
          ...current,
          absoluteRiskLimit,
          riskType: current.riskType || { id: 4 },
          riskLimit: current.riskLimit ?? 0.0,
          fulfillSeconds: current.fulfillSeconds ?? 1,
          closeAllOpenPositions: current.closeAllOpenPositions ?? true,
          active: true,
        }
      );
    } catch (error: any) {
      console.error('[MetaCopier] Error updating risk limit:', error);
      throw new Error('Failed to update risk limit');
    }
  }

  /**
   * Create a new risk limit on an account
   */
  async createAccountRiskLimit(accountId: string, absoluteRiskLimit: number): Promise<void> {
    try {
      await this.fetchWithAuth(
        `/accounts/${accountId}/riskLimits`,
        'POST',
        {
          riskType: { id: 4 },
          riskLimit: 0.0,
          absoluteRiskLimit,
          fulfillSeconds: 1,
          closeAllOpenPositions: true,
          active: true,
        }
      );
    } catch (error: any) {
      console.error('[MetaCopier] Error creating risk limit:', error);
      throw new Error('Failed to create risk limit');
    }
  }

  /**
   * Get MetaCopier account ID by login account number
   */
  async getAccountIdByLoginNumber(loginAccountNumber: string): Promise<string | null> {
    try {
      const accounts = await this.getCachedAccounts();
      const account = accounts.find((acc: any) => acc.loginAccountNumber === loginAccountNumber);
      return account?.id || null;
    } catch (error) {
      console.error('[MetaCopier] Error fetching account by login number:', error);
      return null;
    }
  }
}

export const metaCopierService = new MetaCopierService();

// The fixed demo/slave account used for magic-number routing. Its copiers must
// never be toggled by trader-facing flows.
const SLAVE_ACCOUNT_ID = 'b94cabc8-946d-4a99-9b81-286f8553cc63';

/**
 * Enable (set ACTIVE) all LIVE copiers where this trader is the source — every
 * copier on any account that copies from the trader's MetaCopier (incubator)
 * account, EXCLUDING the demo/slave account (left alone for magic routing).
 * Used when a trader finishes onboarding. Idempotent: enabling an already-active
 * copier is a harmless no-op. Per-copier failures are logged and skipped so one
 * bad copier doesn't abort the rest.
 */
export async function enableTraderLiveCopiers(trader: {
  mcAccountId?: string | null;
  isActive?: boolean | null;
  magicNumber?: string | null;
}): Promise<{ enabled: number; skipped: boolean; reason?: string }> {
  if (!trader.isActive) return { enabled: 0, skipped: true, reason: 'inactive' };
  if (!trader.mcAccountId) return { enabled: 0, skipped: true, reason: 'no-mc-account' };

  const copiers = await metaCopierService.getCopiersBySourceAccount(trader.mcAccountId);
  let enabled = 0;
  for (const c of copiers) {
    if (c.toAccountId === SLAVE_ACCOUNT_ID) continue; // never touch the demo copier
    try {
      await metaCopierService.updateCopierStatus(c.toAccountId, c.id, 'ACTIVE');
      enabled++;
    } catch (e) {
      console.warn(
        `[MetaCopier] enableTraderLiveCopiers: failed to enable copier ${c.id} on ${c.toAccountId}:`,
        e
      );
    }
  }
  console.log(
    `[MetaCopier] enableTraderLiveCopiers: enabled ${enabled}/${copiers.length} copier(s) for magic ${trader.magicNumber}`
  );
  return { enabled, skipped: false };
}

// P&L calculation helper
export function calculatePnL(positions: Position[]): number {
  return positions.reduce((sum, pos) => {
    const profit = pos.profit ?? 0;
    const swap = pos.swap ?? 0;
    const commission = pos.commission ?? 0;
    return sum + profit + swap + commission;
  }, 0);
}

// Date helper functions
export function getStartOfToday(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

export function getEndOfToday(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return end.toISOString();
}

export function getStartOfWeek(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  return start.toISOString();
}

export function getStartOfMonth(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.toISOString();
}

export function getAllTimeStart(): string {
  return new Date(2020, 0, 1).toISOString();
}
