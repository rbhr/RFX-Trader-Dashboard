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

  private async fetchWithAuth<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: any): Promise<T> {
    const response = await axios({
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      data,
    });
    return response.data;
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
  }): Promise<{ success: boolean; accountId?: string; message?: string }> {
    try {
      const response = await this.fetchWithAuth<any>(
        '/accounts',
        'POST',
        {
          login: params.accountNumber,
          password: params.password,
          server: params.server,
          platform: params.location, // MT4 or MT5
          name: `Account ${params.accountNumber}`,
        }
      );
      
      return {
        success: true,
        accountId: response.id,
        message: 'Account created successfully',
      };
    } catch (error: any) {
      console.error('[MetaCopier] Error creating account:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to create MetaCopier account',
      };
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
