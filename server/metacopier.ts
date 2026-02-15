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

  constructor() {
    this.apiKey = process.env.METACOPIER_API_KEY || '';
    this.accountId = process.env.METACOPIER_ACCOUNT_ID || '';

    if (!this.apiKey || !this.accountId) {
      console.warn('[MetaCopier] API credentials not configured');
    }
  }

  private async fetchWithAuth<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET', data?: any): Promise<T> {
    try {
      const response = await axios({
        method,
        url: `${API_BASE}${endpoint}`,
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        data,
        timeout: 300000, // 5 minute timeout for account creation
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error(`MetaCopier API timeout after 30 seconds for ${method} ${endpoint}`);
      }
      throw error;
    }
  }

  async getOpenPositions(magicNumber?: string, showAll = false): Promise<Position[]> {
    const positions = await this.fetchWithAuth<Position[]>(
      `/accounts/${this.accountId}/positions`
    );
    
    if (showAll || !magicNumber) {
      return positions;
    }
    
    return positions.filter(p => p.magicNumber === magicNumber);
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
    
    if (showAll || !magicNumber) {
      return positions;
    }
    
    return positions.filter(p => p.magicNumber === magicNumber);
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return this.fetchWithAuth<AccountInfo>(
      `/accounts/${this.accountId}/information`
    );
  }

  /**
   * Check if a MetaCopier account exists by account number
   */
  async checkAccountExists(accountNumber: string): Promise<{ exists: boolean; accountId?: string }> {
    try {
      // List all accounts and check if the account number exists
      const accounts = await this.fetchWithAuth<any[]>('/accounts');
      const account = accounts.find(acc => acc.login === accountNumber || acc.accountNumber === accountNumber);
      
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
            maxLotSizeThreshold: 0,
            enabled: true,
            aggregatePerSymbol: false,
            maxOpenTimeSeconds: 0,
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
      // Get all accounts
      const accounts = await this.fetchWithAuth<any[]>('/accounts');
      const copiers: any[] = [];
      
      // Check each account for copiers that use sourceAccountId as the source
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
   * Update copier status
   */
  async updateCopierStatus(toAccountId: string, copierId: string, status: 'ACTIVE' | 'DISABLED' | 'MANAGE'): Promise<void> {
    try {
      // Map status to MetaCopier status IDs
      const statusMap: Record<string, number> = {
        'ACTIVE': 2,    // Active
        'DISABLED': 3,  // Disabled
        'MANAGE': 4,    // Manage (no new trades)
      };
      
      await this.fetchWithAuth(
        `/accounts/${toAccountId}/copiers/${copierId}`,
        'PUT',
        {
          status: { id: statusMap[status] }
        }
      );
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
  }): Promise<{ success: boolean; copierId?: string; fromAccountShortId?: string; message?: string }> {
    try {
      const response = await this.fetchWithAuth<any>(
        `/accounts/${params.toAccountId}/copiers`,
        'POST',
        {
          fromAccountId: params.fromAccountId,
          status: { id: 2 }, // Active
          copyMode: { id: 1 }, // Copy mode (default)
          lotMultiplier: 1.0,
          maxLotSize: 0,
          minLotSize: 0,
          copyStopLoss: true,
          copyTakeProfit: true,
          reverseSignals: false,
        }
      );
      
      return {
        success: true,
        copierId: response.id,
        fromAccountShortId: response.fromAccountShortId,
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
        riskType: 4, // Actual (changed from nested object to number)
        absoluteRiskLimit: 300.0,
        fulfillSeconds: 1,
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
   * Get all accounts with a specific label
   */
  async getAccountsByLabel(label: string): Promise<any[]> {
    try {
      const accounts = await this.fetchWithAuth<any[]>('/accounts', 'GET');
      
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
}

export const metaCopierService = new MetaCopierService();

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
